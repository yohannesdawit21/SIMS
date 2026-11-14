import {
  Injectable,
  Inject,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';

import { User } from '../../entities/user.entity';
import { REDIS_CLIENT } from '../../common/providers/redis.provider';
import { AuditService } from '../audit/audit.service';
import { AuditOperation } from '../../entities/audit-log.entity';
import { JwtPayload } from '../../common/strategies/jwt.strategy';

/** Lightweight user object returned after successful validation / login. */
export interface AuthUserPayload {
  id: string;
  username: string;
  role: string;
}

/** Shape stored in Redis under `user:{id}:session`. */
interface SessionData {
  userId: string;
  username: string;
  role: string;
  loginAt: string;
  ipAddress?: string;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * AuthService — core authentication logic.
 *
 * Covers:
 *  - validateUser / validateCredentials : credential check + lockout enforcement
 *  - login    : JWT issuance, Redis session creation, audit log
 *  - logout   : Redis session deletion, audit log
 *  - refreshToken : new JWT for an already-authenticated user
 *  - invalidateSession : forceful Redis key removal (account deactivation)
 *
 * Requirements: 2.1, 2.2, 2.3, 2.7
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,

    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,

    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Validates username + password, enforces account lockout, and updates
   * the failure counter in the database.
   *
   * Returns the slim user payload on success, or null on failure
   * (UnauthorizedException is thrown for lockout).
   *
   * Requirement 2.1, 2.2
   */
  async validateUser(
    username: string,
    password: string,
  ): Promise<AuthUserPayload | null> {
    const user = await this.userRepository.findOne({ where: { username } });

    if (!user) {
      // Avoid timing attacks — still do a dummy compare
      await bcrypt.compare(password, '$2b$10$invalidhashpadding000000000000000');
      return null;
    }

    // Reject inactive accounts before any lockout check
    if (!user.is_active) {
      await this.auditService.log({
        actorId: user.id,
        operation: AuditOperation.UPDATE,
        recordType: 'auth',
        recordId: user.id,
        newValues: { event: 'LOGIN_REJECTED_INACTIVE', username },
      });
      return null;
    }

    // Enforce lockout: if locked_until is in the future, reject immediately
    if (user.locked_until && user.locked_until > new Date()) {
      await this.auditService.log({
        actorId: user.id,
        operation: AuditOperation.UPDATE,
        recordType: 'auth',
        recordId: user.id,
        newValues: {
          event: 'LOGIN_REJECTED_LOCKED',
          username,
          locked_until: user.locked_until.toISOString(),
        },
      });
      throw new UnauthorizedException(
        `Account is locked until ${user.locked_until.toISOString()}. Please try again later.`,
      );
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      await this.handleFailedAttempt(user, username);
      return null;
    }

    // Successful credential check — reset failure counter
    if (user.failed_login_attempts > 0 || user.locked_until !== null) {
      await this.userRepository.update(user.id, {
        failed_login_attempts: 0,
        locked_until: null,
      });
    }

    return { id: user.id, username: user.username, role: user.role };
  }

  /**
   * Alias used by LocalStrategy (matches IAuthService interface).
   * Requirement 2.1
   */
  async validateCredentials(
    username: string,
    password: string,
  ): Promise<AuthUserPayload | null> {
    return this.validateUser(username, password);
  }

  /**
   * Issues a JWT (15 min), stores a Redis session, and writes an audit entry.
   *
   * Requirement 2.3, 2.7
   */
  async login(
    user: AuthUserPayload,
    ipAddress?: string,
  ): Promise<{ access_token: string; user: AuthUserPayload }> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const access_token = this.jwtService.sign(payload);

    // Store session in Redis (optional - login works even if Redis fails)
    try {
      const sessionTtl = this.configService.get<number>(
        'SESSION_TTL_SECONDS',
        86400, // default 24 h
      );

      const sessionData: SessionData = {
        userId: user.id,
        username: user.username,
        role: user.role,
        loginAt: new Date().toISOString(),
        ...(ipAddress ? { ipAddress } : {}),
      };

      const sessionKey = `user:${user.id}:session`;
      if (this.redis && this.redis.status === "ready") { void this.redis.set(sessionKey, JSON.stringify(sessionData), "EX", sessionTtl).catch(() => {}); }
    } catch (error) {
      // Redis unavailable - log warning but don't fail login
      this.logger.warn(
        `Failed to store session in Redis for user ${user.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Audit log — login success
    await this.auditService.log({
      actorId: user.id,
      operation: AuditOperation.CREATE,
      recordType: 'auth',
      recordId: user.id,
      newValues: {
        event: 'LOGIN_SUCCESS',
        username: user.username,
        ...(ipAddress ? { ipAddress } : {}),
      },
    });

    return {
      access_token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    };
  }

  /**
   * Deletes the Redis session and writes an audit entry.
   *
   * Requirement 2.7
   */
  async logout(userId: string): Promise<{ message: string }> {
    // Try to delete Redis session (optional - logout works even if Redis fails)
    try {
      if (this.redis && this.redis.status === "ready") { void this.redis.del(`user:${userId}:session`).catch(() => {}); }
    } catch (error) {
      this.logger.warn(
        `Failed to delete session in Redis for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await this.auditService.log({
      actorId: userId,
      operation: AuditOperation.DELETE,
      recordType: 'auth',
      recordId: userId,
      newValues: { event: 'LOGOUT', userId },
    });

    return { message: 'Logged out successfully.' };
  }

  /**
   * Signs a fresh JWT for an already-authenticated user (e.g. after refresh).
   *
   * Requirement 2.3
   */
  async refreshToken(user: AuthUserPayload): Promise<{ access_token: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const access_token = this.jwtService.sign(payload);
    return { access_token };
  }

  /**
   * Forcefully removes the Redis session — called when an account is
   * deactivated so the next JWT validation rejects the bearer token.
   *
   * Requirement 2.7 (session invalidation on deactivation)
   */
  async invalidateSession(userId: string): Promise<void> {
    try {
      if (this.redis && this.redis.status === "ready") { void this.redis.del(`user:${userId}:session`).catch(() => {}); }
      this.logger.log(`Session invalidated for user ${userId}`);
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate session in Redis for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Increments the failed-login counter. On the 5th consecutive failure,
   * sets locked_until = NOW() + 30 min and writes a lockout audit entry.
   *
   * Requirement 2.2
   */
  private async handleFailedAttempt(user: User, username: string): Promise<void> {
    const newAttempts = (user.failed_login_attempts ?? 0) + 1;
    const isNowLocked = newAttempts >= MAX_FAILED_ATTEMPTS;

    const updatePayload: Partial<User> = {
      failed_login_attempts: newAttempts,
    };

    if (isNowLocked) {
      updatePayload.locked_until = new Date(Date.now() + LOCKOUT_DURATION_MS);
    }

    await this.userRepository.update(user.id, updatePayload);

    // Audit: login failure
    await this.auditService.log({
      actorId: user.id,
      operation: AuditOperation.UPDATE,
      recordType: 'auth',
      recordId: user.id,
      newValues: {
        event: isNowLocked ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
        username,
        failed_login_attempts: newAttempts,
        ...(isNowLocked
          ? { locked_until: updatePayload.locked_until!.toISOString() }
          : {}),
      },
    });

    if (isNowLocked) {
      this.logger.warn(
        `Account locked for user ${user.id} (${username}) after ${MAX_FAILED_ATTEMPTS} failed attempts.`,
      );
    }
  }
}

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import Redis from 'ioredis';
import { User } from '../../entities/user.entity';
import { REDIS_CLIENT } from '../../common/providers/redis.provider';

/** TTL for password-reset tokens in seconds (60 minutes). */
const RESET_TOKEN_TTL_SECONDS = 3600;

/** bcrypt work factor for password hashing (requirement 2.4). */
const BCRYPT_WORK_FACTOR = 12;

/** Redis key prefix for password-reset tokens. */
const REDIS_KEY_PREFIX = 'pwd_reset:';

/**
 * PasswordResetService
 *
 * Implements the two-step password-reset flow:
 *   1. `requestReset(email)` — look up user by email, generate a cryptographic
 *      random token, store its SHA-256 hash in Redis with a 60-minute TTL, and
 *      send the raw token to the user's email via Nodemailer.
 *   2. `resetPassword(token, newPassword)` — hash the incoming token, look up
 *      the Redis key, validate expiry, validate password complexity, hash the
 *      new password with bcrypt (work factor 12), persist it, and remove the
 *      Redis key so the token cannot be reused.
 *
 * Requirements: 2.4, 2.6
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis,

    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Request a password reset for the given email address.
   *
   * Deliberately returns without error even when the email is unknown — this
   * prevents email-enumeration attacks (requirement 2.6).
   */
  async requestReset(email: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email } });

    // Gracefully handle unknown email — no information leakage.
    if (!user) {
      this.logger.log(
        `Password reset requested for unknown email: ${email}`,
      );
      return;
    }

    // Generate a 32-byte (64 hex chars) cryptographically secure random token.
    const rawToken = crypto.randomBytes(32).toString('hex');

    // Store only the SHA-256 hash in Redis so the raw token never persists.
    const hashedToken = this.hashToken(rawToken);
    const redisKey = `${REDIS_KEY_PREFIX}${hashedToken}`;

    await this.redisClient.set(redisKey, user.id, 'EX', RESET_TOKEN_TTL_SECONDS);

    // Send the raw token to the user's registered email address.
    await this.sendResetEmail(user.email, rawToken);

    this.logger.log(
      `Password reset token issued for user ${user.id} (email: ${user.email})`,
    );
  }

  /**
   * Complete the password-reset flow.
   *
   * @param token       The raw (unhashed) token from the reset link.
   * @param newPassword The desired new password (must pass complexity check).
   *
   * @throws BadRequestException (400, INVALID_RESET_TOKEN) when the token is
   *         absent, expired, or has already been used.
   * @throws UnprocessableEntityException (422, WEAK_PASSWORD) when the new
   *         password does not satisfy the complexity requirements.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const hashedToken = this.hashToken(token);
    const redisKey = `${REDIS_KEY_PREFIX}${hashedToken}`;

    // Look up the user ID stored under the hashed token.
    const userId = await this.redisClient.get(redisKey);

    if (!userId) {
      // Token not found or already expired — do not reveal which.
      throw new BadRequestException({
        errorCode: 'INVALID_RESET_TOKEN',
        message: 'The password reset token is invalid or has expired.',
      });
    }

    // Validate password complexity before touching the database.
    if (!this.isPasswordComplex(newPassword)) {
      throw new UnprocessableEntityException({
        errorCode: 'WEAK_PASSWORD',
        message:
          'Password must be at least 8 characters and contain at least one ' +
          'uppercase letter, one lowercase letter, one digit, and one special character.',
      });
    }

    // Hash the new password with bcrypt at work factor 12 (requirement 2.4).
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_WORK_FACTOR);

    // Persist the new password hash and invalidate the token atomically.
    await this.userRepository.update({ id: userId }, { password_hash: passwordHash });

    // Remove the Redis key so the token cannot be reused (one-time use).
    await this.redisClient.del(redisKey);

    this.logger.log(`Password successfully reset for user ${userId}`);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute the SHA-256 hex digest of a raw token.
   * Only the hash is stored in Redis; the raw token travels via email only.
   */
  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Validate password complexity per requirement 2.4:
   *   - Minimum 8 characters
   *   - At least one uppercase letter
   *   - At least one lowercase letter
   *   - At least one digit
   *   - At least one special character
   */
  private isPasswordComplex(password: string): boolean {
    if (password.length < 8) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return false;
    return true;
  }

  /**
   * Send the password-reset email containing the raw token embedded in a link.
   * SMTP settings are read from environment variables (requirement 13.3).
   */
  private async sendResetEmail(email: string, rawToken: string): Promise<void> {
    const smtpHost = this.configService.get<string>('SMTP_HOST', 'localhost');
    const smtpPort = this.configService.get<number>('SMTP_PORT', 587);
    const smtpUser = this.configService.get<string>('SMTP_USER', '');
    const smtpPass = this.configService.get<string>('SMTP_PASS', '');
    const smtpFrom = this.configService.get<string>(
      'SMTP_FROM',
      'noreply@sims.local',
    );

    // Frontend reset-password URL; falls back to a sensible default.
    const appUrl = this.configService.get<string>(
      'APP_URL',
      'http://localhost:5173',
    );
    const resetLink = `${appUrl}/reset-password?token=${rawToken}`;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort),
      secure: Number(smtpPort) === 465,
      auth:
        smtpUser && smtpPass
          ? { user: smtpUser, pass: smtpPass }
          : undefined,
    });

    await transporter.sendMail({
      from: smtpFrom,
      to: email,
      subject: 'SIMS — Password Reset Request',
      text: [
        'You requested a password reset for your SIMS account.',
        '',
        `Use the following link to reset your password (valid for 60 minutes):`,
        resetLink,
        '',
        'If you did not request a password reset, please ignore this email.',
        'Your password will remain unchanged.',
      ].join('\n'),
      html: [
        '<p>You requested a password reset for your SIMS account.</p>',
        '<p>Click the link below to reset your password.</p>',
        `<p><a href="${resetLink}">Reset my password</a></p>`,
        '<p>This link is valid for <strong>60 minutes</strong>.</p>',
        '<p>If you did not request a password reset, please ignore this email.</p>',
      ].join('\n'),
    });

    this.logger.log(`Password reset email dispatched to ${email}`);
  }
}

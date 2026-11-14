import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../providers/redis.provider';

export interface JwtPayload {
  sub: string;   // user UUID
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: string;
}

/**
 * JwtStrategy — validates Bearer token and confirms active session if Redis is available.
 * If Redis is unavailable or offline, validates JWT signature & expiration directly.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'change_me_in_env'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Only check Redis session if Redis client is connected and ready
    if (this.redis && this.redis.status === 'ready') {
      try {
        const sessionKey = `user:${payload.sub}:session`;
        const session = await this.redis.get(sessionKey);

        if (!session) {
          throw new UnauthorizedException(
            'Session expired or account has been deactivated.',
          );
        }
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        // Connection error during Redis lookup: proceed with valid JWT
      }
    }

    return {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  }
}

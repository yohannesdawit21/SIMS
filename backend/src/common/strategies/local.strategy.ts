import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';

/**
 * Minimal interface for the user record returned by AuthService.
 * AuthService will be implemented in task 4.1 — this strategy depends on it
 * via a lazy-resolved provider to avoid circular dependency.
 */
export interface IAuthService {
  validateCredentials(
    username: string,
    password: string,
  ): Promise<{ id: string; username: string; role: string } | null>;
}

/**
 * LocalStrategy — Passport local strategy that delegates credential validation
 * to AuthService (injected via the AUTH_SERVICE token to break circular deps).
 *
 * Used by LocalAuthGuard on POST /auth/login.
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: IAuthService) {
    super({ usernameField: 'username', passwordField: 'password' });
  }

  async validate(
    username: string,
    password: string,
  ): Promise<{ id: string; username: string; role: string }> {
    const user = await this.authService.validateCredentials(username, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    return user;
  }
}

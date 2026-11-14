import {
  Controller,
  Post,
  UseGuards,
  Req,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';

import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { LocalAuthGuard } from '../../common/guards/local-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/strategies/jwt.strategy';

/** Extend Express Request to carry the typed user attached by Passport. */
interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/**
 * AuthController — exposes the authentication endpoints.
 *
 * Full paths (with global prefix): /api/v1/auth/*
 *
 * Public routes  : POST /login, /forgot-password, /reset-password
 * Protected routes: POST /logout, /refresh  (require valid JWT session)
 *
 * The global ResponseInterceptor wraps every successful response in:
 *   { success: true, data: ..., meta: { timestamp } }
 *
 * The global HttpExceptionFilter handles all thrown HttpExceptions and
 * returns:
 *   { success: false, error: { code, message } }
 *
 * Requirements: 2.1, 2.5, 2.6
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  /**
   * POST /api/v1/auth/login
   *
   * @Public() — bypasses JwtAuthGuard.
   * LocalAuthGuard triggers the Passport local strategy which calls
   * AuthService.validateCredentials() and attaches the validated user to
   * req.user before this handler runs.
   *
   * Returns { access_token } on success.
   *
   * Requirement 2.1
   */
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    // LoginDto is here for OpenAPI / validation documentation purposes only.
    // Actual credential extraction is done by LocalAuthGuard / LocalStrategy.
    @Body() _dto: LoginDto,
    @Req() req: RequestWithUser,
  ): Promise<{ access_token: string }> {
    return this.authService.login(req.user, req.ip);
  }

  /**
   * POST /api/v1/auth/logout
   *
   * Requires a valid JWT (enforced by the global JwtAuthGuard).
   * Deletes the Redis session and returns a confirmation message.
   *
   * Requirement 2.5
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: RequestWithUser): Promise<{ message: string }> {
    return this.authService.logout(req.user.id);
  }

  /**
   * POST /api/v1/auth/refresh
   *
   * Requires a valid JWT (enforced by the global JwtAuthGuard).
   * Issues a fresh JWT for the authenticated user.
   *
   * Requirement 2.3
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: RequestWithUser,
  ): Promise<{ access_token: string }> {
    return this.authService.refreshToken(req.user);
  }

  /**
   * POST /api/v1/auth/forgot-password
   *
   * @Public() — no authentication required.
   * Accepts an email address, generates a one-time reset token, and sends
   * it to the address. Always returns the same response to prevent
   * email-enumeration attacks (requirement 2.6).
   *
   * Requirement 2.6
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.passwordResetService.requestReset(dto.email);
    // Return the same message regardless of whether the email is registered.
    return {
      message: 'If the email is registered, a reset link has been sent.',
    };
  }

  /**
   * POST /api/v1/auth/reset-password
   *
   * @Public() — no authentication required.
   * Validates the one-time token and updates the user's password.
   *
   * Throws BadRequestException (INVALID_RESET_TOKEN) or
   * UnprocessableEntityException (WEAK_PASSWORD) — both are handled by the
   * global HttpExceptionFilter; this controller does NOT swallow them.
   *
   * Requirement 2.6
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.passwordResetService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password reset successfully.' };
  }
}

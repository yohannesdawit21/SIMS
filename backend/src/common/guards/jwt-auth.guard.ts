import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * JwtAuthGuard — global authentication guard.
 *
 * - Skips auth for routes decorated with @Public().
 * - For all other routes, validates the Bearer JWT via JwtStrategy,
 *   which also checks for an active Redis session (handles deactivated accounts).
 * - Attaches the validated user to request.user for downstream use.
 *
 * Requirements: 2.1, 2.2, 1.8
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Check IS_PUBLIC_KEY on handler first, then the controller class.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser>(
    err: Error | null,
    user: TUser | false,
    info: { message?: string } | undefined,
  ): TUser {
    if (err || !user) {
      throw (
        err ??
        new UnauthorizedException(
          info?.message ?? 'Authentication required.',
        )
      );
    }
    return user;
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { checkPermission, Permission, Role } from '../constants/permission-matrix';
import type { AuthenticatedUser } from '../strategies/jwt.strategy';

/**
 * RbacGuard — evaluates role-based permissions on every request.
 *
 * - If the route has no @RequirePermission() decorator, the guard passes
 *   through (authentication by JwtAuthGuard is still enforced).
 * - If a permission is required, the user's current role (from the JWT
 *   session loaded by JwtStrategy) is checked against PERMISSION_MATRIX.
 * - Because JwtStrategy re-reads the role from Redis on each request,
 *   role changes take effect immediately (req 1.5, 1.7).
 *
 * Requirements: 1.1, 1.2, 1.5, 1.7
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permission decorator — guard is a no-op (JWT auth still applies).
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<
      Request & { user?: AuthenticatedUser }
    >();

    const user = request.user;

    if (!user) {
      // Should not happen when JwtAuthGuard is applied first, but be defensive.
      throw new ForbiddenException('Access denied.');
    }

    const role = user.role as Role;
    const permission = checkPermission(role, required.feature, required.action);

    if (!permission?.allowed) {
      throw new ForbiddenException(
        `Access denied. Role "${role}" cannot perform "${required.action}" on "${required.feature}".`,
      );
    }

    return true;
  }
}

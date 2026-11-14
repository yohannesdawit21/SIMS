import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../constants/permission-matrix';

export const PERMISSION_KEY = 'requiredPermission';

/**
 * Attach a required permission to a route handler.
 * The RbacGuard reads this metadata and checks against PERMISSION_MATRIX.
 *
 * @param feature  The feature area key (e.g. 'user_management')
 * @param action   The action key (e.g. 'any', 'read', 'manage')
 */
export const RequirePermission = (feature: string, action: string) =>
  SetMetadata<string, Permission>(PERMISSION_KEY, { feature, action });

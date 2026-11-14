import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route as public — bypasses JwtAuthGuard entirely.
 * Use on login, forgot-password, and reset-password endpoints.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

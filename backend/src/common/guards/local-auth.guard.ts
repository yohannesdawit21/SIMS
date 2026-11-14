import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * LocalAuthGuard — wraps Passport local strategy.
 * Used exclusively on POST /auth/login (which is also marked @Public()
 * so JwtAuthGuard is skipped, but LocalAuthGuard is applied manually).
 */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}

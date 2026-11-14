import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { User } from '../../entities/user.entity';
import { RedisModule } from '../../common/modules/redis.module';
import { AuditModule } from '../audit/audit.module';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { LocalStrategy } from '../../common/strategies/local.strategy';
import { AuthController } from './auth.controller';

/**
 * AuthModule — wires together the authentication subsystem.
 *
 * Provides:
 *  - AuthService         : login, logout, refreshToken, invalidateSession
 *  - PasswordResetService: requestReset, resetPassword
 *  - LocalStrategy       : Passport local strategy (delegating to AuthService)
 *
 * JwtModule is registered here with the same secret / expiry as the
 * root AppModule so AuthService can sign new tokens independently.
 *
 * RedisModule and AuditModule are imported (RedisModule is @Global, but
 * explicit import documents the dependency clearly).
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */
@Module({
  controllers: [AuthController],
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'change_me_in_env'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '15m'),
        },
      }),
    }),
    RedisModule,
    AuditModule,
  ],
  providers: [
    AuthService,
    PasswordResetService,
    // Provide AuthService under the IAuthService token so LocalStrategy
    // (which only knows about IAuthService) can receive it without a
    // circular dependency between AuthModule ↔ LocalStrategy.
    {
      provide: 'AUTH_SERVICE',
      useExisting: AuthService,
    },
    {
      // LocalStrategy expects an IAuthService injected via its constructor.
      // We supply AuthService which satisfies the interface.
      provide: LocalStrategy,
      useFactory: (authService: AuthService) => new LocalStrategy(authService),
      inject: [AuthService],
    },
  ],
  exports: [AuthService, PasswordResetService],
})
export class AuthModule {}

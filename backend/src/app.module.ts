import Redis from 'ioredis';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';

// Foundation entities that must be globally registered so TypeORM can
// resolve relations declared on them (Department.programmes, etc.)
import { Department } from './entities/department.entity';
import { Programme } from './entities/programme.entity';
import { Course } from './entities/course.entity';
import { AcademicPeriod } from './entities/academic-period.entity';
import { CourseLecturer } from './entities/course-lecturer.entity';
import { AssessmentComponent } from './entities/assessment-component.entity';
import { TimetableSession } from './entities/timetable-session.entity';

// Common
import { MinioModule } from './common/modules/minio.module';
import { RedisModule } from './common/modules/redis.module';
import { JwtStrategy } from './common/strategies/jwt.strategy';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RbacGuard } from './common/guards/rbac.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { AuditService } from './modules/audit/audit.service';

// Domain modules
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StudentsModule } from './modules/students/students.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { GradesModule } from './modules/grades/grades.module';
import { TimetableModule } from './modules/timetable/timetable.module';
import { FeesModule } from './modules/fees/fees.module';
import { LibraryModule } from './modules/library/library.module';
import { HostelModule } from './modules/hostel/hostel.module';
import { AlumniModule } from './modules/alumni/alumni.module';
import { PlacementModule } from './modules/placement/placement.module';
import { GuardianModule } from './modules/guardian/guardian.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DisciplineModule } from './modules/discipline/discipline.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { RegistrationModule } from './modules/registration/registration.module';

@Module({
  imports: [
    // -----------------------------------------------------------------------
    // Infrastructure
    // -----------------------------------------------------------------------
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get<string>('NODE_ENV') === 'production';
        return {
          type: 'postgres',
          url: configService.get<string>('DATABASE_URL'),
          synchronize: false,
          autoLoadEntities: true,
          ssl: isProduction ? { rejectUnauthorized: false } : false,
        };
      },
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>(
          'REDIS_URL',
          'redis://localhost:6379',
        );
        let url: URL;
        try {
          url = new URL(redisUrl);
        } catch {
          url = new URL('redis://localhost:6379');
        }
        const isTls = redisUrl.startsWith('rediss://');
        return {
          redis: {
            host: url.hostname,
            port: parseInt(url.port || '6379', 10),
            password: url.password || undefined,
            username: url.username || undefined,
            tls: isTls ? { rejectUnauthorized: false } : undefined,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            retryStrategy: () => 15000,
          },
          createClient: (type: string, redisOpts?: any) => {
            const client = new Redis(redisUrl, {
              ...redisOpts,
              tls: isTls ? { rejectUnauthorized: false } : undefined,
              maxRetriesPerRequest: null,
              enableReadyCheck: false,
              retryStrategy: () => 15000,
            });
            client.on('error', (err: Error) => {
              console.warn(`[Bull:${type}] Redis connection warning: ${err.message}`);
            });
            return client;
          },
        };
      },
    }),
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
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MinioModule,
    RedisModule,

    // Register foundation entities globally so TypeORM resolves all relations
    TypeOrmModule.forFeature([
      Department,
      Programme,
      Course,
      AcademicPeriod,
      CourseLecturer,
      AssessmentComponent,
      TimetableSession,
    ]),

    // -----------------------------------------------------------------------
    // Domain modules
    // -----------------------------------------------------------------------
    AuditModule,
    AuthModule,
    UsersModule,
    StudentsModule,
    NotificationModule,
    AttendanceModule,
    GradesModule,
    TimetableModule,
    FeesModule,
    LibraryModule,
    HostelModule,
    AlumniModule,
    PlacementModule,
    GuardianModule,
    ReportsModule,
    DisciplineModule,
    ApplicationsModule,
    RegistrationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    JwtStrategy,
    // Apply JwtAuthGuard globally — @Public() bypasses it
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new JwtAuthGuard(reflector),
      inject: [Reflector],
    },
    // Apply RbacGuard globally — routes without @RequirePermission() pass through
    {
      provide: APP_GUARD,
      useFactory: (reflector: Reflector) => new RbacGuard(reflector),
      inject: [Reflector],
    },
    // Apply AuditInterceptor globally for all mutating requests
    {
      provide: APP_INTERCEPTOR,
      useFactory: (auditService: AuditService) =>
        new AuditInterceptor(auditService),
      inject: [AuditService],
    },
  ],
})
export class AppModule {}

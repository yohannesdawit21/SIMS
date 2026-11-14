import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../../entities/user.entity';
import { Department } from '../../entities/department.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuditModule } from '../audit/audit.module';
import { RedisModule } from '../../common/modules/redis.module';

/**
 * UsersModule — Super Admin user management.
 *
 * Provides:
 *  - UsersService (CRUD, role assignment, session invalidation)
 *  - UsersController (REST endpoints, RBAC-gated)
 *
 * Imports:
 *  - TypeOrmModule for User and Department repositories
 *  - AuditModule so UsersService can write audit log entries
 *  - RedisModule so UsersService can update/delete Redis sessions
 *
 * Requirements: 1.3, 1.5, 1.6, 1.8
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Department]),
    AuditModule,
    RedisModule,
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}

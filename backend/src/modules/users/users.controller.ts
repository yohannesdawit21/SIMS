import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';

import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RegisterHODDto } from './dto/register-hod.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { UserRole } from '../../entities/user.entity';
import type { AuthenticatedUser } from '../../common/strategies/jwt.strategy';

/**
 * UsersController — manages user accounts and role assignments.
 *
 * All endpoints require the `user_management` permission (Super Admin only).
 * JwtAuthGuard + RbacGuard are applied globally; the @RequirePermission
 * decorator here triggers the role check in RbacGuard.
 *
 * Routes:
 *  GET    /users                  – List users (with optional filters)
 *  POST   /users                  – Create user
 *  GET    /users/:id              – Get user by ID
 *  PATCH  /users/:id              – Update user (including role)
 *  PATCH  /users/:id/deactivate   – Deactivate user account
 *
 * Requirements: 1.3
 */
@Controller('users')
@RequirePermission('user_management', 'any')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /users
   * List all users with optional filtering by username, email, or role.
   */
  @Get()
  async findAll(
    @Query('username') username?: string,
    @Query('email') email?: string,
    @Query('role') role?: UserRole,
  ) {
    const users = await this.usersService.findAll({
      username,
      email,
      role,
    });
    return users;
  }

  /**
   * POST /users
   * Create a new user account.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createUserDto: CreateUserDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.usersService.create(createUserDto, actorId);
  }

  /**
   * POST /users/register-hod
   * Super Admin registers a new Head of Department and assigns them to a department.
   */
  @Post('register-hod')
  @HttpCode(HttpStatus.CREATED)
  async registerHOD(
    @Body() dto: RegisterHODDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.usersService.registerHOD(dto, actorId);
  }

  /**
   * POST /users/lecturer
   * Super Admin creates a new lecturer with auto-generated credentials (LEC2024001 format).
   * Returns the temporary password for the admin to share with the lecturer.
   */
  @Post('lecturer')
  @HttpCode(HttpStatus.CREATED)
  async createLecturer(
    @Body() dto: { email: string; phone?: string },
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.usersService.createLecturer(dto, actorId);
  }

  /**
   * POST /users/staff
   * Super Admin creates a new admin staff with auto-generated credentials (STF2024001 format).
   * Returns the temporary password for the super admin to share with the staff.
   */
  @Post('staff')
  @HttpCode(HttpStatus.CREATED)
  async createStaff(
    @Body() dto: { email: string; phone?: string },
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.usersService.createStaff(dto, actorId);
  }

  /**
   * GET /users/:id
   * Get a single user by UUID.
   */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  /**
   * PATCH /users/:id
   * Update user fields (email, phone, role, password, is_active).
   * Role changes trigger immediate Redis session update + audit log.
   */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.usersService.update(id, updateUserDto, actorId);
  }

  /**
   * PATCH /users/:id/deactivate
   * Deactivate a user account — sets is_active = false and deletes the
   * Redis session to immediately invalidate any active login.
   * Requirement 1.8
   */
  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.usersService.deactivate(id, actorId);
  }

  /**
   * POST /users/:id/promote-to-dept-head
   * Promote a lecturer to department head role.
   * Body: { departmentId: string }
   */
  @Post(':id/promote-to-dept-head')
  @HttpCode(HttpStatus.OK)
  async promoteToDepartmentHead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { departmentId: string },
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.usersService.promoteToDepartmentHead(
      id,
      body.departmentId,
      actorId,
    );
  }

  /**
   * POST /users/:id/demote-from-dept-head
   * Demote a department head back to lecturer and assign a new head.
   * Body: { newHeadId: string }
   */
  @Post(':id/demote-from-dept-head')
  @HttpCode(HttpStatus.OK)
  async demoteFromDepartmentHead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { newHeadId: string },
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.usersService.demoteFromDepartmentHead(
      id,
      body.newHeadId,
      actorId,
    );
  }
}

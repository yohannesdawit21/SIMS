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
  Request,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';

import { GuardianService } from './guardian.service';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import { UpdateGuardianContactDto } from './dto/update-guardian-contact.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/strategies/jwt.strategy';

/**
 * GuardianController — Parent/Guardian account management and student portal.
 *
 * Routes:
 *  GET    /guardians                         — list guardians (Admin Staff)
 *  POST   /guardians                         — create guardian (Admin Staff)
 *  GET    /guardians/:id                     — get single guardian
 *  POST   /guardians/:id/link/:studentId     — link guardian to student (Admin Staff)
 *  GET    /guardians/:id/students            — get linked students' data (Guardian or Admin)
 *  PATCH  /guardians/:id/contact             — update own contact (Guardian self-service)
 *
 * Requirements: 12.1–12.5
 */
@Controller('guardians')
export class GuardianController {
  constructor(private readonly guardianService: GuardianService) {}

  @Get()
  @RequirePermission('profile', 'create') // Admin Staff only
  findAll() {
    return this.guardianService.findAll();
  }

  /**
   * GET /guardians/me
   * Get the current authenticated guardian's record.
   */
  @Get('me')
  @RequirePermission('own_profile', 'read')
  async getMe(@Request() req: ExpressRequest & { user?: AuthenticatedUser }) {
    return this.guardianService.findMe(req.user!.id);
  }

  /**
   * GET /guardians/me/students
   * Get linked students for the currently authenticated guardian.
   */
  @Get('me/students')
  @RequirePermission('own_profile', 'read')
  async getMyStudents(@Request() req: ExpressRequest & { user?: AuthenticatedUser }) {
    return this.guardianService.getLinkedStudentDataForUser(req.user!.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('profile', 'create') // Admin Staff only
  create(
    @Body() dto: CreateGuardianDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.guardianService.createGuardian(dto, req.user!.id);
  }

  @Get(':id')
  @RequirePermission('profile', 'create')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.guardianService.findOne(id);
  }

  /**
   * POST /guardians/:id/link/:studentId
   * Link guardian to student with consent recorded in audit log.
   * Requirements: 12.1
   */
  @Post(':id/link/:studentId')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('profile', 'create') // Admin Staff only
  linkToStudent(
    @Param('id', ParseUUIDPipe) guardianId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.guardianService.linkToStudent(guardianId, studentId, req.user!.id);
  }

  /**
   * GET /guardians/:id/students
   * Read-only view of linked students' academic and financial data.
   * Requirements: 12.2, 12.3
   */
  @Get(':id/students')
  @RequirePermission('own_profile', 'read') // Guardian can read own; Admin Staff can access all
  getLinkedStudents(
    @Param('id', ParseUUIDPipe) guardianId: string,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.guardianService.getLinkedStudentData(guardianId, req.user!.id);
  }

  /**
   * PATCH /guardians/:id/contact
   * Guardian updates own email/phone. Service enforces own-only access.
   * Requirements: 12.5
   */
  @Patch(':id/contact')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('own_profile', 'read')
  updateContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGuardianContactDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    return this.guardianService.updateContact(id, dto, actor.id, actor.role);
  }
}

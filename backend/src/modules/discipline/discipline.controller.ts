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

import { DisciplineService } from './discipline.service';
import { CreateDisciplineDto } from './dto/create-discipline.dto';
import { ClearDisciplineDto } from './dto/clear-discipline.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { DisciplineStatus } from '../../entities/discipline-record.entity';
import type { AuthenticatedUser } from '../../common/strategies/jwt.strategy';

/**
 * DisciplineController — manages student discipline records.
 * 
 * Permissions:
 *  - Create: Lecturers, dept heads, admin staff, super admin
 *  - Read: All staff roles
 *  - Clear: Super admin only
 * 
 * Routes:
 *  GET    /discipline                    – List all discipline records
 *  POST   /discipline                    – Create discipline record
 *  GET    /discipline/:id                – Get single record
 *  PATCH  /discipline/:id/clear          – Clear discipline issue (super admin)
 *  GET    /discipline/student/:studentId/status – Check student eligibility
 */
@Controller('discipline')
export class DisciplineController {
  constructor(private readonly disciplineService: DisciplineService) {}

  /**
   * GET /discipline
   * List all discipline records with optional filtering.
   */
  @Get()
  @RequirePermission('all_profiles', 'read') // Staff roles can view
  async findAll(
    @Query('studentId') studentId?: string,
    @Query('status') status?: DisciplineStatus,
  ) {
    return this.disciplineService.findAll({ studentId, status });
  }

  /**
   * POST /discipline
   * Create a new discipline record.
   * Available to: lecturer, department_head, admin_staff, super_admin
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('all_profiles', 'read') // Staff roles can create
  async create(
    @Body() createDisciplineDto: CreateDisciplineDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.disciplineService.create(createDisciplineDto, actorId);
  }

  /**
   * GET /discipline/:id
   * Get a single discipline record by ID.
   */
  @Get(':id')
  @RequirePermission('all_profiles', 'read')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.disciplineService.findOne(id);
  }

  /**
   * PATCH /discipline/:id/clear
   * Clear a discipline issue (super admin only).
   */
  @Patch(':id/clear')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('user_management', 'any') // Super admin only
  async clear(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() clearDisciplineDto: ClearDisciplineDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.disciplineService.clear(id, clearDisciplineDto, actorId);
  }

  /**
   * GET /discipline/student/:studentId/status
   * Get discipline status for a student (registration eligibility check).
   */
  @Get('student/:studentId/status')
  @RequirePermission('all_profiles', 'read')
  async getStudentStatus(
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.disciplineService.getStudentDisciplineStatus(studentId);
  }
}

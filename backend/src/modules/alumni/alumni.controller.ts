import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';

import { AlumniService } from './alumni.service';
import { UpdateAlumniContactDto } from './dto/update-alumni-contact.dto';
import { CreateCareerPlacementDto } from './dto/create-career-placement.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/strategies/jwt.strategy';

/**
 * AlumniController — alumni records and career placement endpoints.
 *
 * Routes:
 *  GET    /alumni                        — list alumni (Admin Staff, Dept Head, Super Admin)
 *  GET    /alumni/:id                    — get single alumni record
 *  PATCH  /alumni/:id/contact            — update contact (Admin Staff or Alumni self-service)
 *  GET    /alumni/:id/placements         — list placements for alumni
 *  POST   /alumni/placements             — create placement record (Admin Staff)
 *
 * Requirements: 10.1–10.6
 */
@Controller('alumni')
export class AlumniController {
  constructor(private readonly alumniService: AlumniService) {}

  @Get()
  @RequirePermission('alumni', 'manage')
  findAll(
    @Query('departmentId') departmentId: string | undefined,
    @Query('graduationYear') graduationYear: string | undefined,
    @Query('programmeId') programmeId: string | undefined,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    const year = graduationYear ? parseInt(graduationYear, 10) : undefined;
    return this.alumniService.findAll(actor.role, departmentId, year, programmeId);
  }

  @Get(':id')
  @RequirePermission('alumni', 'manage')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.alumniService.findOne(id);
  }

  /**
   * PATCH /alumni/:id/contact
   * Admin Staff can update any alumni contact.
   * Alumni role can update their own (enforced in service).
   * Requirements: 10.2, 10.6
   */
  @Patch(':id/contact')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('alumni', 'update_own')
  updateContact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlumniContactDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    return this.alumniService.updateContactDetails(id, dto, actor.id, actor.role);
  }

  @Get(':id/placements')
  @RequirePermission('alumni', 'manage')
  getplacements(@Param('id', ParseUUIDPipe) id: string) {
    return this.alumniService.findPlacementsForAlumni(id);
  }

  @Post('placements')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('alumni', 'manage')
  addPlacement(
    @Body() dto: CreateCareerPlacementDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.alumniService.addCareerPlacement(dto, req.user!.id);
  }
}

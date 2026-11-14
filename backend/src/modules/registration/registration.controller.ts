import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { RegistrationService } from './registration.service';
import { RegisterSemesterDto, OverrideBlockDto } from './dto/register-semester.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/strategies/jwt.strategy';

/**
 * RegistrationController - Handles semester registration for senior students
 * 
 * Routes:
 *  POST /registration/semester - Register student for semester
 *  POST /registration/:id/override - Override registration block (super admin)
 *  GET /registration - List all registrations (with filters)
 *  GET /registration/:id - Get single registration
 *  GET /registration/student/:studentId - Get student's registration history
 *  GET /registration/student/:studentId/eligibility - Check registration eligibility
 */
@Controller('registration')
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  /**
   * POST /registration/semester
   * Register student for semester with eligibility checks
   */
  @Post('semester')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('registration', 'manage')
  async registerForSemester(
    @Body() dto: RegisterSemesterDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.registrationService.registerForSemester(dto, req.user!.id);
  }

  /**
   * POST /registration/:id/override
   * Override registration block (super admin only)
   */
  @Post(':id/override')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('registration', 'manage')
  async overrideBlock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OverrideBlockDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.registrationService.overrideBlock(
      id,
      dto.override_reason,
      req.user!.id,
    );
  }

  /**
   * GET /registration
   * List all registrations with optional filters
   */
  @Get()
  @RequirePermission('registration', 'view')
  async findAll(
    @Query('status') status?: string,
    @Query('academicPeriodId') academicPeriodId?: string,
  ) {
    return this.registrationService.findAll(status, academicPeriodId);
  }

  /**
   * GET /registration/:id
   * Get single registration by ID
   */
  @Get(':id')
  @RequirePermission('registration', 'view')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.registrationService.findOne(id);
  }

  /**
   * GET /registration/student/:studentId
   * Get student's registration history
   */
  @Get('student/:studentId')
  @RequirePermission('registration', 'view')
  async getStudentRegistrations(
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.registrationService.getStudentRegistrations(studentId);
  }

  /**
   * GET /registration/student/:studentId/eligibility
   * Check if student is eligible to register for semester
   */
  @Get('student/:studentId/eligibility')
  @RequirePermission('registration', 'view')
  async checkEligibility(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.registrationService.checkEligibility(studentId);
  }
}

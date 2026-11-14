import {
  Body,
  Controller,
  Delete,
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

import { TimetableService } from './timetable.service';
import { CreateTimetableEntryDto } from './dto/create-timetable-entry.dto';
import { UpdateTimetableEntryDto } from './dto/update-timetable-entry.dto';
import { RegisterCourseDto } from './dto/register-course.dto';
import { AssignLecturerDto } from './dto/assign-lecturer.dto';
import { RejectScheduleDto } from './dto/approve-schedule.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/strategies/jwt.strategy';

/**
 * TimetableController — CRUD for timetable entries plus period publication.
 *
 * Routes:
 *  GET    /timetable              — view entries (role-scoped)
 *  GET    /timetable/:id          — view single entry
 *  POST   /timetable              — create entry (Admin Staff, Super Admin)
 *  PATCH  /timetable/:id          — update entry (Admin Staff, Super Admin)
 *  DELETE /timetable/:id          — delete entry (Admin Staff, Super Admin)
 *  POST   /timetable/publish/:periodId — publish timetable for period
 *
 * Requirements: 6.1–6.9
 */
@Controller('timetable')
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  @Get()
  @RequirePermission('timetable', 'view')
  async findAll(
    @Query('periodId') periodId: string | undefined,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const { id, role } = req.user!;
    if (role === 'admin_staff' || role === 'super_admin') {
      return this.timetableService.findAll(periodId);
    }
    if (role === 'department_head') {
      return this.timetableService.findForDepartmentHead(id, periodId);
    }
    return this.timetableService.getForUser(id, role, periodId);
  }


  @Get('courses')
  @RequirePermission('timetable', 'view')
  async getCourses(@Request() req: ExpressRequest & { user?: AuthenticatedUser }) {
    return this.timetableService.getCoursesForUser(req.user!.id, req.user!.role);
  }

  @Get('lecturers')
  @RequirePermission('timetable', 'view')
  async getLecturers(@Request() req: ExpressRequest & { user?: AuthenticatedUser }) {
    return this.timetableService.getLecturers(req.user?.id, req.user?.role);
  }

  @Get('periods')
  @RequirePermission('timetable', 'view')
  async getPeriods() {
    return this.timetableService.getAcademicPeriods();
  }

  @Post('courses/register')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('course_enrollment', 'manage')
  async registerCourse(
    @Body() dto: RegisterCourseDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.timetableService.registerCourse(dto, req.user!.id, req.user!.role);
  }

  @Post('courses/assign')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('course_enrollment', 'manage')
  async assignLecturer(
    @Body() dto: AssignLecturerDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.timetableService.assignLecturerToCourse(dto, req.user!.id, req.user!.role);
  }

  @Get('my-department')
  @RequirePermission('timetable', 'view')
  async getMyDepartment(@Request() req: ExpressRequest & { user?: AuthenticatedUser }) {
    return this.timetableService.getDepartmentForHOD(req.user!.id);
  }

  @Get('departments')
  @RequirePermission('timetable', 'view')
  async getDepartments() {
    return this.timetableService.getDepartments();
  }

  @Get(':id([0-9a-fA-F-]{36})')
  @RequirePermission('timetable', 'view')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.timetableService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('timetable', 'manage')
  async create(
    @Body() dto: CreateTimetableEntryDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.timetableService.create(dto, req.user!.id);
  }

  @Patch(':id([0-9a-fA-F-]{36})')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('timetable', 'manage')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTimetableEntryDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.timetableService.update(id, dto, req.user!.id);
  }

  @Delete(':id([0-9a-fA-F-]{36})')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('timetable', 'manage')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    await this.timetableService.remove(id, req.user!.id);
    return { message: 'Timetable entry deleted.' };
  }

  
  /**
   * POST /timetable/submit/:periodId
   * Submit draft timetable entries for an academic period to Central Admin for approval.
   */
  @Post('submit/:periodId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('timetable', 'manage')
  async submitForApproval(
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Query('departmentId') departmentId: string | undefined,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.timetableService.submitForApproval(
      periodId,
      departmentId,
      req.user!.id,
    );
  }

  /**
   * POST /timetable/publish/:periodId
   * Publish all unpublished entries for the given academic period and notify
   * all affected students and lecturers.
   * Requirements: 6.4, 6.5
   */
  @Post('publish/:periodId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('timetable', 'manage')
  async publish(
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.timetableService.publish(periodId, req.user!.id);
  }

  // -------------------------------------------------------------------------
  // Schedule Approval Endpoints (Phase 4)
  // -------------------------------------------------------------------------

  /**
   * GET /timetable/schedules/pending
   * Get all pending schedules awaiting approval
   */
  @Get('schedules/pending')
  @RequirePermission('timetable', 'manage')
  async getPendingSchedules(
    @Query('departmentId') departmentId: string | undefined,
  ) {
    return this.timetableService.getPendingSchedules(departmentId);
  }

  /**
   * GET /timetable/schedules/status/:status
   * Get schedules by status (pending, approved, rejected)
   */
  @Get('schedules/status/:status')
  @RequirePermission('timetable', 'view')
  async getSchedulesByStatus(
    @Param('status') status: string,
    @Query('departmentId') departmentId: string | undefined,
  ) {
    return this.timetableService.getSchedulesByStatus(status, departmentId);
  }

  /**
   * POST /timetable/:id/approve
   * Approve a pending schedule (super admin or registrar only)
   */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('timetable', 'manage')
  async approveSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.timetableService.approveSchedule(id, req.user!.id);
  }

  /**
   * POST /timetable/:id/reject
   * Reject a pending schedule with reason
   */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('timetable', 'manage')
  async rejectSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectScheduleDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.timetableService.rejectSchedule(
      id,
      req.user!.id,
      dto.rejection_reason,
    );
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuthenticatedUser } from '../../common/strategies/jwt.strategy';

import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { AmendAttendanceDto } from './dto/amend-attendance.dto';
import { SetThresholdDto } from './dto/set-threshold.dto';
import { AttendanceRecord } from '../../entities/attendance-record.entity';

/**
 * AttendanceController — HTTP surface for the attendance subsystem.
 *
 * All routes are protected by JWT + RBAC guards.
 *
 * Routes:
 *  POST   /attendance/mark                        — mark attendance batch
 *  PATCH  /attendance/:id                         — amend single record
 *  GET    /attendance/summary/:studentId/:courseId — student summary
 *  GET    /attendance                             — role-scoped listing
 *  GET    /attendance/config/threshold            — read current threshold
 *  PUT    /attendance/config/threshold            — set threshold (admin only)
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.7, 5.8
 */
@Controller('attendance')
@UseGuards(JwtAuthGuard, RbacGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // ---------------------------------------------------------------------------
  // POST /attendance/mark
  // ---------------------------------------------------------------------------

  /**
   * Mark attendance for a batch of students in a session.
   * Only the assigned lecturer (or admin roles) may mark attendance.
   *
   * Requirements: 5.1
   */
  @Post('mark')
  @RequirePermission('attendance', 'mark')
  async markAttendance(
    @Body() dto: MarkAttendanceDto,
    @Request() req: { user: AuthenticatedUser },
  ): Promise<AttendanceRecord[]> {
    return this.attendanceService.markAttendance(
      dto.sessionId,
      dto.records.map((r) => ({ studentId: r.studentId, status: r.status })),
      req.user.id,
      req.user.role,
    );
  }

  // ---------------------------------------------------------------------------
  // PATCH /attendance/:id
  // ---------------------------------------------------------------------------

  /**
   * Amend a single attendance record's status.
   * Time-window enforcement (48 h) is applied in the service layer.
   *
   * Requirements: 5.7, 5.8
   */
  @Patch(':id')
  @RequirePermission('attendance', 'amend')
  async amendRecord(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AmendAttendanceDto,
    @Request() req: { user: AuthenticatedUser },
  ): Promise<AttendanceRecord> {
    return this.attendanceService.amendRecord(
      id,
      dto.status,
      req.user.id,
      req.user.role,
    );
  }

  // ---------------------------------------------------------------------------
  // GET /attendance/summary/:studentId/:courseId
  // ---------------------------------------------------------------------------

  /**
   * Get the attendance percentage summary for a student in a course.
   * Students may read their own summary; staff/admin can read any student's.
   *
   * Requirements: 5.2
   */
  @Get('summary/:studentId/:courseId')
  @RequirePermission('attendance_own', 'read')
  async getSummary(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ): Promise<{
    percentage: number;
    present: number;
    late: number;
    absent: number;
    total: number;
    sessions: AttendanceRecord[];
  }> {
    return this.attendanceService.getAttendanceSummary(studentId, courseId);
  }

  // ---------------------------------------------------------------------------
  // GET /attendance
  // ---------------------------------------------------------------------------

  /**
   * List attendance records, scoped by the caller's role.
   *
   * Requirements: 5.4
   */
  @Get()
  @RequirePermission('attendance', 'read')
  async findAll(
    @Request() req: { user: AuthenticatedUser },
    @Query('departmentId') departmentId?: string,
  ): Promise<AttendanceRecord[]> {
    return this.attendanceService.findAll(
      req.user.role,
      req.user.id,
      departmentId,
    );
  }

  // ---------------------------------------------------------------------------
  // GET /attendance/config/threshold
  // ---------------------------------------------------------------------------

  /**
   * Get the current low-attendance threshold (defaults to 75 if not set).
   * Accessible by any authenticated user.
   *
   * Requirements: 5.4
   */
  @Get('config/threshold')
  @RequirePermission('attendance', 'read')
  async getThreshold(): Promise<{ threshold: number }> {
    const threshold = await this.attendanceService.getThreshold();
    return { threshold };
  }

  // ---------------------------------------------------------------------------
  // PUT /attendance/config/threshold
  // ---------------------------------------------------------------------------

  /**
   * Set the low-attendance threshold (admin_staff / super_admin only via RBAC).
   * Accepts values in [50, 100]; rejects outside that range.
   *
   * Requirements: 5.4
   */
  @Put('config/threshold')
  @RequirePermission('profile', 'update')
  async setThreshold(
    @Body() dto: SetThresholdDto,
    @Request() req: { user: AuthenticatedUser },
  ): Promise<{ threshold: number }> {
    await this.attendanceService.setThreshold(dto.value, req.user.id);
    return { threshold: dto.value };
  }
}

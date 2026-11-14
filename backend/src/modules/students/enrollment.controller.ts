import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';

import { EnrollmentService } from './enrollment.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { BatchEnrollCohortDto } from './dto/batch-enroll-cohort.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/strategies/jwt.strategy';

/**
 * EnrollmentController — exposes course enrollment endpoints under /enrollments.
 *
 * Routes:
 *  GET    /enrollments         – List enrollments (role-scoped)
 *  POST   /enrollments         – Enroll a student (Admin Staff / Super Admin)
 *  DELETE /enrollments/:id     – Remove an enrollment (Admin Staff / Super Admin)
 *
 * Delegates all business logic to EnrollmentService (students module).
 *
 * Requirements: 3.3, 3.4, 3.5
 */
@Controller('enrollments')
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  /**
   * GET /enrollments
   * List enrollments scoped by the caller's role.
   *  - Admin Staff / Super Admin: see all (optionally filter by ?studentId, ?courseId, ?academicPeriodId).
   *  - Department Head: see only courses in their department.
   *  - Student: sees only their own enrollments.
   *
   * Requirements: 3.5
   */
  @Get()
  async findAll(
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
    @Query('studentId') studentId?: string,
    @Query('courseId') courseId?: string,
    @Query('academicPeriodId') academicPeriodId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const user = req.user;
    return this.enrollmentService.findAll(
      user?.role,
      user?.id,
      departmentId,
      {
        student_id: studentId,
        course_id: courseId,
        academic_period_id: academicPeriodId,
      },
    );
  }

  /**
   * POST /enrollments/batch
   * Batch auto-enroll an entire cohort into multiple courses for an academic period.
   */
  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('course_enrollment', 'manage')
  async batchEnroll(
    @Body() dto: BatchEnrollCohortDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.enrollmentService.batchEnrollCohort(dto, actorId);
  }

  /**
   * POST /enrollments/students
   * Enroll selected students into a course.
   */
  @Post('students')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('course_enrollment', 'manage')
  async enrollStudents(
    @Body() dto: { course_id: string; academic_period_id: string; student_ids: string[] },
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.enrollmentService.enrollStudents(dto, actorId);
  }

  /**
   * POST /enrollments
   * Enroll a student in a course for an academic period.
   * Only Admin Staff and Super Admin can perform this action.
   * Returns 409 if course is at capacity (ENROLLMENT_CAPACITY_EXCEEDED).
   * Returns 422 if student is not active (STUDENT_NOT_ACTIVE).
   * Requirements: 3.3, 3.4
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('course_enrollment', 'manage')
  async enroll(
    @Body() createEnrollmentDto: CreateEnrollmentDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.enrollmentService.enroll(createEnrollmentDto, actorId);
  }

  /**
   * DELETE /enrollments/:id
   * Remove an enrollment by UUID.
   * Decrements course.current_enrollment on removal.
   * Only Admin Staff and Super Admin can perform this action.
   * Requirements: 3.3
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('course_enrollment', 'manage')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.enrollmentService.remove(id, actorId);
  }
}

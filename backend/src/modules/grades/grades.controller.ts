import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Request,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';

import { GradesService } from './grades.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/strategies/jwt.strategy';
import { BatchEnterGradesDto } from './dto/batch-enter-grades.dto';
import { RequestRevisionDto } from './dto/request-revision.dto';

/**
 * GradesController — handles grade entry, publishing, locking, and retrieval.
 *
 * Routes:
 *  GET  /grades/my-courses                         — assigned courses for lecturer
 *  GET  /grades/pending-approval                   — submissions pending HOD review
 *  GET  /grades/sheet/:courseId/:periodId          — course grading sheet roster
 *  POST /grades/batch                              — batch enter/save grades
 *  POST /grades/submit                             — submit grades for HOD approval
 *  POST /grades/request-revision                   — HOD requests revision
 *  POST /grades/publish                            — HOD/admin publish grades
 *  PUT  /grades/:studentId/:courseId/:componentId  — enter single grade
 *  GET  /grades                                    — list grades (role-scoped)
 *  GET  /grades/transcript/:studentId              — get transcript
 *  GET  /grades/gpa/:studentId                     — get GPA
 *
 * Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 4.8, 4.9, 4.10
 */
@Controller('grades')
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  /**
   * GET /grades/my-courses
   * List courses assigned to the current lecturer with grading status.
   */
  @Get('my-courses')
  @RequirePermission('grades', 'read')
  async getMyCourses(
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
    @Query('periodId') periodId?: string,
  ) {
    const actor = req.user!;
    return this.gradesService.getLecturerAssignedCourses(
      actor.id,
      actor.role,
      periodId,
    );
  }

  /**
   * GET /grades/pending-approval
   * List pending grade submissions for HOD review.
   */
  @Get('pending-approval')
  @RequirePermission('grades', 'publish')
  async getPendingSubmissions(
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    return this.gradesService.getPendingSubmissionsForHOD(actor.id, actor.role);
  }

  /**
   * GET /grades/sheet/:courseId/:periodId
   * Retrieve the complete grading sheet for a course and academic period.
   */
  @Get('sheet/:courseId/:periodId')
  @RequirePermission('grades', 'read')
  async getCourseGradingSheet(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    return this.gradesService.getCourseGradingSheet(
      courseId,
      periodId,
      actor.id,
      actor.role,
    );
  }

  /**
   * POST /grades/batch
   * Batch enter/save student scores in draft state.
   */
  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('grades', 'enter')
  async batchEnterGrades(
    @Body() dto: BatchEnterGradesDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    return this.gradesService.batchEnterGrades(dto, actor.id, actor.role);
  }

  /**
   * POST /grades/submit
   * Lecturer submits entered grades for a course+period to Department Head for review.
   * Body: { courseId, periodId }
   */
  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('grades', 'enter')
  async submitGradesForApproval(
    @Body('courseId') courseId: string,
    @Body('periodId') periodId: string,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    return this.gradesService.submitGradesForApproval(
      courseId,
      periodId,
      actor.id,
      actor.role,
    );
  }

  /**
   * POST /grades/request-revision
   * HOD requests revision with moderation notes.
   */
  @Post('request-revision')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('grades', 'publish')
  async requestRevision(
    @Body() dto: RequestRevisionDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    return this.gradesService.requestRevision(
      dto.courseId,
      dto.periodId,
      dto.reason,
      actor.id,
      actor.role,
    );
  }

  /**
   * POST /grades/publish
   * Publish grades for a course+period.
   * Body: { courseId, periodId, force? }
   * Returns a warning if mandatory components are missing scores (unless force=true).
   *
   * Requirements: 4.5, 4.6
   */
  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('grades', 'publish')
  async publishGrades(
    @Body('courseId') courseId: string,
    @Body('periodId') periodId: string,
    @Body('force') force: boolean = false,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    return this.gradesService.publishGrades(
      courseId,
      periodId,
      force,
      actor.id,
      actor.role,
    );
  }

  /**
   * PUT /grades/:studentId/:courseId/:componentId
   * Enter or update a grade for a student's assessment component.
   * Body: { periodId, score }
   *
   * Requirements: 4.1, 4.2
   */
  @Put(':studentId/:courseId/:componentId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('grades', 'enter')
  async enterGrade(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('componentId', ParseUUIDPipe) componentId: string,
    @Body('periodId') periodId: string,
    @Body('score') score: number,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    return this.gradesService.enterGrade(
      { studentId, courseId, componentId, periodId, score },
      actor.id,
      actor.role,
    );
  }

  /**
   * GET /grades
   * List grades scoped to the caller's role.
   *
   * Requirements: 4.8, 4.9
   */
  @Get()
  @RequirePermission('grades', 'read')
  async findAll(
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    return this.gradesService.findAll(actor.role, actor.id);
  }

  /**
   * GET /grades/transcript/:studentId
   * Get full published transcript for a student, ordered by academic period.
   *
   * Requirements: 4.9
   */
  @Get('transcript/:studentId')
  @RequirePermission('grades_own', 'read')
  async getTranscript(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    return this.gradesService.getTranscript(studentId, actor.id, actor.role);
  }

  /**
   * GET /grades/gpa/:studentId
   * Get cumulative GPA for a student.
   *
   * Requirements: 4.10
   */
  @Get('gpa/:studentId')
  @RequirePermission('grades_own', 'read')
  async getGpa(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    return this.gradesService.getGpa(studentId, actor.id, actor.role);
  }

  /**
   * GET /grades/breakdown/:courseId/:periodId
   * Get itemized assessment component breakdown for a student's published course grade.
   */
  @Get('breakdown/:courseId/:periodId')
  @RequirePermission('grades_own', 'read')
  async getBreakdown(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Query('studentId') studentIdQuery: string | undefined,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    const targetStudentId = studentIdQuery || actor.id;
    return this.gradesService.getStudentCourseBreakdown(
      courseId,
      periodId,
      targetStudentId,
      actor.id,
      actor.role,
    );
  }
}

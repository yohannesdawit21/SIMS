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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request as ExpressRequest } from 'express';

import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { BatchGraduateDto } from './dto/batch-graduate.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { UserRole } from '../../entities/user.entity';
import type { AuthenticatedUser } from '../../common/strategies/jwt.strategy';

/**
 * StudentsController — manages student profile lifecycle.
 *
 * Routes:
 *  GET    /students                 – List students (role-scoped, Admin/Dept Head)
 *  POST   /students                 – Create student profile
 *  GET    /students/:id             – Get student by ID
 *  PATCH  /students/:id             – Update student profile
 *  POST   /students/:id/photo       – Upload student profile photo (multipart)
 *  PATCH  /students/:id/deactivate  – Deactivate student account
 *
 * Requirements: 3.1, 3.2, 3.6, 3.8, 3.9, 3.10
 */
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  /**
   * GET /students
   * List all students with role-based scoping.
   *  - Admin Staff / Super Admin: see all (optionally filter by ?departmentId=).
   *  - Department Head: see only their department's students.
   *  - Student: denied at RBAC level (allowed: false in permission matrix).
   *
   * Requirements: 3.6
   */
  @Get()
  @RequirePermission('all_profiles', 'read')
  async findAll(
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
    @Query('departmentId') departmentId?: string,
  ) {
    const user = req.user!;
    return this.studentsService.findAll(
      user.role as UserRole,
      user.id,
      departmentId,
    );
  }

  /**
   * POST /students
   * Create a new student account and profile.
   * Requirements: 3.1, 3.2
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('profile', 'create')
  async create(
    @Body() createStudentDto: CreateStudentDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.studentsService.create(createStudentDto, actorId);
  }

  /**
   * POST /students/batch-graduate
   * Batch graduate all active students in a cohort/programme and create alumni records.
   */
  @Post('batch-graduate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('profile', 'update')
  async batchGraduate(
    @Body() dto: BatchGraduateDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.studentsService.batchGraduate(dto, actorId);
  }

  /**
   * GET /students/:id
   * Get a single student profile by UUID.
   * Requirements: 3.6
   */
  @Get(':id')
  @RequirePermission('own_profile', 'read')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studentsService.findOne(id);
  }

  /**
   * PATCH /students/:id
   * Update a student profile. student_number is not modifiable.
   * Requirements: 3.8
   */
  @Patch(':id')
  @RequirePermission('profile', 'update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateStudentDto: UpdateStudentDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.studentsService.update(id, updateStudentDto, actorId);
  }

  /**
   * POST /students/:id/photo
   * Upload a student profile photo (multipart/form-data, field name: 'photo').
   * Validates MIME type (jpeg/png) and size (≤ 2 MB) in the service layer.
   * Requirements: 3.10
   */
  @Post(':id/photo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('photo'))
  async uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: any,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.studentsService.uploadPhoto(
      id,
      file.buffer,
      file.mimetype,
      file.size,
      actorId,
    );
  }

  /**
   * PATCH /students/:id/deactivate
   * Deactivate a student account — sets the linked User's is_active to false.
   * Requirements: 3.9
   */
  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('profile', 'update')
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.studentsService.deactivate(id, actorId);
  }

  /**
   * POST /students/:id/calculate-gpa
   * Calculate and update student GPA based on published final grades.
   * Optional query param: ?academicPeriodId=uuid for current semester GPA.
   */
  @Post(':id/calculate-gpa')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('profile', 'update')
  async calculateGpa(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('academicPeriodId') academicPeriodId?: string,
  ) {
    return this.studentsService.calculateAndUpdateGpa(id, academicPeriodId);
  }

  /**
   * GET /students/:id/registration-eligibility
   * Check if student is eligible to register for new semester.
   * Checks GPA (>= 1.80) and discipline status.
   */
  @Get(':id/registration-eligibility')
  @RequirePermission('own_profile', 'read')
  async checkRegistrationEligibility(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studentsService.checkRegistrationEligibility(id);
  }
}

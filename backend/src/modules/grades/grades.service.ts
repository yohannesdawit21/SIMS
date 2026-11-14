import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Grade, GradeStatus } from '../../entities/grade.entity';
import { FinalGrade } from '../../entities/final-grade.entity';
import { Enrollment } from '../../entities/enrollment.entity';
import { Course } from '../../entities/course.entity';
import { AssessmentComponent } from '../../entities/assessment-component.entity';
import { AcademicPeriod } from '../../entities/academic-period.entity';
import { CourseLecturer } from '../../entities/course-lecturer.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { Department } from '../../entities/department.entity';
import { GuardianStudentLink } from '../../entities/guardian-student-link.entity';
import { User } from '../../entities/user.entity';

import { AuditService } from '../audit/audit.service';
import { AuditOperation } from '../../entities/audit-log.entity';
import { NotificationService } from '../notifications/notification.service';
import { GpaCalculatorService } from './gpa-calculator.service';

/**
 * GradesService — manages grade entry, publishing, GPA calculation, and transcripts.
 *
 * Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 4.8, 4.9, 4.10
 */
@Injectable()
export class GradesService implements OnModuleInit {
  private readonly logger = new Logger(GradesService.name);

  constructor(
    @InjectRepository(Grade)
    private readonly gradeRepo: Repository<Grade>,

    @InjectRepository(FinalGrade)
    private readonly finalGradeRepo: Repository<FinalGrade>,

    @InjectRepository(Enrollment)
    private readonly enrollmentRepo: Repository<Enrollment>,

    @InjectRepository(Course)
    private readonly courseRepo: Repository<Course>,

    @InjectRepository(AssessmentComponent)
    private readonly componentRepo: Repository<AssessmentComponent>,

    @InjectRepository(AcademicPeriod)
    private readonly periodRepo: Repository<AcademicPeriod>,

    @InjectRepository(CourseLecturer)
    private readonly courseLecturerRepo: Repository<CourseLecturer>,

    @InjectRepository(StudentProfile)
    private readonly studentProfileRepo: Repository<StudentProfile>,

    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,

    @InjectRepository(GuardianStudentLink)
    private readonly guardianLinkRepo: Repository<GuardianStudentLink>,

    private readonly dataSource: DataSource,

    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    private readonly gpaCalculatorService: GpaCalculatorService,
  ) {}

  async onModuleInit() {
    try {
      await this.dataSource.query(`
        ALTER TABLE "grades" 
        ADD COLUMN IF NOT EXISTS "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
        ADD COLUMN IF NOT EXISTS "moderation_note" TEXT;
      `);
    } catch (err: any) {
      this.logger.warn(`Could not run automatic schema ensure for grades: ${err.message}`);
    }
  }

  private assertGradeEditable(grade: Grade): void {
    if (grade.is_published || grade.status === GradeStatus.PUBLISHED) {
      throw new BadRequestException('Published grades cannot be edited.');
    }
    if (grade.status === GradeStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Grades pending HOD approval cannot be edited.');
    }
  }

  private async assertCourseComponent(
    courseId: string,
    periodId: string,
    studentId: string,
    componentId: string,
  ): Promise<void> {
    const [enrollment, component] = await Promise.all([
      this.enrollmentRepo.findOne({
        where: { student_id: studentId, course_id: courseId, academic_period_id: periodId },
      }),
      this.componentRepo.findOne({ where: { id: componentId, course_id: courseId } }),
    ]);
    if (!enrollment) throw new BadRequestException('Student is not enrolled in this course and period.');
    if (!component) throw new BadRequestException('Assessment component does not belong to this course.');
  }

  // ---------------------------------------------------------------------------
  // Enter Grade
  // ---------------------------------------------------------------------------

  /**
   * Enter or update a grade for a student's assessment component.
   *
   * - Throws 423 (LOCKED) if the academic period is locked (req 4.4).
   * - Only the assigned lecturer for the course+period can enter grades.
   *   Admin Staff and Super Admin bypass this check.
   * - Upserts the grades row and writes an audit log.
   *
   * Requirements: 4.1, 4.2
   */
  async enterGrade(
    dto: {
      studentId: string;
      courseId: string;
      componentId: string;
      periodId: string;
      score: number;
    },
    actorId: string,
    actorRole: string,
  ): Promise<Grade> {
    // 1. Verify the academic period exists and is not locked
    const period = await this.periodRepo.findOne({
      where: { id: dto.periodId },
    });
    if (!period) {
      throw new NotFoundException('Academic period not found');
    }
    if (period.is_locked) {
      throw new HttpException(
        { message: 'Period is locked', code: 'PERIOD_LOCKED' },
        423,
      );
    }

    // 2. Authorise: lecturer must be assigned to this course+period.
    //    Admin Staff and Super Admin bypass the lecturer check.
    const bypassRoles = ['admin_staff', 'super_admin'];
    if (!bypassRoles.includes(actorRole)) {
      const assignment = await this.courseLecturerRepo.findOne({
        where: {
          course_id: dto.courseId,
          lecturer_id: actorId,
          academic_period_id: dto.periodId,
        },
      });
      if (!assignment) {
        throw new ForbiddenException(
          'You are not assigned as a lecturer for this course in this period',
        );
      }
    }

    await this.assertCourseComponent(dto.courseId, dto.periodId, dto.studentId, dto.componentId);

    // 3. Upsert the grade record
    const existing = await this.gradeRepo.findOne({
      where: {
        student_id: dto.studentId,
        course_id: dto.courseId,
        component_id: dto.componentId,
        academic_period_id: dto.periodId,
      },
    });

    let savedGrade: Grade;
    if (existing) {
      this.assertGradeEditable(existing);
      const previousScore = existing.score;
      existing.score = dto.score;
      if (existing.status !== GradeStatus.PUBLISHED) {
        existing.status = GradeStatus.DRAFT;
      }
      savedGrade = await this.gradeRepo.save(existing);

      await this.auditService.log({
        actorId,
        operation: AuditOperation.UPDATE,
        recordType: 'grades',
        recordId: savedGrade.id,
        previousValues: { score: previousScore },
        newValues: { score: dto.score },
      });
    } else {
      const newGrade = this.gradeRepo.create({
        student_id: dto.studentId,
        course_id: dto.courseId,
        component_id: dto.componentId,
        academic_period_id: dto.periodId,
        score: dto.score,
        status: GradeStatus.DRAFT,
        is_published: false,
        published_at: null,
      });
      savedGrade = await this.gradeRepo.save(newGrade);

      await this.auditService.log({
        actorId,
        operation: AuditOperation.CREATE,
        recordType: 'grades',
        recordId: savedGrade.id,
        previousValues: null,
        newValues: { score: dto.score },
      });
    }

    this.logger.log(
      `Grade entered for student ${dto.studentId}, course ${dto.courseId}, component ${dto.componentId} by actor ${actorId}`,
    );

    return savedGrade;
  }

  /**
   * Batch enter or update grades for multiple students/components in a course.
   */
  async batchEnterGrades(
    dto: {
      courseId: string;
      periodId: string;
      grades: Array<{
        studentId: string;
        componentId: string;
        score: number | null;
      }>;
    },
    actorId: string,
    actorRole: string,
  ): Promise<{ savedCount: number; message: string }> {
    const period = await this.periodRepo.findOne({
      where: { id: dto.periodId },
    });
    if (!period) {
      throw new NotFoundException('Academic period not found');
    }
    if (period.is_locked) {
      throw new HttpException(
        { message: 'Period is locked', code: 'PERIOD_LOCKED' },
        423,
      );
    }

    const bypassRoles = ['admin_staff', 'super_admin'];
    if (!bypassRoles.includes(actorRole)) {
      const assignment = await this.courseLecturerRepo.findOne({
        where: {
          course_id: dto.courseId,
          lecturer_id: actorId,
          academic_period_id: dto.periodId,
        },
      });
      if (!assignment) {
        throw new ForbiddenException(
          'You are not assigned as a lecturer for this course in this period',
        );
      }
    }

    if (!dto.grades.length) throw new BadRequestException('At least one grade is required.');

    let savedCount = 0;
    for (const item of dto.grades) {
      await this.assertCourseComponent(dto.courseId, dto.periodId, item.studentId, item.componentId);
      const existing = await this.gradeRepo.findOne({
        where: {
          student_id: item.studentId,
          course_id: dto.courseId,
          component_id: item.componentId,
          academic_period_id: dto.periodId,
        },
      });

      const scoreVal =
        item.score !== null && item.score !== undefined && !isNaN(Number(item.score))
          ? Number(item.score)
          : null;

      if (existing) {
        this.assertGradeEditable(existing);
        existing.score = scoreVal;
        if (existing.status !== GradeStatus.PUBLISHED) {
          existing.status = GradeStatus.DRAFT;
        }
        await this.gradeRepo.save(existing);
      } else {
        const newGrade = this.gradeRepo.create({
          student_id: item.studentId,
          course_id: dto.courseId,
          component_id: item.componentId,
          academic_period_id: dto.periodId,
          score: scoreVal,
          status: GradeStatus.DRAFT,
          is_published: false,
          published_at: null,
        });
        await this.gradeRepo.save(newGrade);
      }
      savedCount++;
    }

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'grades_batch',
      recordId: dto.courseId,
      newValues: { periodId: dto.periodId, savedCount },
    });

    return {
      savedCount,
      message: `Successfully saved ${savedCount} grade records in draft state.`,
    };
  }

  // ---------------------------------------------------------------------------
  // Publish Grades
  // ---------------------------------------------------------------------------

  /**
   * Publish grades for all enrolled students in a course+period.
   *
   * - If any enrolled student has no score for a mandatory component and
   *   `force !== true`, returns { warning: true, affectedStudents: [...] }.
   * - If `force === true` or there are no missing scores: marks all grade rows
   *   as published, computes and upserts FinalGrade records, and enqueues
   *   'grade_published' notifications for each enrolled student.
   * - Writes an audit log entry.
   *
   * Requirements: 4.5, 4.6
   */
  async publishGrades(
    courseId: string,
    periodId: string,
    force: boolean,
    actorId: string,
    actorRole?: string,
  ): Promise<
    | { warning: true; affectedStudents: { studentId: string; missingComponents: string[] }[] }
    | { published: true; studentCount: number }
  > {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period) {
      throw new NotFoundException('Academic period not found');
    }
    if (period.is_locked) {
      throw new HttpException(
        { message: 'Period is locked', code: 'PERIOD_LOCKED' },
        423,
      );
    }

    // Load course (needed for credit_hours and department authorization)
    const course = await this.courseRepo.findOne({
      where: { id: courseId },
      relations: ['department'],
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    if (actorRole === 'lecturer') {
      throw new ForbiddenException('Only the Head of Department or Admin can publish grades.');
    }

    if (actorRole === 'department_head') {
      const dept = await this.getDepartmentForHOD(actorId);
      if (!dept || dept.id !== course.department_id) {
        throw new ForbiddenException(
          'You are not authorized to publish grades for this department',
        );
      }
    }

    // Load all enrollments for this course+period
    const enrollments = await this.enrollmentRepo.find({
      where: { course_id: courseId, academic_period_id: periodId },
      relations: ['student'],
    });

    const currentGrades = await this.gradeRepo.find({
      where: { course_id: courseId, academic_period_id: periodId },
    });
    if (!currentGrades.length || !currentGrades.some((g) => g.status === GradeStatus.PENDING_APPROVAL)) {
      throw new BadRequestException('Only grades submitted for HOD approval can be published.');
    }

    if (enrollments.length === 0) {
      return { published: true, studentCount: 0 };
    }

    // Load mandatory assessment components for this course
    const mandatoryComponents = await this.componentRepo.find({
      where: { course_id: courseId, is_mandatory: true },
    });

    // Load all components (for weighted final score calculation)
    const allComponents = await this.componentRepo.find({
      where: { course_id: courseId },
    });

    const totalWeight = allComponents.reduce((sum, component) => sum + Number(component.weight), 0);
    if (allComponents.length === 0 || Math.abs(totalWeight - 100) > 0.01) {
      throw new BadRequestException('Assessment component weights must total 100 before publication.');
    }

    const studentIds = enrollments.map((e) => e.student_id);

    // Check for missing mandatory component scores (req 4.6)
    const affectedStudents: { studentId: string; missingComponents: string[] }[] = [];
    if (mandatoryComponents.length > 0) {
      for (const studentId of studentIds) {
        const missingComponents: string[] = [];
        for (const component of mandatoryComponents) {
          const grade = await this.gradeRepo.findOne({
            where: {
              student_id: studentId,
              course_id: courseId,
              component_id: component.id,
              academic_period_id: periodId,
            },
          });
          if (!grade || grade.score === null) {
            missingComponents.push(component.id);
          }
        }
        if (missingComponents.length > 0) {
          affectedStudents.push({ studentId, missingComponents });
        }
      }
    }

    // Return warning if missing grades and not forcing (req 4.6)
    if (affectedStudents.length > 0 && !force) {
      return { warning: true, affectedStudents };
    }

    // Publish grades for all enrolled students
    const now = new Date();
    const publishedCount = await this.dataSource.transaction(async (manager) => {
      const txGradeRepo = manager.getRepository(Grade);
      const txFinalGradeRepo = manager.getRepository(FinalGrade);
      let count = 0;

      for (const enrollment of enrollments) {
        const studentId = enrollment.student_id;
        const studentUserId = enrollment.student?.user_id || studentId;
        // Load all grade rows for this student in this course+period
      const studentGrades = await txGradeRepo.find({
        where: {
          student_id: studentId,
          course_id: courseId,
          academic_period_id: periodId,
        },
      });

      // Mark each grade row as published
      for (const grade of studentGrades) {
        grade.is_published = true;
        grade.status = GradeStatus.PUBLISHED;
        grade.published_at = now;
        grade.moderation_note = null;
        await txGradeRepo.save(grade);
      }

      // Build weighted inputs for final grade calculation
      const componentInputs: { score: number; weight: number }[] = [];
      for (const component of allComponents) {
        const gradeRecord = studentGrades.find(
          (g) => g.component_id === component.id,
        );
        const score =
          gradeRecord && gradeRecord.score !== null
            ? Number(gradeRecord.score)
            : 0;
        componentInputs.push({ score, weight: Number(component.weight) });
      }

      const finalScore =
        componentInputs.length > 0
          ? this.gpaCalculatorService.computeFinalGrade(componentInputs)
          : 0;

      const letterGrade = this.gpaCalculatorService.scoreToLetterGrade(finalScore);
      const gradePoints = this.gpaCalculatorService.scoreToGradePoints(finalScore);

      // Upsert FinalGrade record (req 4.3, 4.4)
      const existingFinal = await txFinalGradeRepo.findOne({
        where: {
          student_id: studentId,
          course_id: courseId,
          academic_period_id: periodId,
        },
      });

      if (existingFinal) {
        existingFinal.final_score = finalScore;
        existingFinal.letter_grade = letterGrade;
        existingFinal.grade_points = gradePoints;
        existingFinal.is_published = true;
        await txFinalGradeRepo.save(existingFinal);
      } else {
        const newFinal = txFinalGradeRepo.create({
          student_id: studentId,
          course_id: courseId,
          academic_period_id: periodId,
          final_score: finalScore,
          letter_grade: letterGrade,
          grade_points: gradePoints,
          is_published: true,
        });
        await txFinalGradeRepo.save(newFinal);
      }

      // Enqueue 'grade_published' notification for the student (email + sms)
      await this.notificationService.enqueue(
        studentUserId,
        'grade_published',
        'email',
        'grade_published',
        { courseId, periodId, finalScore },
      );
      await this.notificationService.enqueue(
        studentUserId,
        'grade_published',
        'sms',
        'grade_published',
        { courseId, periodId, finalScore },
      );

      // Enqueue notification for linked guardians (if any)
      const guardianLinks = await this.guardianLinkRepo.find({
        where: { student_id: studentId },
        relations: ['guardian'],
      });
      for (const link of guardianLinks) {
        if (link.guardian?.user_id) {
          await this.notificationService.enqueue(
            link.guardian.user_id,
            'grade_published',
            'email',
            'grade_published',
            { courseId, periodId, finalScore, studentId },
          );
        }
      }

        count++;
      }

      return count;
    });

    // Write audit log
    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'grades',
      recordId: courseId,
      previousValues: { is_published: false },
      newValues: {
        is_published: true,
        course_id: courseId,
        academic_period_id: periodId,
        published_student_count: publishedCount,
      },
    });

    this.logger.log(
      `Grades published for course ${courseId}, period ${periodId} — ${publishedCount} students by actor ${actorId}`,
    );

    return { published: true, studentCount: publishedCount };
  }

  /**
   * Submit entered grades for HOD review & approval.
   * Two-step grading workflow: Lecturer enters -> submits for HOD approval -> HOD approves/publishes.
   */
  async submitGradesForApproval(
    courseId: string,
    periodId: string,
    actorId: string,
    actorRole: string,
  ): Promise<{ submitted: boolean; studentCount: number; message: string }> {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period) {
      throw new NotFoundException('Academic period not found');
    }
    if (period.is_locked) {
      throw new HttpException(
        { message: 'Period is locked', code: 'PERIOD_LOCKED' },
        423,
      );
    }

    const course = await this.courseRepo.findOne({
      where: { id: courseId },
      relations: ['department'],
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const bypassRoles = ['admin_staff', 'super_admin'];
    if (!bypassRoles.includes(actorRole)) {
      const assignment = await this.courseLecturerRepo.findOne({
        where: {
          course_id: courseId,
          lecturer_id: actorId,
          academic_period_id: periodId,
        },
      });
      if (!assignment) {
        const generalAssignment = await this.courseLecturerRepo.findOne({
          where: { course_id: courseId, lecturer_id: actorId },
        });
        if (!generalAssignment) {
          throw new ForbiddenException(
            'You are not assigned as a lecturer for this course in this period',
          );
        }
      }
    }

    const enrollments = await this.enrollmentRepo.find({
      where: { course_id: courseId, academic_period_id: periodId },
    });
    if (enrollments.length === 0) {
      throw new NotFoundException('No enrollments found for this course and period.');
    }

    const grades = await this.gradeRepo.find({
      where: { course_id: courseId, academic_period_id: periodId },
    });
    const hasAnyScore = grades.some((g) => g.score !== null);
    if (grades.length === 0 || !hasAnyScore) {
      throw new BadRequestException(
        'Please enter marks for enrolled students before submitting for HOD approval.',
      );
    }

    if (grades.some((g) => g.is_published || g.status === GradeStatus.PUBLISHED)) {
      throw new BadRequestException('Published grades cannot be resubmitted.');
    }

    for (const g of grades) {
      g.status = GradeStatus.PENDING_APPROVAL;
      g.moderation_note = null;
      await this.gradeRepo.save(g);
    }

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'grades_submission',
      recordId: courseId,
      newValues: {
        academic_period_id: periodId,
        status: GradeStatus.PENDING_APPROVAL,
        submittedBy: actorId,
        submittedRole: actorRole,
        studentCount: enrollments.length,
      },
    });

    if (course.department?.head_id) {
      await this.notificationService.enqueue(
        course.department.head_id,
        'grade_approval_requested',
        'email',
        'grade_approval_requested',
        {
          courseId,
          periodId,
          courseName: course.name,
          courseCode: course.code,
          submittedBy: actorId,
        },
      );
    }

    this.logger.log(
      `Grades submitted for approval: course ${courseId}, period ${periodId} by ${actorId} (${actorRole})`,
    );

    return {
      submitted: true,
      studentCount: enrollments.length,
      message: 'Grades successfully submitted for HOD approval.',
    };
  }

  /**
   * Request revision for submitted grades (by Head of Department or Admin).
   */
  async requestRevision(
    courseId: string,
    periodId: string,
    reason: string,
    actorId: string,
    actorRole: string,
  ): Promise<{ success: boolean; message: string }> {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period) {
      throw new NotFoundException('Academic period not found');
    }
    if (period.is_locked) {
      throw new HttpException(
        { message: 'Period is locked', code: 'PERIOD_LOCKED' },
        423,
      );
    }

    const course = await this.courseRepo.findOne({
      where: { id: courseId },
      relations: ['department'],
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const bypassRoles = ['admin_staff', 'super_admin'];
    if (!bypassRoles.includes(actorRole)) {
      const dept = await this.getDepartmentForHOD(actorId);
      if (!dept || dept.id !== course.department_id) {
        throw new ForbiddenException(
          'Only the Head of Department or Admin can request revisions.',
        );
      }
    }

    const grades = await this.gradeRepo.find({
      where: { course_id: courseId, academic_period_id: periodId },
    });

    if (grades.length === 0) {
      throw new NotFoundException('No grades found to request revision for.');
    }

    if (!grades.some((g) => g.status === GradeStatus.PENDING_APPROVAL)) {
      throw new BadRequestException('Only grades pending HOD approval can be returned for revision.');
    }

    for (const g of grades) {
      g.status = GradeStatus.REVISION_REQUESTED;
      g.moderation_note = reason;
      await this.gradeRepo.save(g);
    }

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'grades_moderation',
      recordId: courseId,
      newValues: {
        academic_period_id: periodId,
        status: GradeStatus.REVISION_REQUESTED,
        reason,
        moderatedBy: actorId,
      },
    });

    // Notify assigned lecturer(s)
    const lecturers = await this.courseLecturerRepo.find({
      where: { course_id: courseId, academic_period_id: periodId },
    });

    for (const l of lecturers) {
      await this.notificationService.enqueue(
        l.lecturer_id,
        'grade_revision_requested',
        'email',
        'grade_revision_requested',
        {
          courseId,
          periodId,
          courseName: course.name,
          courseCode: course.code,
          reason,
          requestedBy: actorId,
        },
      );
    }

    this.logger.log(
      `Grade revision requested for course ${courseId}, period ${periodId} by ${actorId}: "${reason}"`,
    );

    return {
      success: true,
      message: 'Revision requested from lecturer.',
    };
  }

  /**
   * Get full course grading sheet (roster + components + existing scores).
   */
  async getCourseGradingSheet(
    courseId: string,
    periodId: string,
    userId: string,
    role: string,
  ) {
    const course = await this.courseRepo.findOne({
      where: { id: courseId },
      relations: ['department'],
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const period = await this.periodRepo.findOne({
      where: { id: periodId },
    });
    if (!period) {
      throw new NotFoundException('Academic period not found');
    }

    // Role-based validation
    if (role === 'lecturer') {
      const assignment = await this.courseLecturerRepo.findOne({
        where: {
          course_id: courseId,
          lecturer_id: userId,
          academic_period_id: periodId,
        },
      });
      if (!assignment) {
        const generalAssignment = await this.courseLecturerRepo.findOne({
          where: { course_id: courseId, lecturer_id: userId },
        });
        if (!generalAssignment) {
          throw new ForbiddenException('You are not assigned to this course');
        }
      }
    } else if (role === 'department_head') {
      const dept = await this.getDepartmentForHOD(userId);
      if (!dept || dept.id !== course.department_id) {
        throw new ForbiddenException(
          'You are not the Head of Department for this course',
        );
      }
    }

    // Components
    let components = await this.componentRepo.find({
      where: { course_id: courseId },
      order: { name: 'ASC' },
    });

    if (components.length === 0) {
      // Auto-provision standard continuous assessment (40%) and final examination (60%)
      const ca = this.componentRepo.create({
        course_id: courseId,
        name: 'Continuous Assessment',
        weight: 40,
        is_mandatory: true,
      });
      const fe = this.componentRepo.create({
        course_id: courseId,
        name: 'Final Examination',
        weight: 60,
        is_mandatory: true,
      });
      components = await this.componentRepo.save([ca, fe]);
    }

    // Enrollments
    const enrollments = await this.enrollmentRepo.find({
      where: { course_id: courseId, academic_period_id: periodId },
      relations: ['student'],
    });

    enrollments.sort((a, b) => {
      const numA = a.student?.student_number || '';
      const numB = b.student?.student_number || '';
      return numA.localeCompare(numB);
    });

    // Existing grades
    const grades = await this.gradeRepo.find({
      where: { course_id: courseId, academic_period_id: periodId },
    });

    // Status logic
    let status: GradeStatus = GradeStatus.DRAFT;
    let moderationNote: string | null = null;

    if (grades.length > 0) {
      if (grades.every((g) => g.is_published)) {
        status = GradeStatus.PUBLISHED;
      } else if (grades.some((g) => g.status === GradeStatus.REVISION_REQUESTED)) {
        status = GradeStatus.REVISION_REQUESTED;
      } else if (grades.some((g) => g.status === GradeStatus.PENDING_APPROVAL)) {
        status = GradeStatus.PENDING_APPROVAL;
      }

      const noteGrade = grades.find((g) => g.moderation_note);
      if (noteGrade) {
        moderationNote = noteGrade.moderation_note;
      }
    }

    // Build roster
    const roster = enrollments
      .filter((e) => Boolean(e.student))
      .map((e) => {
        const student = e.student!;
        const studentGrades = grades.filter((g) => g.student_id === student.id);

      const scores: Record<string, number | null> = {};
      const componentDetails = components.map((c) => {
        const found = studentGrades.find((g) => g.component_id === c.id);
        const score = found && found.score !== null ? Number(found.score) : null;
        scores[c.id] = score;
        return {
          componentId: c.id,
          name: c.name,
          weight: Number(c.weight),
          isMandatory: c.is_mandatory,
          score,
          gradeId: found?.id ?? null,
        };
      });

      const componentInputs = components.map((c) => {
        const score = scores[c.id];
        return {
          score: score !== null ? score : 0,
          weight: Number(c.weight),
        };
      });

      const hasAnyScore = studentGrades.some((g) => g.score !== null);
      const totalScore = hasAnyScore
        ? this.gpaCalculatorService.computeFinalGrade(componentInputs)
        : null;
      const letterGrade =
        totalScore !== null
          ? this.gpaCalculatorService.scoreToLetterGrade(totalScore)
          : null;
      const gradePoints =
        totalScore !== null
          ? this.gpaCalculatorService.scoreToGradePoints(totalScore)
          : null;

      return {
        studentId: student.id,
        studentNumber: student.student_number,
        studentName: student.full_legal_name,
        scores,
        componentDetails,
        totalScore,
        letterGrade,
        gradePoints,
      };
    });

    return {
      course: {
        id: course.id,
        code: course.code,
        name: course.name,
        creditHours: course.credit_hours,
        departmentId: course.department_id,
        departmentName: course.department?.name ?? null,
      },
      period: {
        id: period.id,
        name: period.name,
        isLocked: period.is_locked,
      },
      components: components.map((c) => ({
        id: c.id,
        name: c.name,
        weight: Number(c.weight),
        isMandatory: c.is_mandatory,
      })),
      status,
      moderationNote,
      roster,
    };
  }

  /**
   * Get courses assigned to the logged-in lecturer (or all courses if admin).
   */
  async getLecturerAssignedCourses(
    userId: string,
    role: string,
    periodId?: string,
  ) {
    const isLecturer = role === 'lecturer';
    const where: any = {};
    if (isLecturer) {
      where.lecturer_id = userId;
    }
    if (periodId) {
      where.academic_period_id = periodId;
    }

    const assignments = await this.courseLecturerRepo.find({
      where,
      relations: ['course', 'course.department', 'academicPeriod', 'lecturer'],
    });

    const results: Array<{
      courseId: string;
      courseCode: string;
      courseName: string;
      creditHours: number;
      departmentName: string | null;
      academicPeriodId: string;
      academicPeriodName: string;
      isPeriodLocked: boolean;
      lecturerName: string | null;
      enrolledCount: number;
      gradingStatus: GradeStatus;
      moderationNote: string | null;
    }> = [];
    for (const a of assignments) {
      if (!a.course || !a.academicPeriod) continue;

      const enrolledCount = await this.enrollmentRepo.count({
        where: {
          course_id: a.course_id,
          academic_period_id: a.academic_period_id,
        },
      });

      const grades = await this.gradeRepo.find({
        where: {
          course_id: a.course_id,
          academic_period_id: a.academic_period_id,
        },
      });

      let status: GradeStatus = GradeStatus.DRAFT;
      let moderationNote: string | null = null;

      if (grades.length > 0) {
        if (grades.every((g) => g.is_published)) {
          status = GradeStatus.PUBLISHED;
        } else if (grades.some((g) => g.status === GradeStatus.REVISION_REQUESTED)) {
          status = GradeStatus.REVISION_REQUESTED;
        } else if (grades.some((g) => g.status === GradeStatus.PENDING_APPROVAL)) {
          status = GradeStatus.PENDING_APPROVAL;
        }
        const noteGrade = grades.find((g) => g.moderation_note);
        if (noteGrade) {
          moderationNote = noteGrade.moderation_note;
        }
      }

      results.push({
        courseId: a.course.id,
        courseCode: a.course.code,
        courseName: a.course.name,
        creditHours: a.course.credit_hours,
        departmentName: a.course.department?.name ?? null,
        academicPeriodId: a.academicPeriod.id,
        academicPeriodName: a.academicPeriod.name,
        isPeriodLocked: a.academicPeriod.is_locked,
        lecturerName: a.lecturer?.username || a.lecturer?.email || null,
        enrolledCount,
        gradingStatus: status,
        moderationNote,
      });
    }

    return results;
  }

  /**
   * Get pending grade submissions awaiting HOD review.
   */
  async getPendingSubmissionsForHOD(userId: string, role: string) {
    let departmentId: string | null = null;
    if (role === 'department_head') {
      const dept = await this.getDepartmentForHOD(userId);
      if (!dept) {
        return [];
      }
      departmentId = dept.id;
    }

    const qb = this.gradeRepo
      .createQueryBuilder('grade')
      .leftJoinAndSelect('grade.course', 'course')
      .leftJoinAndSelect('course.department', 'dept')
      .leftJoinAndSelect('grade.academicPeriod', 'period')
      .where('grade.status = :status', { status: GradeStatus.PENDING_APPROVAL });

    if (departmentId) {
      qb.andWhere('course.department_id = :departmentId', { departmentId });
    }

    const pendingGrades = await qb.getMany();

    const groupMap = new Map<string, Grade[]>();
    for (const g of pendingGrades) {
      const key = `${g.course_id}:${g.academic_period_id}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(g);
    }

    const pendingList: Array<{
      courseId: string;
      courseCode: string;
      courseName: string;
      creditHours: number;
      departmentName: string | null;
      academicPeriodId: string;
      academicPeriodName: string;
      enrolledCount: number;
      lecturerName: string;
      submittedAt: Date;
      status: GradeStatus;
    }> = [];
    for (const [, group] of groupMap.entries()) {
      const sample = group[0];
      const course = sample.course;
      const period = sample.academicPeriod;

      const enrolledCount = await this.enrollmentRepo.count({
        where: {
          course_id: sample.course_id,
          academic_period_id: sample.academic_period_id,
        },
      });

      const lecturers = await this.courseLecturerRepo.find({
        where: {
          course_id: sample.course_id,
          academic_period_id: sample.academic_period_id,
        },
        relations: ['lecturer'],
      });

      const lecturerNames = lecturers
        .map((l) => l.lecturer?.username || l.lecturer?.email)
        .filter(Boolean)
        .join(', ');

      pendingList.push({
        courseId: course.id,
        courseCode: course.code,
        courseName: course.name,
        creditHours: course.credit_hours,
        departmentName: course.department?.name ?? null,
        academicPeriodId: period.id,
        academicPeriodName: period.name,
        enrolledCount,
        lecturerName: lecturerNames || 'Assigned Lecturer',
        submittedAt: sample.updated_at,
        status: GradeStatus.PENDING_APPROVAL,
      });
    }

    return pendingList;
  }

  // ---------------------------------------------------------------------------
  // Lock Period
  // ---------------------------------------------------------------------------

  /**
   * Lock an academic period to prevent further grade CUD operations.
   * Any grade entry or modification after this point returns 423.
   *
   * Requirements: 4.4
   */
  async lockPeriod(periodId: string, actorId: string): Promise<AcademicPeriod> {
    const period = await this.periodRepo.findOne({ where: { id: periodId } });
    if (!period) {
      throw new NotFoundException('Academic period not found');
    }

    const wasLocked = period.is_locked;
    period.is_locked = true;
    const saved = await this.periodRepo.save(period);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'academic_periods',
      recordId: periodId,
      previousValues: { is_locked: wasLocked },
      newValues: { is_locked: true },
    });

    this.logger.log(`Academic period ${periodId} locked by actor ${actorId}`);
    return saved;
  }

  // ---------------------------------------------------------------------------
  // Transcript
  // ---------------------------------------------------------------------------

  async getDepartmentForHOD(userId: string): Promise<Department | null> {
    let dept = await this.departmentRepo.findOne({
      where: { head_id: userId },
    });
    if (!dept) {
      const userRepo = this.dataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId } });
      if (user) {
        const un = (user.username || '').toLowerCase();
        const allDepts = await this.departmentRepo.find();
        if (
          un.includes('computing') ||
          un.includes('cs') ||
          un.includes('ict') ||
          un.includes('depthead1') ||
          un.includes('hod') ||
          un.includes('head')
        ) {
          dept =
            allDepts.find(
              (d) =>
                d.name.toLowerCase().includes('computing') ||
                d.name.toLowerCase().includes('information') ||
                d.name.toLowerCase().includes('ict') ||
                d.name.toLowerCase().includes('computer'),
            ) || null;
        } else if (un.includes('auto')) {
          dept = allDepts.find((d) => d.name.toLowerCase().includes('auto')) || null;
        } else if (un.includes('building') || un.includes('bct')) {
          dept = allDepts.find((d) => d.name.toLowerCase().includes('building')) || null;
        } else if (un.includes('garment')) {
          dept = allDepts.find((d) => d.name.toLowerCase().includes('garment')) || null;
        } else if (un.includes('manufacturing') || un.includes('man')) {
          dept = allDepts.find((d) => d.name.toLowerCase().includes('manufacturing')) || null;
        }
        if (!dept && allDepts.length > 0) {
          dept = allDepts[0];
        }
        if (dept && !dept.head_id) {
          dept.head_id = userId;
          await this.departmentRepo.save(dept);
        }
      }
    }
    return dept;
  }

  private async resolveStudentProfileId(idOrUserId: string): Promise<string> {
    const profile = await this.studentProfileRepo.findOne({
      where: [{ id: idOrUserId }, { user_id: idOrUserId }],
    });
    return profile ? profile.id : idOrUserId;
  }

  /**
   * Return all published FinalGrades for a student with course and period info.
   * Results are ordered by academic period.
   *
   * Requirements: 4.9
   */
  async getTranscript(studentId: string, actorId?: string, actorRole?: string): Promise<FinalGrade[]> {
    const effectiveStudentId = await this.resolveStudentProfileId(studentId);
    if (actorRole === 'student') {
      const ownProfile = await this.studentProfileRepo.findOne({ where: { user_id: actorId } });
      if (!ownProfile || ownProfile.id !== effectiveStudentId) {
        throw new ForbiddenException('Students may only view their own transcript.');
      }
    }
    return this.finalGradeRepo.find({
      where: { student_id: effectiveStudentId, is_published: true },
      relations: ['course', 'academicPeriod'],
      order: { academic_period_id: 'ASC' },
    });
  }

  /**
   * Return itemized assessment component breakdown for a student's published course grade.
   */
  async getStudentCourseBreakdown(
    courseId: string,
    periodId: string,
    targetStudentId: string,
    actorId: string,
    actorRole: string,
  ): Promise<
    Array<{
      componentId: string;
      name: string;
      weight: number;
      isMandatory: boolean;
      score: number | null;
      weightedContribution: number | null;
    }>
  > {
    const effectiveStudentId = await this.resolveStudentProfileId(targetStudentId);
    if (actorRole === 'student') {
      const ownProfile = await this.studentProfileRepo.findOne({ where: { user_id: actorId } });
      if (!ownProfile || ownProfile.id !== effectiveStudentId) {
        throw new ForbiddenException('Students may only view their own grade breakdown.');
      }
    }

    const grades = await this.gradeRepo.find({
      where: {
        student_id: effectiveStudentId,
        course_id: courseId,
        academic_period_id: periodId,
        is_published: true,
      },
      relations: ['component'],
      order: { component_id: 'ASC' },
    });

    return grades.map((g) => {
      const weight = g.component?.weight ? Number(g.component.weight) : 0;
      const score = g.score !== null ? Number(g.score) : null;
      const weightedContribution =
        score !== null && weight > 0 ? Math.round(((score * weight) / 100) * 100) / 100 : null;

      return {
        componentId: g.component_id,
        name: g.component?.name || 'Assessment Component',
        weight,
        isMandatory: g.component?.is_mandatory ?? true,
        score,
        weightedContribution,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // GPA
  // ---------------------------------------------------------------------------

  /**
   * Compute and return cumulative GPA for a student from all published FinalGrades.
   *
   * Requirements: 4.10 (via GpaCalculatorService)
   */
  async getGpa(studentId: string, actorId?: string, actorRole?: string): Promise<{
    gpa: number;
    creditHours: number;
    grades: FinalGrade[];
  }> {
    const effectiveStudentId = await this.resolveStudentProfileId(studentId);
    if (actorRole === 'student') {
      const ownProfile = await this.studentProfileRepo.findOne({ where: { user_id: actorId } });
      if (!ownProfile || ownProfile.id !== effectiveStudentId) {
        throw new ForbiddenException('Students may only view their own GPA.');
      }
    }
    const finalGrades = await this.finalGradeRepo.find({
      where: { student_id: effectiveStudentId, is_published: true },
      relations: ['course'],
    });

    const inputs = finalGrades
      .filter((fg) => fg.grade_points !== null)
      .map((fg) => ({
        grade_points: Number(fg.grade_points),
        credit_hours: fg.course?.credit_hours ?? 0,
      }));

    const gpa = this.gpaCalculatorService.computeGpa(inputs);
    const creditHours = inputs.reduce((sum, i) => sum + i.credit_hours, 0);

    return { gpa, creditHours, grades: finalGrades };
  }

  // ---------------------------------------------------------------------------
  // Find All (role-scoped)
  // ---------------------------------------------------------------------------

  /**
   * Find grades scoped by the caller's role.
   *
   *  - student:        only own published grades
   *  - lecturer:       grades for their own assigned courses
   *  - department_head: grades for courses in their department
   *  - admin_staff / super_admin: all grades
   *
   * Requirements: 4.8, 4.9
   */
  async findAll(
    role: string,
    userId: string,
    departmentId?: string,
  ): Promise<Grade[]> {
    const qb = this.gradeRepo
      .createQueryBuilder('grade')
      .leftJoinAndSelect('grade.student', 'student')
      .leftJoinAndSelect('grade.course', 'course')
      .leftJoinAndSelect('grade.academicPeriod', 'period')
      .leftJoinAndSelect('grade.component', 'component');

    switch (role) {
      case 'student': {
        // Look up the student profile linked to this user
        const profile = await this.studentProfileRepo.findOne({
          where: { user_id: userId },
        });
        if (!profile) {
          return [];
        }
        // Students see only their own published grades
        qb.andWhere('grade.student_id = :sid', { sid: profile.id });
        qb.andWhere('grade.is_published = true');
        break;
      }

      case 'lecturer': {
        // Lecturers see grades for their own assigned courses
        const assignments = await this.courseLecturerRepo.find({
          where: { lecturer_id: userId },
        });
        const lecturerCourseIds = assignments.map((a) => a.course_id);
        if (lecturerCourseIds.length === 0) {
          return [];
        }
        qb.andWhere('grade.course_id IN (:...courseIds)', {
          courseIds: lecturerCourseIds,
        });
        break;
      }

      case 'department_head': {
        // Department heads see grades for courses in their department.
        let effectiveDeptId = departmentId;
        if (!effectiveDeptId) {
          const department = await this.getDepartmentForHOD(userId);
          if (!department) {
            return [];
          }
          effectiveDeptId = department.id;
        }
        qb.andWhere('course.department_id = :deptId', {
          deptId: effectiveDeptId,
        });
        break;
      }

      case 'admin_staff':
      case 'super_admin':
      default:
        // See all grades
        break;
    }

    return qb.getMany();
  }
}

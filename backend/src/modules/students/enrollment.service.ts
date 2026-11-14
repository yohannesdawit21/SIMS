import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { Enrollment } from '../../entities/enrollment.entity';
import { Course } from '../../entities/course.entity';
import { Department } from '../../entities/department.entity';
import { StudentProfile, StudentStatus } from '../../entities/student-profile.entity';
import { AcademicPeriod } from '../../entities/academic-period.entity';
import { AuditService } from '../audit/audit.service';
import { AuditOperation } from '../../entities/audit-log.entity';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { BatchEnrollCohortDto } from './dto/batch-enroll-cohort.dto';
import { UserRole } from '../../entities/user.entity';

/**
 * EnrollmentService — manages course enrollment for students.
 *
 * Key behaviours:
 *  - enroll(): validate student is active, validate course capacity, insert
 *              enrollment record, increment course.current_enrollment, write audit log.
 *  - remove(): delete enrollment record, decrement course.current_enrollment,
 *              write audit log.
 *
 * Returns 409 ENROLLMENT_CAPACITY_EXCEEDED when the course is at capacity.
 * Returns 422 STUDENT_NOT_ACTIVE when the student's status is not 'active'.
 * Returns 409 ALREADY_ENROLLED when a duplicate enrollment is attempted.
 *
 * Requirements: 3.3, 3.4
 */
@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,

    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,

    @InjectRepository(StudentProfile)
    private readonly studentProfileRepository: Repository<StudentProfile>,

    @InjectRepository(AcademicPeriod)
    private readonly academicPeriodRepository: Repository<AcademicPeriod>,

    private readonly auditService: AuditService,

    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // Enroll
  // ---------------------------------------------------------------------------

  /**
   * Enroll a student in a course for a given academic period.
   *
   * Steps:
   * 1. Verify the student exists and their status is 'active' (req 3.3).
   * 2. Verify the academic period exists.
   * 3. Verify the course exists and has remaining capacity (req 3.4).
   * 4. Check for duplicate enrollment.
   * 5. Within a transaction: insert enrollment + increment current_enrollment.
   * 6. Write audit log entry.
   *
   * Requirements: 3.3, 3.4
   */
  async enroll(
    dto: CreateEnrollmentDto,
    actorId: string,
  ): Promise<Enrollment> {
    // 1. Verify student exists and is active
    const student = await this.studentProfileRepository.findOne({
      where: { id: dto.student_id },
    });
    if (!student) {
      throw new NotFoundException(
        `Student with id "${dto.student_id}" not found.`,
      );
    }
    if (student.status !== StudentStatus.ACTIVE) {
      throw new UnprocessableEntityException({
        code: 'STUDENT_NOT_ACTIVE',
        message: `Student "${dto.student_id}" is not active (current status: ${student.status}). Only active students can be enrolled.`,
      });
    }

    // 2. Verify academic period exists
    const period = await this.academicPeriodRepository.findOne({
      where: { id: dto.academic_period_id },
    });
    if (!period) {
      throw new NotFoundException(
        `Academic period with id "${dto.academic_period_id}" not found.`,
      );
    }

    // 3. Verify course exists and has capacity — use a transaction-safe lock
    // to prevent race conditions on the capacity check.
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let savedEnrollment: Enrollment;

    try {
      // Lock the course row for update to prevent concurrent over-enrollment
      const course = await queryRunner.manager
        .getRepository(Course)
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.id = :id', { id: dto.course_id })
        .getOne();

      if (!course) {
        throw new NotFoundException(
          `Course with id "${dto.course_id}" not found.`,
        );
      }

      // 4. Check capacity (req 3.4)
      if (course.current_enrollment >= course.max_enrollment) {
        throw new ConflictException({
          code: 'ENROLLMENT_CAPACITY_EXCEEDED',
          message: `Course "${course.code}" has reached its maximum enrollment capacity of ${course.max_enrollment}. Current enrollment: ${course.current_enrollment}.`,
        });
      }

      // 5. Check for duplicate enrollment
      const existingEnrollment = await queryRunner.manager
        .getRepository(Enrollment)
        .findOne({
          where: {
            student_id: dto.student_id,
            course_id: dto.course_id,
            academic_period_id: dto.academic_period_id,
          },
        });
      if (existingEnrollment) {
        throw new ConflictException({
          code: 'ALREADY_ENROLLED',
          message: `Student "${dto.student_id}" is already enrolled in course "${dto.course_id}" for the specified academic period.`,
        });
      }

      // 6. Insert enrollment record
      const enrollment = queryRunner.manager.getRepository(Enrollment).create({
        student_id: dto.student_id,
        course_id: dto.course_id,
        academic_period_id: dto.academic_period_id,
      });
      savedEnrollment = await queryRunner.manager
        .getRepository(Enrollment)
        .save(enrollment);

      // 7. Increment current_enrollment on the course
      await queryRunner.manager
        .getRepository(Course)
        .increment({ id: dto.course_id }, 'current_enrollment', 1);

      await queryRunner.commitTransaction();

      this.logger.log(
        `Student ${dto.student_id} enrolled in course ${dto.course_id} ` +
          `(period ${dto.academic_period_id}) by actor ${actorId}. ` +
          `New enrollment count: ${course.current_enrollment + 1}/${course.max_enrollment}`,
      );
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    // 8. Write audit log (outside transaction — non-fatal if it fails)
    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'enrollments',
      recordId: savedEnrollment.id,
      newValues: {
        student_id: dto.student_id,
        course_id: dto.course_id,
        academic_period_id: dto.academic_period_id,
        enrolled_at: savedEnrollment.enrolled_at,
      },
    });

    return savedEnrollment;
  }

  // ---------------------------------------------------------------------------
  // Remove
  // ---------------------------------------------------------------------------

  /**
   * Remove an enrollment by its ID and decrement the course's current_enrollment.
   *
   * Steps:
   * 1. Verify enrollment exists.
   * 2. Within a transaction: delete enrollment + decrement current_enrollment.
   * 3. Write audit log entry.
   *
   * Requirements: 3.3
   */
  async remove(enrollmentId: string, actorId: string): Promise<{ message: string }> {
    // 1. Verify enrollment exists
    const enrollment = await this.enrollmentRepository.findOne({
      where: { id: enrollmentId },
      relations: ['course'],
    });
    if (!enrollment) {
      throw new NotFoundException(
        `Enrollment with id "${enrollmentId}" not found.`,
      );
    }

    const previousValues = {
      student_id: enrollment.student_id,
      course_id: enrollment.course_id,
      academic_period_id: enrollment.academic_period_id,
      enrolled_at: enrollment.enrolled_at,
    };

    // 2. Delete and decrement within a transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager
        .getRepository(Enrollment)
        .delete({ id: enrollmentId });

      // Decrement but never go below 0
      await queryRunner.manager
        .getRepository(Course)
        .createQueryBuilder()
        .update(Course)
        .set({
          current_enrollment: () =>
            'GREATEST(current_enrollment - 1, 0)',
        })
        .where('id = :id', { id: enrollment.course_id })
        .execute();

      await queryRunner.commitTransaction();

      this.logger.log(
        `Enrollment ${enrollmentId} removed by actor ${actorId}. ` +
          `Student: ${enrollment.student_id}, Course: ${enrollment.course_id}`,
      );
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    // 3. Write audit log (outside transaction — non-fatal if it fails)
    await this.auditService.log({
      actorId,
      operation: AuditOperation.DELETE,
      recordType: 'enrollments',
      recordId: enrollmentId,
      previousValues,
      newValues: null,
    });

    return { message: 'Enrollment removed successfully.' };
  }

  // ---------------------------------------------------------------------------
  // Batch Cohort Enrollment
  // ---------------------------------------------------------------------------

  /**
   * Batch auto-enroll an entire cohort into multiple courses.
   */
  async batchEnrollCohort(
    dto: BatchEnrollCohortDto,
    actorId: string,
  ): Promise<{
    enrolledStudentsCount: number;
    totalEnrollmentsCreated: number;
    skippedAlreadyEnrolled: number;
    capacityExceededCourses: string[];
  }> {
    const whereClause: Record<string, unknown> = {
      programme_id: dto.programme_id,
      status: StudentStatus.ACTIVE,
    };
    if (dto.year_of_entry) {
      whereClause['year_of_entry'] = dto.year_of_entry;
    }

    const students = await this.studentProfileRepository.find({
      where: whereClause as any,
    });

    if (students.length === 0) {
      return {
        enrolledStudentsCount: 0,
        totalEnrollmentsCreated: 0,
        skippedAlreadyEnrolled: 0,
        capacityExceededCourses: [],
      };
    }

    const courses = await this.courseRepository.find({
      where: dto.course_ids.map((id) => ({ id })),
    });

    let totalEnrollmentsCreated = 0;
    let skippedAlreadyEnrolled = 0;
    const capacityExceededCourses: Set<string> = new Set();
    const enrolledStudentIds: Set<string> = new Set();

    for (const student of students) {
      for (const course of courses) {
        const existing = await this.enrollmentRepository.findOne({
          where: {
            student_id: student.id,
            course_id: course.id,
            academic_period_id: dto.academic_period_id,
          },
        });

        if (existing) {
          skippedAlreadyEnrolled++;
          continue;
        }

        if (course.current_enrollment >= course.max_enrollment) {
          capacityExceededCourses.add(course.code);
          continue;
        }

        const enrollment = this.enrollmentRepository.create({
          student_id: student.id,
          course_id: course.id,
          academic_period_id: dto.academic_period_id,
        });

        await this.enrollmentRepository.save(enrollment);
        await this.courseRepository.increment({ id: course.id }, 'current_enrollment', 1);
        course.current_enrollment += 1;

        totalEnrollmentsCreated++;
        enrolledStudentIds.add(student.id);
      }
    }

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'enrollments',
      recordId: dto.programme_id,
      newValues: {
        event: 'BATCH_COHORT_ENROLLMENT',
        programme_id: dto.programme_id,
        academic_period_id: dto.academic_period_id,
        enrolledStudentsCount: enrolledStudentIds.size,
        totalEnrollmentsCreated,
        skippedAlreadyEnrolled,
      },
    });

    this.logger.log(
      `Batch enrolled cohort (programme ${dto.programme_id}): ${totalEnrollmentsCreated} enrollments created for ${enrolledStudentIds.size} students by actor ${actorId}`,
    );

    return {
      enrolledStudentsCount: enrolledStudentIds.size,
      totalEnrollmentsCreated,
      skippedAlreadyEnrolled,
      capacityExceededCourses: Array.from(capacityExceededCourses),
    };
  }

  /**
   * Enroll a list of students into a course for an academic period.
   */
  async enrollStudents(
    dto: { course_id: string; academic_period_id: string; student_ids: string[] },
    actorId: string,
  ): Promise<{
    enrolledCount: number;
    skippedCount: number;
    message: string;
  }> {
    let enrolledCount = 0;
    let skippedCount = 0;

    for (const studentId of dto.student_ids) {
      try {
        await this.enroll(
          {
            student_id: studentId,
            course_id: dto.course_id,
            academic_period_id: dto.academic_period_id,
          },
          actorId,
        );
        enrolledCount++;
      } catch (err: any) {
        skippedCount++;
      }
    }

    return {
      enrolledCount,
      skippedCount,
      message: `Enrolled ${enrolledCount} student(s) into course (${skippedCount} skipped/already enrolled).`,
    };
  }

  // ---------------------------------------------------------------------------
  // List
  // ---------------------------------------------------------------------------

  /**
   * List enrollments with role-based scoping and optional query filters.
   * Requirements: 3.3, 3.5, 3.7
   */
  async findAll(
    role?: UserRole | string,
    userId?: string,
    departmentId?: string,
    filters?: {
      student_id?: string;
      course_id?: string;
      academic_period_id?: string;
    },
  ): Promise<Enrollment[]> {
    const qb = this.enrollmentRepository
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.student', 'student')
      .leftJoinAndSelect('e.course', 'course')
      .leftJoinAndSelect('e.academicPeriod', 'period')
      .orderBy('e.enrolled_at', 'DESC');

    if (role === UserRole.STUDENT || role === 'student') {
      // Student sees only their own enrollments
      qb.innerJoin(
        StudentProfile,
        'sp',
        'sp.id = e.student_id AND sp.user_id = :userId',
        { userId },
      );
    } else if (role === UserRole.DEPARTMENT_HEAD || role === 'department_head') {
      let deptId = departmentId;
      if (!deptId && userId) {
        const deptRepo = this.enrollmentRepository.manager.getRepository(Department);
        const dept = await deptRepo.findOne({ where: { head_id: userId } });
        if (dept) deptId = dept.id;
      }
      if (deptId) {
        qb.andWhere('course.department_id = :deptId', { deptId });
      }
    }

    if (filters?.student_id) {
      qb.andWhere('e.student_id = :studentId', {
        studentId: filters.student_id,
      });
    }
    if (filters?.course_id) {
      qb.andWhere('e.course_id = :courseId', {
        courseId: filters.course_id,
      });
    }
    if (filters?.academic_period_id) {
      qb.andWhere('e.academic_period_id = :periodId', {
        periodId: filters.academic_period_id,
      });
    }

    return qb.getMany();
  }
}

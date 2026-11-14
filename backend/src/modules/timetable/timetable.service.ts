import { Course } from '../../entities/course.entity';
import { CourseLecturer } from '../../entities/course-lecturer.entity';
import { Department } from '../../entities/department.entity';
import { User, UserRole } from '../../entities/user.entity';
import { AcademicPeriod } from '../../entities/academic-period.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { AssessmentComponent } from '../../entities/assessment-component.entity';
import { AssignLecturerDto } from './dto/assign-lecturer.dto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  TimetableEntry,
  TimetableEntryType,
  TimetableStatus,
} from '../../entities/timetable-entry.entity';
import { Enrollment } from '../../entities/enrollment.entity';
import { AuditService } from '../audit/audit.service';
import { AuditOperation } from '../../entities/audit-log.entity';
import { NotificationService } from '../notifications/notification.service';
import { ConflictDetectorService } from './conflict-detector.service';
import type { TimetableEntryInput } from './conflict-detector.service';
import { CreateTimetableEntryDto } from './dto/create-timetable-entry.dto';
import { UpdateTimetableEntryDto } from './dto/update-timetable-entry.dto';
import { RegisterCourseDto } from './dto/register-course.dto';

/** Converts "HH:MM" to minutes-since-midnight for ConflictDetectorService */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * TimetableService — manages timetable entries with conflict detection,
 * publication, and exam-schedule notifications.
 *
 * Requirements: 6.1–6.9
 */
@Injectable()
export class TimetableService {
  private readonly logger = new Logger(TimetableService.name);

  constructor(
    @InjectRepository(TimetableEntry)
    private readonly entryRepository: Repository<TimetableEntry>,

    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,

    private readonly conflictDetector: ConflictDetectorService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  /**
   * Create a timetable entry after running conflict detection.
   * Returns 409 if a conflict is detected.
   * Requirements: 6.1, 6.2, 6.3
   */
  async create(
    dto: CreateTimetableEntryDto,
    actorId: string,
  ): Promise<TimetableEntry> {
    // Load all existing entries for the same academic period for conflict checks
    const existing = await this.entryRepository.find({
      where: { academic_period_id: dto.academic_period_id },
    });

    const incoming: TimetableEntryInput = {
      academic_period_id: dto.academic_period_id,
      day_of_week: dto.day_of_week,
      start_time: timeToMinutes(dto.start_time),
      end_time: timeToMinutes(dto.end_time),
      room: dto.room,
      lecturer_id: dto.lecturer_id,
    };

    for (const existing_entry of existing) {
      const candidate: TimetableEntryInput = {
        academic_period_id: existing_entry.academic_period_id,
        day_of_week: existing_entry.day_of_week,
        start_time: timeToMinutes(existing_entry.start_time),
        end_time: timeToMinutes(existing_entry.end_time),
        room: existing_entry.room,
        lecturer_id: existing_entry.lecturer_id,
      };

      if (this.conflictDetector.detectConflict(incoming, candidate)) {
        throw new ConflictException({
          code: 'TIMETABLE_CONFLICT',
          message: `Scheduling conflict detected`,
          conflictingEntry: {
            id: existing_entry.id,
            course_id: existing_entry.course_id,
            room: existing_entry.room,
            day_of_week: existing_entry.day_of_week,
            start_time: existing_entry.start_time,
            end_time: existing_entry.end_time,
          },
        });
      }
    }

    const entry = this.entryRepository.create({
      course_id: dto.course_id,
      lecturer_id: dto.lecturer_id,
      academic_period_id: dto.academic_period_id,
      room: dto.room,
      day_of_week: dto.day_of_week,
      start_time: dto.start_time,
      end_time: dto.end_time,
      entry_type: dto.entry_type,
      status: TimetableStatus.DRAFT,
      is_published: false,
    });

    const saved = await this.entryRepository.save(entry);

    // Ensure CourseLecturer assignment exists
    const assignmentRepo = this.entryRepository.manager.getRepository(CourseLecturer);
    const existingAssignment = await assignmentRepo.findOne({
      where: {
        course_id: dto.course_id,
        lecturer_id: dto.lecturer_id,
        academic_period_id: dto.academic_period_id,
      },
    });
    if (!existingAssignment) {
      await assignmentRepo.save(
        assignmentRepo.create({
          course_id: dto.course_id,
          lecturer_id: dto.lecturer_id,
          academic_period_id: dto.academic_period_id,
        }),
      );
    }

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'timetable_entries',
      recordId: saved.id,
      newValues: { ...dto },
    });

    // If this is an exam entry, notify enrolled students (req 6.9)
    if (dto.entry_type === TimetableEntryType.EXAM) {
      await this.notifyEnrolledStudents(saved, 'exam_scheduled');
    }

    this.logger.log(`Timetable entry created: ${saved.id} by actor ${actorId}`);
    return saved;
  }

  /** Register a department course and assign its lecturer for an academic period. */
  async registerCourse(
    dto: RegisterCourseDto,
    actorId: string,
    actorRole: string,
  ): Promise<{ course: Course; assignment: CourseLecturer }> {
    const courseRepo = this.entryRepository.manager.getRepository(Course);
    const lecturerRepo = this.entryRepository.manager.getRepository(User);
    const periodRepo = this.entryRepository.manager.getRepository(AcademicPeriod);
    const departmentRepo = this.entryRepository.manager.getRepository(Department);
    const assignmentRepo = this.entryRepository.manager.getRepository(CourseLecturer);

    let departmentId = dto.department_id;
    if (actorRole === 'department_head') {
      const department = await this.getDepartmentForHOD(actorId);
      if (!department) throw new ForbiddenException('You are not assigned to a department.');
      departmentId = department.id;
    }
    if (!departmentId) {
      throw new BadRequestException('Department is required for course registration.');
    }
    if (!(await departmentRepo.findOne({ where: { id: departmentId } }))) {
      throw new NotFoundException('Department not found.');
    }

    const normalizedCode = dto.code.trim().toUpperCase();
    const [existingCourse, lecturer, period] = await Promise.all([
      courseRepo.findOne({ where: { code: normalizedCode } }),
      lecturerRepo.findOne({ where: { id: dto.lecturer_id, role: UserRole.LECTURER, is_active: true } }),
      periodRepo.findOne({ where: { id: dto.academic_period_id } }),
    ]);
    if (existingCourse) throw new ConflictException('A course with this code already exists.');
    if (!lecturer) throw new BadRequestException('Selected teacher is not an active lecturer.');
    if (!period) throw new NotFoundException('Academic period not found.');
    if (period.is_locked) throw new BadRequestException('This academic period is locked.');

    const course = await courseRepo.save(courseRepo.create({
      code: normalizedCode,
      name: dto.name.trim(),
      department_id: departmentId,
      credit_hours: dto.credit_hours,
      max_enrollment: dto.max_enrollment,
      current_enrollment: 0,
    }));
    const assignment = await assignmentRepo.save(assignmentRepo.create({
      course_id: course.id,
      lecturer_id: lecturer.id,
      academic_period_id: period.id,
    }));

    const componentRepo = this.entryRepository.manager.getRepository(AssessmentComponent);
    const ca = componentRepo.create({
      course_id: course.id,
      name: 'Continuous Assessment',
      weight: 40,
      is_mandatory: true,
    });
    const fe = componentRepo.create({
      course_id: course.id,
      name: 'Final Examination',
      weight: 60,
      is_mandatory: true,
    });
    await componentRepo.save([ca, fe]);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'courses',
      recordId: course.id,
      newValues: {
        course_id: course.id,
        department_id: departmentId,
        lecturer_id: lecturer.id,
        academic_period_id: period.id,
      },
    });

    return { course, assignment };
  }

  /**
   * Assign or reassign a teacher to an existing course for an academic period.
   */
  async assignLecturerToCourse(
    dto: AssignLecturerDto,
    actorId: string,
    actorRole: string,
  ): Promise<{ assignment: CourseLecturer; message: string }> {
    const courseRepo = this.entryRepository.manager.getRepository(Course);
    const lecturerRepo = this.entryRepository.manager.getRepository(User);
    const periodRepo = this.entryRepository.manager.getRepository(AcademicPeriod);
    const assignmentRepo = this.entryRepository.manager.getRepository(CourseLecturer);
    const componentRepo = this.entryRepository.manager.getRepository(AssessmentComponent);

    const [course, lecturer, period] = await Promise.all([
      courseRepo.findOne({ where: { id: dto.course_id }, relations: ['department'] }),
      lecturerRepo.findOne({ where: { id: dto.lecturer_id, role: UserRole.LECTURER, is_active: true } }),
      periodRepo.findOne({ where: { id: dto.academic_period_id } }),
    ]);

    if (!course) throw new NotFoundException('Course not found.');
    if (!lecturer) throw new BadRequestException('Selected teacher is not an active lecturer.');
    if (!period) throw new NotFoundException('Academic period not found.');
    if (period.is_locked) throw new BadRequestException('This academic period is locked.');

    if (actorRole === 'department_head') {
      const dept = await this.getDepartmentForHOD(actorId);
      if (dept) {
        if (!course.department_id) {
          course.department_id = dept.id;
          await courseRepo.save(course);
        } else if (dept.id !== course.department_id) {
          throw new ForbiddenException('You can only assign teachers to courses in your department.');
        }
      }
    }

    let assignment = await assignmentRepo.findOne({
      where: {
        course_id: dto.course_id,
        lecturer_id: dto.lecturer_id,
        academic_period_id: dto.academic_period_id,
      },
    });

    if (!assignment) {
      assignment = await assignmentRepo.save(
        assignmentRepo.create({
          course_id: dto.course_id,
          lecturer_id: dto.lecturer_id,
          academic_period_id: dto.academic_period_id,
        }),
      );
    }

    // Auto-provision components if missing
    const existingComp = await componentRepo.find({ where: { course_id: dto.course_id } });
    if (existingComp.length === 0) {
      const ca = componentRepo.create({
        course_id: dto.course_id,
        name: 'Continuous Assessment',
        weight: 40,
        is_mandatory: true,
      });
      const fe = componentRepo.create({
        course_id: dto.course_id,
        name: 'Final Examination',
        weight: 60,
        is_mandatory: true,
      });
      await componentRepo.save([ca, fe]);
    }

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'course_lecturers',
      recordId: dto.course_id,
      newValues: { ...dto },
    });

    return {
      assignment,
      message: `Course ${course.code} successfully assigned to ${lecturer.username}.`,
    };
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  /**
   * Update an existing timetable entry with conflict re-check.
   * Requirements: 6.1, 6.2
   */
  async update(
    id: string,
    dto: UpdateTimetableEntryDto,
    actorId: string,
  ): Promise<TimetableEntry> {
    const entry = await this.findOneOrFail(id);

    const previousValues = {
      course_id: entry.course_id,
      lecturer_id: entry.lecturer_id,
      room: entry.room,
      day_of_week: entry.day_of_week,
      start_time: entry.start_time,
      end_time: entry.end_time,
      entry_type: entry.entry_type,
    };

    // Apply updates
    Object.assign(entry, dto);

    // Re-check conflicts against all other entries in the same period
    const periodId = dto.academic_period_id ?? entry.academic_period_id;
    const existing = await this.entryRepository
      .createQueryBuilder('te')
      .where('te.academic_period_id = :periodId', { periodId })
      .andWhere('te.id != :id', { id })
      .getMany();

    const incoming: TimetableEntryInput = {
      academic_period_id: periodId,
      day_of_week: entry.day_of_week,
      start_time: timeToMinutes(entry.start_time),
      end_time: timeToMinutes(entry.end_time),
      room: entry.room,
      lecturer_id: entry.lecturer_id,
    };

    for (const ex of existing) {
      const candidate: TimetableEntryInput = {
        academic_period_id: ex.academic_period_id,
        day_of_week: ex.day_of_week,
        start_time: timeToMinutes(ex.start_time),
        end_time: timeToMinutes(ex.end_time),
        room: ex.room,
        lecturer_id: ex.lecturer_id,
      };
      if (this.conflictDetector.detectConflict(incoming, candidate)) {
        throw new ConflictException({
          code: 'TIMETABLE_CONFLICT',
          message: `Scheduling conflict detected`,
          conflictingEntry: {
            id: ex.id,
            course_id: ex.course_id,
            room: ex.room,
            day_of_week: ex.day_of_week,
            start_time: ex.start_time,
            end_time: ex.end_time,
          },
        });
      }
    }

    const saved = await this.entryRepository.save(entry);

    // Ensure CourseLecturer assignment exists
    const assignmentRepo = this.entryRepository.manager.getRepository(CourseLecturer);
    const existingAssignment = await assignmentRepo.findOne({
      where: {
        course_id: dto.course_id,
        lecturer_id: dto.lecturer_id,
        academic_period_id: dto.academic_period_id,
      },
    });
    if (!existingAssignment) {
      await assignmentRepo.save(
        assignmentRepo.create({
          course_id: dto.course_id,
          lecturer_id: dto.lecturer_id,
          academic_period_id: dto.academic_period_id,
        }),
      );
    }

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'timetable_entries',
      recordId: saved.id,
      previousValues,
      newValues: { ...dto },
    });

    // Notify on exam update (req 6.9)
    if (saved.entry_type === TimetableEntryType.EXAM) {
      await this.notifyEnrolledStudents(saved, 'exam_updated');
    }

    return saved;
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async remove(id: string, actorId: string): Promise<void> {
    const entry = await this.findOneOrFail(id);
    await this.entryRepository.remove(entry);
    await this.auditService.log({
      actorId,
      operation: AuditOperation.DELETE,
      recordType: 'timetable_entries',
      recordId: id,
      previousValues: { id },
    });
    this.logger.log(`Timetable entry deleted: ${id} by actor ${actorId}`);
  }

  // ---------------------------------------------------------------------------
  
  // ---------------------------------------------------------------------------
  // Submit for Approval (Two-Tier Workflow)
  // ---------------------------------------------------------------------------

  /**
   * Submit draft timetable entries for an academic period to Central Admin for review.
   * Changes status from DRAFT to PENDING_APPROVAL.
   */
  async submitForApproval(
    periodId: string,
    departmentId: string | undefined,
    actorId: string,
  ): Promise<{ submitted: number }> {
    const qb = this.entryRepository
      .createQueryBuilder('te')
      .leftJoin('te.course', 'course')
      .where('te.academic_period_id = :periodId', { periodId })
      .andWhere('(te.status = :draftStatus OR te.status IS NULL)', {
        draftStatus: TimetableStatus.DRAFT,
      });

    if (departmentId) {
      qb.andWhere('course.department_id = :departmentId', { departmentId });
    }

    const entries = await qb.getMany();

    if (entries.length === 0) {
      return { submitted: 0 };
    }

    const entryIds = entries.map((e: any) => e.id);
    await this.entryRepository
      .createQueryBuilder()
      .update(TimetableEntry)
      .set({ status: TimetableStatus.PENDING_APPROVAL })
      .whereInIds(entryIds)
      .execute();

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'timetable_entries',
      recordId: periodId,
      newValues: { status: TimetableStatus.PENDING_APPROVAL, count: entries.length },
    });

    this.logger.log(
      `Timetable submitted for approval for period ${periodId}: ${entries.length} entries by actor ${actorId}`,
    );
    return { submitted: entries.length };
  }

  // Publish
  // ---------------------------------------------------------------------------

  /**
   * Publish all entries for an academic period and notify all affected
   * students and lecturers.
   * Requirements: 6.4, 6.5
   */
  async publish(periodId: string, actorId: string): Promise<{ published: number }> {
    const entries = await this.entryRepository.find({
      where: { academic_period_id: periodId, is_published: false },
      relations: ['course', 'lecturer'],
    });

    if (entries.length === 0) {
      return { published: 0 };
    }

    await this.entryRepository
      .createQueryBuilder()
      .update(TimetableEntry)
      .set({ status: TimetableStatus.PUBLISHED, is_published: true })
      .where('academic_period_id = :periodId', { periodId })
      .andWhere('is_published = false')
      .execute();

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'timetable_entries',
      recordId: periodId,
      newValues: { is_published: true, count: entries.length },
    });

    // Collect all unique student IDs enrolled in courses in this period
    const courseIds: string[] = [...new Set<string>(entries.map((e: any) => e.course_id))];
    const enrollments = await this.enrollmentRepository
      .createQueryBuilder('en')
      .where('en.course_id IN (:...courseIds)', { courseIds })
      .andWhere('en.academic_period_id = :periodId', { periodId })
      .getMany();

    const studentIds: string[] = [...new Set<string>(enrollments.map((e: any) => e.student_id))];
    const lecturerIds: string[] = [...new Set<string>(entries.map((e: any) => e.lecturer_id))];
    const allRecipients: string[] = [...new Set<string>([...studentIds, ...lecturerIds])];

    if (allRecipients.length > 0) {
      await this.notificationService.enqueueBulk(
        allRecipients,
        'timetable_published',
        'email',
        'timetable_published',
        { period_id: periodId, entry_count: entries.length },
      );
    }

    this.logger.log(
      `Timetable published for period ${periodId}: ${entries.length} entries, ${allRecipients.length} notified`,
    );
    return { published: entries.length };
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  /**
   * Get timetable entries scoped to the caller's role.
   * Student: enrolled courses only; Lecturer: assigned courses; others: all.
   * Requirements: 6.6, 6.7
   */
  async getForUser(
    userId: string,
    role: string,
    periodId?: string,
  ): Promise<TimetableEntry[]> {
    const qb = this.entryRepository
      .createQueryBuilder('te')
      .leftJoinAndSelect('te.course', 'course')
      .leftJoinAndSelect('te.lecturer', 'lecturer')
      .leftJoinAndSelect('te.academicPeriod', 'period')
      .where('te.is_published = true');

    if (periodId) {
      qb.andWhere('te.academic_period_id = :periodId', { periodId });
    }

    if (role === 'student') {
      // Only enrolled courses
      qb.innerJoin(Enrollment, 'en', 'en.course_id = te.course_id')
        .innerJoin(StudentProfile, 'sp', 'sp.id = en.student_id AND sp.user_id = :userId', { userId });
    } else if (role === 'lecturer') {
      qb.andWhere('te.lecturer_id = :userId', { userId });
    }
    // admin_staff, department_head, super_admin: see all published entries

    return qb.getMany();
  }

  async findAll(periodId?: string): Promise<TimetableEntry[]> {
    const where: Record<string, unknown> = {};
    if (periodId) where['academic_period_id'] = periodId;
    return this.entryRepository.find({
      where,
      relations: ['course', 'lecturer', 'academicPeriod'],
      order: { day_of_week: 'ASC', start_time: 'ASC' },
    });
  }

  async findOne(id: string): Promise<TimetableEntry> {
    return this.findOneOrFail(id);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async findOneOrFail(id: string): Promise<TimetableEntry> {
    const entry = await this.entryRepository.findOne({
      where: { id },
      relations: ['course', 'lecturer', 'academicPeriod'],
    });
    if (!entry) {
      throw new NotFoundException(`Timetable entry "${id}" not found.`);
    }
    return entry;
  }

  /**
   * Notify all students enrolled in the given entry's course about an exam.
   * Requirements: 6.9
   */
  private async notifyEnrolledStudents(
    entry: TimetableEntry,
    triggerEvent: string,
  ): Promise<void> {
    const enrollments = await this.enrollmentRepository.find({
      where: {
        course_id: entry.course_id,
        academic_period_id: entry.academic_period_id,
      },
    });

    const studentIds = enrollments.map((e: any) => e.student_id);
    if (studentIds.length === 0) return;

    const payload = {
      course_id: entry.course_id,
      day_of_week: entry.day_of_week,
      start_time: entry.start_time,
      end_time: entry.end_time,
      room: entry.room,
      entry_type: entry.entry_type,
    };

    await this.notificationService.enqueueBulk(
      studentIds,
      triggerEvent,
      'email',
      triggerEvent,
      payload,
    );
    await this.notificationService.enqueueBulk(
      studentIds,
      triggerEvent,
      'sms',
      triggerEvent,
      payload,
    );
  }

  /**
   * Get courses scoped to caller (HOD gets own department's courses, admin gets all).
   */
  async getCoursesForUser(userId: string, role: string): Promise<Course[]> {
    const courseRepo = this.entryRepository.manager.getRepository(Course);
    let courses: Course[] = [];
    if (role === 'department_head') {
      const dept = await this.getDepartmentForHOD(userId);
      if (dept) {
        courses = await courseRepo.find({
          where: { department_id: dept.id },
          relations: ['department'],
          order: { code: 'ASC' },
        });
      }
    } else {
      courses = await courseRepo.find({ relations: ['department'], order: { code: 'ASC' } });
    }

    // Attach assigned lecturers information
    const clRepo = this.entryRepository.manager.getRepository(CourseLecturer);
    const assignments = await clRepo.find({ relations: ['lecturer', 'academicPeriod'] });
    const assignmentsByCourse = new Map<string, any[]>();
    for (const a of assignments) {
      if (!assignmentsByCourse.has(a.course_id)) {
        assignmentsByCourse.set(a.course_id, []);
      }
      assignmentsByCourse.get(a.course_id)!.push({
        lecturer_id: a.lecturer_id,
        lecturer_name: a.lecturer?.username,
        academic_period_id: a.academic_period_id,
        academic_period_name: a.academicPeriod?.name,
      });
    }

    return courses.map((c: any) => ({
      ...c,
      assigned_lecturers: assignmentsByCourse.get(c.id) || [],
    })) as any;
  }

  /**
   * Find timetable entries for a Department Head's department.
   */
  async findForDepartmentHead(userId: string, periodId?: string): Promise<TimetableEntry[]> {
    const dept = await this.getDepartmentForHOD(userId);
    if (!dept) {
      return [];
    }

    const qb = this.entryRepository
      .createQueryBuilder('te')
      .leftJoinAndSelect('te.course', 'course')
      .leftJoinAndSelect('te.lecturer', 'lecturer')
      .leftJoinAndSelect('te.academicPeriod', 'period')
      .where('course.department_id = :deptId', { deptId: dept.id });

    if (periodId) {
      qb.andWhere('te.academic_period_id = :periodId', { periodId });
    }

    qb.orderBy('te.day_of_week', 'ASC')
      .addOrderBy('te.start_time', 'ASC');

    return qb.getMany();
  }

  /**
   * Get all active lecturers with department classification.
   */
  async getLecturers(userId?: string, role?: string): Promise<any[]> {
    const userRepo = this.entryRepository.manager.getRepository(User);
    const deptRepo = this.entryRepository.manager.getRepository(Department);
    const courseLecturerRepo = this.entryRepository.manager.getRepository(CourseLecturer);

    let myDeptId: string | null = null;
    if (role === 'department_head' && userId) {
      const myDept = await this.getDepartmentForHOD(userId);
      if (myDept) {
        myDeptId = myDept.id;
      }
    }

    const allDepts = await deptRepo.find();
    const autoDept = allDepts.find((d: any) => d.name.includes('Automotive'));
    const ictDept = allDepts.find((d: any) => d.name.includes('Information'));
    const bctDept = allDepts.find((d: any) => d.name.includes('Building'));
    const garmentDept = allDepts.find((d: any) => d.name.includes('Garment'));
    const manDept = allDepts.find((d: any) => d.name.includes('Manufacturing'));

    const lecturers = await userRepo.find({
      where: { role: UserRole.LECTURER, is_active: true },
      order: { username: 'ASC' },
    });

    const assignments = await courseLecturerRepo
      .createQueryBuilder('cl')
      .leftJoinAndSelect('cl.course', 'course')
      .leftJoinAndSelect('course.department', 'dept')
      .getMany();

    const lecturerDeptMap = new Map<string, { deptId: string; deptName: string }>();
    for (const a of assignments) {
      if (a.course?.department_id && !lecturerDeptMap.has(a.lecturer_id)) {
        lecturerDeptMap.set(a.lecturer_id, {
          deptId: a.course.department_id,
          deptName: a.course.department?.name || 'Department',
        });
      }
    }

    return lecturers.map((lec: any) => {
      let deptInfo = lecturerDeptMap.get(lec.id);
      if (!deptInfo) {
        const un = (lec.username || '').toLowerCase();
        if (un.includes('auto') && autoDept) deptInfo = { deptId: autoDept.id, deptName: autoDept.name };
        else if (un.includes('ict') && ictDept) deptInfo = { deptId: ictDept.id, deptName: ictDept.name };
        else if (un.includes('bct') && bctDept) deptInfo = { deptId: bctDept.id, deptName: bctDept.name };
        else if (un.includes('garment') && garmentDept) deptInfo = { deptId: garmentDept.id, deptName: garmentDept.name };
        else if (un.includes('man') && manDept) deptInfo = { deptId: manDept.id, deptName: manDept.name };
        else deptInfo = { deptId: 'general', deptName: 'General & Basic Sciences' };
      }

      const isDeptLecturer = myDeptId ? (deptInfo?.deptId === myDeptId) : false;

      return {
        id: lec.id,
        username: lec.username,
        email: lec.email,
        phone: lec.phone,
        department_id: deptInfo?.deptId,
        department_name: deptInfo?.deptName,
        is_department_lecturer: isDeptLecturer,
      };
    });
  }

  /**
   * Get department details for HOD (by head_id or username fallback).
   */
  async getDepartmentForHOD(userId: string): Promise<Department | null> {
    const deptRepo = this.entryRepository.manager.getRepository(Department);
    const userRepo = this.entryRepository.manager.getRepository(User);
    let dept = await deptRepo.findOne({
      where: { head_id: userId },
      relations: ['programmes'],
    });

    if (!dept) {
      const user = await userRepo.findOne({ where: { id: userId } });
      if (user) {
        const un = (user.username || '').toLowerCase();
        const allDepts = await deptRepo.find({ relations: ['programmes'] });
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
              (d: any) =>
                d.name.toLowerCase().includes('computing') ||
                d.name.toLowerCase().includes('information') ||
                d.name.toLowerCase().includes('ict') ||
                d.name.toLowerCase().includes('computer'),
            ) || null;
        } else if (un.includes('auto')) {
          dept = allDepts.find((d: any) => d.name.toLowerCase().includes('auto')) || null;
        } else if (un.includes('building') || un.includes('bct')) {
          dept = allDepts.find((d: any) => d.name.toLowerCase().includes('building')) || null;
        } else if (un.includes('garment')) {
          dept = allDepts.find((d: any) => d.name.toLowerCase().includes('garment')) || null;
        } else if (un.includes('manufacturing') || un.includes('man')) {
          dept = allDepts.find((d: any) => d.name.toLowerCase().includes('manufacturing')) || null;
        }
        if (!dept && allDepts.length > 0) {
          dept = allDepts[0];
        }
        if (dept && !dept.head_id) {
          dept.head_id = userId;
          await deptRepo.save(dept);
        }
      }
    }
    return dept;
  }

  /**
   * Get all academic periods.
   */
  async getAcademicPeriods(): Promise<AcademicPeriod[]> {
    const periodRepo = this.entryRepository.manager.getRepository(AcademicPeriod);
    return periodRepo.find({
      order: { start_date: 'DESC' },
    });
  }

  /**
   * Get all departments with their appointed head and programmes.
   */
  async getDepartments(): Promise<Department[]> {
    const deptRepo = this.entryRepository.manager.getRepository(Department);
    return deptRepo.find({
      relations: ['head', 'programmes'],
      order: { name: 'ASC' },
    });
  }

  // ---------------------------------------------------------------------------
  // Schedule Approval (Phase 4)
  // ---------------------------------------------------------------------------

  /**
   * Approve a pending schedule (super admin or registrar only)
   */
  async approveSchedule(
    sessionId: string,
    approverId: string,
  ): Promise<{ message: string }> {
    const session = await this.entryRepository.findOne({
      where: { id: sessionId },
      relations: ['course', 'lecturer', 'createdBy'],
    });

    if (!session) {
      throw new NotFoundException(`Schedule session ${sessionId} not found`);
    }

    if (session.status === TimetableStatus.APPROVED || session.status === TimetableStatus.PUBLISHED) {
      throw new BadRequestException('Schedule is already approved');
    }

    if (session.status === TimetableStatus.REJECTED) {
      throw new BadRequestException('Cannot approve a rejected schedule');
    }

    session.status = TimetableStatus.APPROVED;
    session.is_published = true;
    session.approved_by_id = approverId;
    session.approval_date = new Date();
    session.rejection_reason = null;

    await this.entryRepository.save(session);

    await this.auditService.log({
      actorId: approverId,
      operation: AuditOperation.UPDATE,
      recordType: 'timetable_entry',
      recordId: sessionId,
      previousValues: { status: 'pending' },
      newValues: { status: 'approved' },
    });

    this.logger.log(
      `Schedule ${sessionId} approved by user ${approverId}`,
    );

    return { message: 'Schedule approved successfully' };
  }

  /**
   * Reject a pending schedule with reason
   */
  async rejectSchedule(
    sessionId: string,
    approverId: string,
    rejectionReason: string,
  ): Promise<{ message: string }> {
    const session = await this.entryRepository.findOne({
      where: { id: sessionId },
      relations: ['course', 'lecturer', 'createdBy'],
    });

    if (!session) {
      throw new NotFoundException(`Schedule session ${sessionId} not found`);
    }

    if (session.status === TimetableStatus.APPROVED || session.status === TimetableStatus.PUBLISHED) {
      throw new BadRequestException('Cannot reject an approved schedule');
    }

    if (session.status === TimetableStatus.REJECTED) {
      throw new BadRequestException('Schedule is already rejected');
    }

    session.status = TimetableStatus.REJECTED;
    session.approved_by_id = approverId;
    session.approval_date = new Date();
    session.rejection_reason = rejectionReason;

    await this.entryRepository.save(session);

    await this.auditService.log({
      actorId: approverId,
      operation: AuditOperation.UPDATE,
      recordType: 'timetable_entry',
      recordId: sessionId,
      previousValues: { status: 'pending' },
      newValues: { status: 'rejected', rejection_reason: rejectionReason },
    });

    this.logger.log(
      `Schedule ${sessionId} rejected and deleted by user ${approverId}: ${rejectionReason}`,
    );

    return { message: 'Schedule rejected successfully' };
  }

  /**
   * Get all pending schedules (for admin review)
   */
  async getPendingSchedules(departmentId?: string): Promise<TimetableEntry[]> {
    const queryBuilder = this.entryRepository
      .createQueryBuilder('te')
      .leftJoinAndSelect('te.course', 'course')
      .leftJoinAndSelect('te.lecturer', 'lecturer')
      .leftJoinAndSelect('te.academicPeriod', 'academicPeriod')
      .leftJoinAndSelect('te.createdBy', 'createdBy')
      .where('te.status = :status', { status: 'pending' })
      .orderBy('te.created_at', 'DESC');

    if (departmentId) {
      queryBuilder
        .leftJoin('course.programme', 'programme')
        .andWhere('programme.department_id = :departmentId', { departmentId });
    }

    return queryBuilder.getMany();
  }

  /**
   * Get schedules by status
   */
  async getSchedulesByStatus(
    status: string,
    departmentId?: string,
  ): Promise<TimetableEntry[]> {
    const queryBuilder = this.entryRepository
      .createQueryBuilder('te')
      .leftJoinAndSelect('te.course', 'course')
      .leftJoinAndSelect('te.lecturer', 'lecturer')
      .leftJoinAndSelect('te.academicPeriod', 'academicPeriod')
      .leftJoinAndSelect('te.createdBy', 'createdBy')
      .leftJoinAndSelect('te.approvedBy', 'approvedBy')
      .where('te.status = :status', { status })
      .orderBy('te.created_at', 'DESC');

    if (departmentId) {
      queryBuilder
        .leftJoin('course.programme', 'programme')
        .andWhere('programme.department_id = :departmentId', { departmentId });
    }

    return queryBuilder.getMany();
  }
}

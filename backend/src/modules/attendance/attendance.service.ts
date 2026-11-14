import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../../common/providers/redis.provider';
import {
  AttendanceRecord,
  AttendanceStatus,
} from '../../entities/attendance-record.entity';
import { TimetableSession } from '../../entities/timetable-session.entity';
import { CourseLecturer } from '../../entities/course-lecturer.entity';
import { GuardianStudentLink } from '../../entities/guardian-student-link.entity';
import { ParentGuardian } from '../../entities/parent-guardian.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { UserRole } from '../../entities/user.entity';
import { AuditOperation } from '../../entities/audit-log.entity';

import { AttendanceCalculatorService } from './attendance-calculator.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';

/** Redis key for the attendance warning threshold. */
const THRESHOLD_CACHE_KEY = 'config:attendance_threshold';

/** DB config key for the attendance threshold. */
const THRESHOLD_DB_KEY = 'attendance_threshold';

/** Default threshold when none has been configured (75 %). */
const DEFAULT_THRESHOLD = 75;

/** Maximum age of a session (in hours) within which a lecturer may self-amend. */
const SELF_AMEND_WINDOW_HOURS = 48;

export interface AttendanceEntry {
  studentId: string;
  status: AttendanceStatus;
}

export interface AttendanceSummary {
  percentage: number;
  present: number;
  late: number;
  absent: number;
  total: number;
  sessions: AttendanceRecord[];
}

/**
 * AttendanceService — core business logic for attendance tracking.
 *
 * Responsibilities:
 *  - markAttendance: batch upsert records, recompute percentages, trigger
 *    low-attendance notifications for students and linked guardians.
 *  - amendRecord: time-gated amendment with role enforcement + audit log.
 *  - setThreshold / getThreshold: persist and cache the warning threshold.
 *  - getSummary / findAll: query helpers.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.7, 5.8
 */
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @InjectRepository(AttendanceRecord)
    private readonly attendanceRepo: Repository<AttendanceRecord>,

    @InjectRepository(TimetableSession)
    private readonly sessionRepo: Repository<TimetableSession>,

    @InjectRepository(CourseLecturer)
    private readonly courseLecturerRepo: Repository<CourseLecturer>,

    @InjectRepository(GuardianStudentLink)
    private readonly guardianLinkRepo: Repository<GuardianStudentLink>,

    @InjectRepository(ParentGuardian)
    private readonly guardianRepo: Repository<ParentGuardian>,

    @InjectRepository(StudentProfile)
    private readonly studentProfileRepo: Repository<StudentProfile>,

    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,

    private readonly calculator: AttendanceCalculatorService,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  // ---------------------------------------------------------------------------
  // markAttendance
  // ---------------------------------------------------------------------------

  /**
   * Batch-mark attendance for a session.
   *
   * Only the lecturer who is assigned to the session (via timetable_sessions.lecturer_id
   * === actorId) AND who appears in course_lecturers for the session's course may call
   * this. Admin Staff and Super Admin bypass the check entirely.
   *
   * After the batch is saved, attendance percentages are recomputed for each student
   * and low-attendance notifications are dispatched when the threshold is breached.
   *
   * Requirements: 5.1, 5.3
   *
   * @param sessionId   UUID of the TimetableSession being marked
   * @param records     Array of student + status entries
   * @param actorId     UUID of the requesting user
   * @param actorRole   Role string of the requesting user
   */
  async markAttendance(
    sessionId: string,
    records: AttendanceEntry[],
    actorId: string,
    actorRole?: string,
  ): Promise<AttendanceRecord[]> {
    // 1. Load session
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    // 2. Verify actor authorisation
    const isAdmin =
      actorRole === UserRole.ADMIN_STAFF || actorRole === UserRole.SUPER_ADMIN;

    if (!isAdmin) {
      // Must be the assigned lecturer on this session
      if (session.lecturer_id !== actorId) {
        throw new ForbiddenException(
          'Only the assigned lecturer may mark attendance for this session',
        );
      }

      // Also confirm they appear in course_lecturers for this course + period
      const assignment = await this.courseLecturerRepo.findOne({
        where: {
          course_id: session.course_id,
          lecturer_id: actorId,
          academic_period_id: session.academic_period_id,
        },
      });
      if (!assignment) {
        throw new ForbiddenException(
          'Lecturer is not assigned to this course for the current academic period',
        );
      }
    }

    // 3. Upsert each record (INSERT … ON CONFLICT DO UPDATE)
    const saved: AttendanceRecord[] = [];

    for (const entry of records) {
      await this.attendanceRepo
        .createQueryBuilder()
        .insert()
        .into(AttendanceRecord)
        .values({
          student_id: entry.studentId,
          session_id: sessionId,
          status: entry.status,
          recorded_by: actorId,
        } as AttendanceRecord)
        .orUpdate(['status', 'recorded_by'], ['student_id', 'session_id'])
        .execute();

      const record = await this.attendanceRepo.findOne({
        where: { student_id: entry.studentId, session_id: sessionId },
      });
      if (record) saved.push(record);

      // Write per-record audit log (req 5.8)
      await this.auditService.log({
        actorId,
        operation: AuditOperation.CREATE,
        recordType: 'attendance_records',
        recordId: `${entry.studentId}:${sessionId}`,
        previousValues: null,
        newValues: {
          studentId: entry.studentId,
          sessionId,
          status: entry.status,
        },
      });
    }

    // 4. Recompute percentages and trigger low-attendance notifications
    const studentIds: string[] = [...new Set<string>(records.map((r) => r.studentId))];
    await this.checkAndNotifyLowAttendance(
      studentIds,
      session.course_id,
      session.academic_period_id,
    );

    return saved;
  }

  // ---------------------------------------------------------------------------
  // amendRecord
  // ---------------------------------------------------------------------------

  /**
   * Amend an existing attendance record's status.
   *
   * Time rules (req 5.7):
   *  - ≤ 48 h since session date → lecturer (own course) or admin_staff / super_admin
   *  - > 48 h since session date → only admin_staff or super_admin
   *
   * An audit log entry is written on every successful amendment (req 5.8).
   *
   * @param recordId    UUID of the AttendanceRecord to amend
   * @param newStatus   New status value
   * @param actorId     UUID of the requesting user
   * @param actorRole   Role string of the requesting user
   */
  async amendRecord(
    recordId: string,
    newStatus: AttendanceStatus,
    actorId: string,
    actorRole: string,
  ): Promise<AttendanceRecord> {
    // 1. Load existing record + its session
    const record = await this.attendanceRepo.findOne({
      where: { id: recordId },
      relations: ['session'],
    });
    if (!record) {
      throw new NotFoundException(`Attendance record ${recordId} not found`);
    }

    const session = record.session;
    const sessionDate = new Date(session.session_date);
    const now = new Date();
    const hoursSinceSession =
      (now.getTime() - sessionDate.getTime()) / (1000 * 60 * 60);

    const isAdmin =
      actorRole === UserRole.ADMIN_STAFF ||
      actorRole === UserRole.SUPER_ADMIN;

    // 2. Enforce time-gated role check
    if (hoursSinceSession <= SELF_AMEND_WINDOW_HOURS) {
      // Within 48 h — the assigned lecturer (own course) or admin may amend
      if (!isAdmin) {
        if (actorRole !== UserRole.LECTURER) {
          throw new ForbiddenException(
            'Only the recording lecturer or admin staff may amend this record within 48 hours',
          );
        }
        // Confirm they are assigned to that course
        const assignment = await this.courseLecturerRepo.findOne({
          where: {
            course_id: session.course_id,
            lecturer_id: actorId,
            academic_period_id: session.academic_period_id,
          },
        });
        if (!assignment) {
          throw new ForbiddenException(
            'Lecturer is not assigned to this course for the current academic period',
          );
        }
      }
    } else {
      // Beyond 48 h — only admin_staff or super_admin (req 5.7)
      if (!isAdmin) {
        throw new ForbiddenException(
          'Amendment requires Admin Staff approval after 48 hours',
        );
      }
    }

    // 3. Capture previous state for audit
    const previousStatus = record.status;

    // 4. Apply amendment
    record.status = newStatus;
    record.amended_by = actorId;
    record.amended_at = now;
    const updated = await this.attendanceRepo.save(record);

    // 5. Write audit log (req 5.8)
    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'attendance_records',
      recordId,
      previousValues: { status: previousStatus },
      newValues: { status: newStatus, amended_by: actorId, amended_at: now },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // setThreshold
  // ---------------------------------------------------------------------------

  /**
   * Persist the attendance warning threshold.
   *
   * Value is validated in [50, 100], stored in the `system_configs` table and
   * Redis cache so reads are served from cache (req 5.4).
   *
   * @param value   Threshold percentage; must be in [50, 100]
   * @param actorId UUID of the actor making the change
   */
  async setThreshold(value: number, actorId: string): Promise<void> {
    if (value < 50 || value > 100) {
      throw new BadRequestException(
        'Attendance threshold must be between 50 and 100',
      );
    }

    // Persist to system_configs table (upsert)
    await this.attendanceRepo.manager.query(
      `INSERT INTO system_configs (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [THRESHOLD_DB_KEY, String(value)],
    );

    // Update Redis cache (safe fallback)
    try {
      if (this.redis && this.redis.status === "ready") { void this.redis.set(THRESHOLD_CACHE_KEY, String(value)).catch(() => {}); }
    } catch (err: any) {
      this.logger.warn(`Failed to update attendance threshold in Redis: ${err?.message}`);
    }

    // Write audit log
    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'system_configs',
      recordId: THRESHOLD_DB_KEY,
      previousValues: null,
      newValues: { key: THRESHOLD_DB_KEY, value },
    });

    this.logger.log(`Attendance threshold set to ${value} by ${actorId}`);
  }

  // ---------------------------------------------------------------------------
  // getThreshold
  // ---------------------------------------------------------------------------

  /**
   * Retrieve the current attendance warning threshold.
   *
   * Reads from Redis cache first; falls back to DB on cache miss.
   * Returns 75 as the built-in default when never configured.
   *
   * Requirements: 5.4
   */
  async getThreshold(): Promise<number> {
    // 1. Try Redis cache (safe fallback)
    try {
      const cached = (this.redis && this.redis.status === "ready") ? await this.redis.get(THRESHOLD_CACHE_KEY) : null;
      if (cached !== null) {
        return parseFloat(cached);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to read attendance threshold from Redis: ${err?.message}`);
    }

    // 2. Fallback to DB
    const rows = await this.attendanceRepo.manager.query(
      `SELECT value FROM system_configs WHERE key = $1 LIMIT 1`,
      [THRESHOLD_DB_KEY],
    );

    if (rows && rows.length > 0) {
      const dbValue = parseFloat(rows[0].value as string);
      // Repopulate cache safely
      try {
        await this.redis.set(THRESHOLD_CACHE_KEY, String(dbValue));
      } catch {
        // Ignore cache failure
      }
      return dbValue;
    }

    // Return built-in default when never configured
    return DEFAULT_THRESHOLD;
  }

  // ---------------------------------------------------------------------------
  // getSummary
  // ---------------------------------------------------------------------------

  /**
   * Return the attendance summary for a student in a given course.
   * Includes computed percentage and the individual session records.
   *
   * Requirements: 5.2
   *
   * @param studentId UUID of the student
   * @param courseId  UUID of the course
   */
  async getSummary(
    studentId: string,
    courseId: string,
  ): Promise<AttendanceSummary> {
    return this.getAttendanceSummary(studentId, courseId);
  }

  /**
   * Alias used by AttendanceController — delegates to getSummary.
   */
  async getAttendanceSummary(
    studentId: string,
    courseId: string,
  ): Promise<AttendanceSummary> {
    // Fetch all attendance records for this student + course by joining sessions
    const sessions = await this.attendanceRepo
      .createQueryBuilder('ar')
      .innerJoin(
        TimetableSession,
        's',
        's.id = ar.session_id AND s.course_id = :courseId',
        { courseId },
      )
      .where('ar.student_id = :studentId', { studentId })
      .getMany();

    const present = sessions.filter(
      (r) => r.status === AttendanceStatus.PRESENT,
    ).length;
    const late = sessions.filter(
      (r) => r.status === AttendanceStatus.LATE,
    ).length;
    const absent = sessions.filter(
      (r) => r.status === AttendanceStatus.ABSENT,
    ).length;

    const percentage = this.calculator.computeAttendancePercentage({
      present,
      late,
      absent,
    });

    return { percentage, present, late, absent, total: present + late + absent, sessions };
  }

  // ---------------------------------------------------------------------------
  // findAll
  // ---------------------------------------------------------------------------

  /**
   * Role-scoped listing of attendance records.
   *
   *  - super_admin / admin_staff: all records (optionally filtered by department)
   *  - department_head: records for courses in their department
   *  - lecturer: records for sessions they personally recorded
   *  - student: their own records only
   *
   * Requirements: 5.4
   */
  async findAll(
    role: string,
    userId: string,
    departmentId?: string,
  ): Promise<AttendanceRecord[]> {
    const qb = this.attendanceRepo
      .createQueryBuilder('ar')
      .innerJoinAndSelect(TimetableSession, 's', 's.id = ar.session_id');

    if (role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN_STAFF) {
      // Full access — optional department filter
      if (departmentId) {
        qb.innerJoin('s.course', 'c').andWhere(
          'c.department_id = :departmentId',
          { departmentId },
        );
      }
    } else if (role === UserRole.DEPARTMENT_HEAD) {
      // Records for courses in the head's department
      qb.innerJoin('s.course', 'c')
        .innerJoin('c.department', 'd');
      if (departmentId) {
        qb.andWhere('c.department_id = :departmentId', { departmentId });
      } else {
        qb.andWhere('d.head_id = :userId', { userId });
      }
    } else if (role === UserRole.LECTURER) {
      // Only records they personally recorded
      qb.andWhere('ar.recorded_by = :userId', { userId });
    } else {
      // Student — only their own records
      const profile = await this.studentProfileRepo.findOne({
        where: { user_id: userId },
      });
      if (!profile) return [];
      qb.andWhere('ar.student_id = :studentId', { studentId: profile.id });
    }

    return qb.getMany();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Recompute attendance percentages for the given students in the given course
   * and academic period. Enqueue low-attendance notifications for any student
   * (and their linked guardians) whose percentage is below the threshold.
   *
   * Requirements: 5.3
   */
  private async checkAndNotifyLowAttendance(
    studentIds: string[],
    courseId: string,
    academicPeriodId: string,
  ): Promise<void> {
    const threshold = await this.getThreshold();

    // Count total sessions for the course
    const totalSessionsResult: { cnt: string }[] =
      await this.sessionRepo.manager.query(
        `SELECT COUNT(*) AS cnt FROM timetable_sessions
         WHERE course_id = $1 AND academic_period_id = $2`,
        [courseId, academicPeriodId],
      );
    const totalSessions = Number(totalSessionsResult[0]?.cnt ?? 0);

    for (const studentId of studentIds) {
      try {
        // Count present + late sessions per student from attendance_records
        const counts = await this.attendanceRepo
          .createQueryBuilder('ar')
          .select('ar.status', 'status')
          .addSelect('COUNT(*)', 'cnt')
          .innerJoin(
            TimetableSession,
            's',
            's.id = ar.session_id AND s.course_id = :courseId AND s.academic_period_id = :academicPeriodId',
            { courseId, academicPeriodId },
          )
          .where('ar.student_id = :studentId', { studentId })
          .groupBy('ar.status')
          .getRawMany<{ status: string; cnt: string }>();

        const present = Number(
          counts.find((c) => c.status === AttendanceStatus.PRESENT)?.cnt ?? 0,
        );
        const late = Number(
          counts.find((c) => c.status === AttendanceStatus.LATE)?.cnt ?? 0,
        );
        const absent = Number(
          counts.find((c) => c.status === AttendanceStatus.ABSENT)?.cnt ?? 0,
        );

        // Use total sessions count (not just attended ones) for accurate percentage
        const effectiveAbsent = Math.max(absent, totalSessions - present - late);
        const percentage = this.calculator.computeAttendancePercentage({
          present,
          late,
          absent: effectiveAbsent,
        });

        if (!this.calculator.isBelowThreshold(percentage, threshold)) {
          continue; // Student is fine — no notification needed
        }

        const payload: Record<string, unknown> = {
          courseId,
          academicPeriodId,
          studentId,
          percentage,
          threshold,
        };

        // Load the student's user_id
        const studentProfile = await this.studentProfileRepo.findOne({
          where: { id: studentId },
        });
        if (!studentProfile) continue;

        const recipientId = studentProfile.user_id;

        // Notify student via email + SMS
        await this.notificationService.enqueue(
          recipientId,
          'low_attendance',
          'email',
          'attendance.below_threshold',
          payload,
        );
        await this.notificationService.enqueue(
          recipientId,
          'low_attendance',
          'sms',
          'attendance.below_threshold',
          payload,
        );

        // Notify linked guardians
        const guardianLinks = await this.guardianLinkRepo.find({
          where: { student_id: studentId },
        });

        for (const link of guardianLinks) {
          const guardian = await this.guardianRepo.findOne({
            where: { id: link.guardian_id },
          });
          if (!guardian) continue;

          await this.notificationService.enqueue(
            guardian.user_id,
            'low_attendance',
            'email',
            'attendance.below_threshold.guardian',
            payload,
          );
          await this.notificationService.enqueue(
            guardian.user_id,
            'low_attendance',
            'sms',
            'attendance.below_threshold.guardian',
            payload,
          );
        }
      } catch (err) {
        // Non-fatal: log but do not abort the whole batch
        this.logger.error(
          `Low-attendance check failed for student ${studentId}: ${String(err)}`,
        );
      }
    }
  }
}

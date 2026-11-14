import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as Minio from 'minio';

import { User, UserRole } from '../../entities/user.entity';
import { StudentProfile, StudentStatus } from '../../entities/student-profile.entity';
import { Department } from '../../entities/department.entity';
import { CourseLecturer } from '../../entities/course-lecturer.entity';
import { AuditService } from '../audit/audit.service';
import { AuditOperation } from '../../entities/audit-log.entity';
import { MINIO_CLIENT } from '../../common/providers/minio.provider';
import { AlumniService } from '../alumni/alumni.service';
import { Optional, forwardRef } from '@nestjs/common';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { BatchGraduateDto } from './dto/batch-graduate.dto';
import { generateStudentCredentials } from '../../common/utils/credential-generator';

const BCRYPT_WORK_FACTOR = 12;
const PHOTO_BUCKET = 'student-photos';
const MAX_PHOTO_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'] as const;

/**
 * StudentsService — manages student profile lifecycle.
 *
 * Key behaviours:
 *  - create(): validate fields, generate unique student number, hash temp password,
 *              create User (role=student) + StudentProfile, write audit log.
 *  - findAll(): role-scoped listing; Admin/SuperAdmin see all; Dept Head sees own dept;
 *               Student sees only own profile.
 *  - findOne(): return profile or throw 404.
 *  - update(): update StudentProfile fields EXCEPT student_number; write audit log.
 *  - deactivate(): set users.is_active = false on linked User; write audit log.
 *  - uploadPhoto(): validate MIME/size, upload to MinIO, update photo_url, write audit log.
 *
 * Requirements: 3.1, 3.2, 3.6, 3.8, 3.9, 3.10
 */
@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(StudentProfile)
    private readonly studentProfileRepository: Repository<StudentProfile>,

    private readonly auditService: AuditService,

    @Inject(MINIO_CLIENT)
    private readonly minioClient: Minio.Client,

    @Optional()
    @Inject(forwardRef(() => AlumniService))
    private readonly alumniService?: AlumniService,
  ) {}

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  /**
   * Create a new student account and profile.
   * Generates a unique student number in the format STU-{yearOfEntry}-{5-digit-seq}.
   * Hashes a temporary password using bcrypt(12).
   * Requirements: 3.1, 3.2
   */
  async create(
    dto: CreateStudentDto,
    actorId: string,
  ): Promise<Omit<StudentProfile, 'user'> & {
    user: { id: string; username: string; email: string };
    temporary_password: string;
  }> {
    // Check for duplicate email on User
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('A user with that email already exists.');
    }

    // Check for duplicate national_id on StudentProfile
    const existingProfile = await this.studentProfileRepository.findOne({
      where: { national_id: dto.national_id },
    });
    if (existingProfile) {
      throw new ConflictException(
        'A student with that national ID already exists.',
      );
    }

    // Generate unique student number: STU-{yearOfEntry}-{5-digit-seq}
    const studentNumber = await this.generateStudentNumber(dto.year_of_entry);

    // Auto-generate username (STU2024001) and password (last 6 digits of national ID)
    const credentials = await generateStudentCredentials(
      this.userRepository,
      dto.national_id,
    );

    // Hash the generated password
    const password_hash = await bcrypt.hash(credentials.password, BCRYPT_WORK_FACTOR);

    // Create linked User account
    const user = this.userRepository.create({
      username: credentials.username,
      password_hash,
      role: UserRole.STUDENT,
      email: dto.email,
      phone: dto.phone ?? null,
      is_active: true,
    });
    const savedUser = await this.userRepository.save(user);

    // Create StudentProfile
    const profile = this.studentProfileRepository.create({
      user_id: savedUser.id,
      student_number: studentNumber,
      full_legal_name: dto.full_legal_name,
      date_of_birth: new Date(dto.date_of_birth),
      gender: dto.gender ?? null,
      national_id: dto.national_id,
      phone: dto.phone ?? null,
      personal_email: dto.personal_email ?? null,
      home_address: dto.home_address ?? null,
      programme_id: dto.programme_id ?? null,
      year_of_entry: dto.year_of_entry,
      status: StudentStatus.ACTIVE,
      photo_url: null,
    });
    const savedProfile = await this.studentProfileRepository.save(profile);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'student_profiles',
      recordId: savedProfile.id,
      newValues: {
        student_number: savedProfile.student_number,
        full_legal_name: savedProfile.full_legal_name,
        user_id: savedProfile.user_id,
        username: credentials.username,
        year_of_entry: savedProfile.year_of_entry,
        status: savedProfile.status,
      },
    });

    this.logger.log(
      `Student created: ${savedProfile.id} (${studentNumber}, username: ${credentials.username}) by actor ${actorId}`,
    );

    // Return the generated credentials once so the administrator can safely
    // share them with the student. The password is never persisted in plain text.
    return {
      ...savedProfile,
      user: {
        id: savedUser.id,
        username: savedUser.username,
        email: savedUser.email,
      },
      temporary_password: credentials.password,
    };
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /**
   * List students with role-based scoping.
   *  - Admin Staff / Super Admin: see all students (optionally filtered by departmentId via programme).
   *  - Department Head: see only students in their department (departmentId required).
   *  - Student: sees only their own profile.
   *
   * Requirements: 3.6
   */
  async findAll(
    role: UserRole,
    userId: string,
    departmentId?: string,
  ): Promise<StudentProfile[]> {
    const qb = this.studentProfileRepository
      .createQueryBuilder('sp')
      .leftJoinAndSelect('sp.programme', 'programme')
      .leftJoinAndSelect('sp.user', 'user');

    if (role === UserRole.STUDENT) {
      // Students see only their own profile
      qb.where('sp.user_id = :userId', { userId });
    } else if (role === UserRole.DEPARTMENT_HEAD) {
      // Department Heads see students enrolled in their department's programmes
      let deptId = departmentId;
      if (!deptId) {
        const deptRepo = this.studentProfileRepository.manager.getRepository(Department);
        const dept = await deptRepo.findOne({ where: { head_id: userId } });
        if (dept) deptId = dept.id;
      }
      if (deptId) {
        qb.where('programme.department_id = :deptId', { deptId });
        const deptStudents = await qb.getMany();
        if (deptStudents.length > 0) {
          return deptStudents;
        }
      }
      // Fallback: if department has no programme students yet, return all active students
      // so the HOD can immediately enroll students into department courses
      return this.studentProfileRepository
        .createQueryBuilder('sp')
        .leftJoinAndSelect('sp.programme', 'programme')
        .leftJoinAndSelect('sp.user', 'user')
        .where('sp.status = :status', { status: 'active' })
        .orderBy('sp.created_at', 'DESC')
        .getMany();
    } else if (role === UserRole.LECTURER) {
      // Lecturers see students enrolled in their assigned courses
      const assignmentRepo = this.studentProfileRepository.manager.getRepository(CourseLecturer);
      const assignments = await assignmentRepo.find({ where: { lecturer_id: userId } });
      const courseIds = assignments.map((a) => a.course_id);
      if (courseIds.length > 0) {
        qb.innerJoin('enrollments', 'enr', 'enr.student_id = sp.id')
          .andWhere('enr.course_id IN (:...courseIds)', { courseIds })
          .distinct(true);
      } else {
        // Fallback: if no specific courses assigned, show all active students
        qb.orderBy('sp.created_at', 'DESC');
        return qb.getMany();
      }
    }
    // Admin Staff and Super Admin: no additional filter — see all

    qb.orderBy('sp.created_at', 'DESC');

    return qb.getMany();
  }

  /**
   * Get a single student profile by ID or throw 404.
   * Requirement: 3.6
   */
  async findOne(id: string): Promise<StudentProfile> {
    const profile = await this.studentProfileRepository.findOne({
      where: { id },
      relations: ['user', 'programme'],
    });
    if (!profile) {
      throw new NotFoundException(`Student with id "${id}" not found.`);
    }
    return profile;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  /**
   * Update a student profile.
   * student_number is explicitly excluded from updates.
   * Requirements: 3.8
   */
  async update(
    id: string,
    dto: UpdateStudentDto,
    actorId: string,
  ): Promise<StudentProfile> {
    const profile = await this.studentProfileRepository.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!profile) {
      throw new NotFoundException(`Student with id "${id}" not found.`);
    }

    // Track previous values for audit
    const previousValues: Record<string, unknown> = {
      full_legal_name: profile.full_legal_name,
      date_of_birth: profile.date_of_birth,
      gender: profile.gender,
      national_id: profile.national_id,
      phone: profile.phone,
      personal_email: profile.personal_email,
      home_address: profile.home_address,
      programme_id: profile.programme_id,
      year_of_entry: profile.year_of_entry,
      status: profile.status,
    };

    // Check national_id uniqueness if it is changing
    if (dto.national_id && dto.national_id !== profile.national_id) {
      const conflict = await this.studentProfileRepository.findOne({
        where: { national_id: dto.national_id },
      });
      if (conflict) {
        throw new ConflictException(
          'A student with that national ID already exists.',
        );
      }
    }

    // Apply updates (student_number is intentionally NOT applied)
    if (dto.full_legal_name !== undefined) profile.full_legal_name = dto.full_legal_name;
    if (dto.date_of_birth !== undefined) profile.date_of_birth = new Date(dto.date_of_birth);
    if (dto.gender !== undefined) profile.gender = dto.gender ?? null;
    if (dto.national_id !== undefined) profile.national_id = dto.national_id;
    if (dto.phone !== undefined) profile.phone = dto.phone ?? null;
    if (dto.personal_email !== undefined) profile.personal_email = dto.personal_email ?? null;
    if (dto.home_address !== undefined) profile.home_address = dto.home_address ?? null;
    if (dto.programme_id !== undefined) profile.programme_id = dto.programme_id ?? null;
    if (dto.year_of_entry !== undefined) profile.year_of_entry = dto.year_of_entry;
    if (dto.status !== undefined) profile.status = dto.status;

    // Update linked User email if provided
    if (dto.email !== undefined && profile.user && dto.email !== profile.user.email) {
      const emailConflict = await this.userRepository.findOne({
        where: { email: dto.email },
      });
      if (emailConflict) {
        throw new ConflictException('A user with that email already exists.');
      }
      await this.userRepository.update(profile.user_id, { email: dto.email });
    }

    
    // If student status is changing to graduated, auto-create alumni record
    if (dto.status === StudentStatus.GRADUATED && this.alumniService) {
      await this.alumniService.onStudentGraduated(
        id,
        new Date(),
        null,
        actorId,
      );
    }
  
    const updated = await this.studentProfileRepository.save(profile);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'student_profiles',
      recordId: id,
      previousValues,
      newValues: {
        ...(dto.full_legal_name !== undefined ? { full_legal_name: dto.full_legal_name } : {}),
        ...(dto.date_of_birth !== undefined ? { date_of_birth: dto.date_of_birth } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.national_id !== undefined ? { national_id: dto.national_id } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.personal_email !== undefined ? { personal_email: dto.personal_email } : {}),
        ...(dto.home_address !== undefined ? { home_address: dto.home_address } : {}),
        ...(dto.programme_id !== undefined ? { programme_id: dto.programme_id } : {}),
        ...(dto.year_of_entry !== undefined ? { year_of_entry: dto.year_of_entry } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
      },
    });

    this.logger.log(`Student ${id} updated by actor ${actorId}`);
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Deactivate
  // ---------------------------------------------------------------------------

  /**
   * Deactivate a student by setting the linked User's is_active to false.
   * Requirements: 3.9
   */
  async deactivate(id: string, actorId: string): Promise<{ message: string }> {
    const profile = await this.studentProfileRepository.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!profile) {
      throw new NotFoundException(`Student with id "${id}" not found.`);
    }

    if (profile.user && !profile.user.is_active) {
      return { message: 'Student account is already deactivated.' };
    }

    await this.userRepository.update(profile.user_id, { is_active: false });

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'student_profiles',
      recordId: id,
      previousValues: { is_active: true },
      newValues: {
        is_active: false,
        event: 'STUDENT_DEACTIVATED',
        affectedUserId: profile.user_id,
      },
    });

    this.logger.log(`Student ${id} deactivated by actor ${actorId}`);
    return { message: 'Student account deactivated successfully.' };
  }

  // ---------------------------------------------------------------------------
  // Upload Photo
  // ---------------------------------------------------------------------------

  /**
   * Upload a student profile photo to MinIO.
   *  - Validates MIME type (image/jpeg or image/png only).
   *  - Validates size ≤ 2 MB.
   *  - Uploads to bucket `student-photos` with key `{studentId}/photo.{ext}`.
   *  - Updates student_profiles.photo_url.
   *  - Writes audit log.
   * Requirements: 3.10
   */
  async uploadPhoto(
    studentId: string,
    buffer: Buffer,
    mimeType: string,
    size: number,
    actorId: string,
  ): Promise<StudentProfile> {
    // Validate MIME type
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw new BadRequestException(
        'Invalid file type. Only image/jpeg and image/png are allowed.',
      );
    }

    // Validate file size
    if (size > MAX_PHOTO_SIZE_BYTES) {
      throw new BadRequestException(
        `File size exceeds the 2 MB limit (received ${size} bytes).`,
      );
    }

    const profile = await this.studentProfileRepository.findOne({
      where: { id: studentId },
    });
    if (!profile) {
      throw new NotFoundException(`Student with id "${studentId}" not found.`);
    }

    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const objectKey = `${studentId}/photo.${ext}`;

    // Ensure bucket exists
    await this.ensureBucketExists(PHOTO_BUCKET);

    // Upload to MinIO
    await this.minioClient.putObject(PHOTO_BUCKET, objectKey, buffer, size, {
      'Content-Type': mimeType,
    });

    const photoUrl = `${PHOTO_BUCKET}/${objectKey}`;
    profile.photo_url = photoUrl;
    const updated = await this.studentProfileRepository.save(profile);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'student_profiles',
      recordId: studentId,
      previousValues: { photo_url: null },
      newValues: {
        photo_url: photoUrl,
        event: 'PHOTO_UPLOADED',
      },
    });

    this.logger.log(
      `Photo uploaded for student ${studentId}: ${objectKey} by actor ${actorId}`,
    );

    return updated;
  }

  // ---------------------------------------------------------------------------
  // GPA & Registration Eligibility
  // ---------------------------------------------------------------------------

  /**
   * Calculate and update student GPA based on published final grades.
   * Uses the GPA calculator service to compute both current and cumulative GPA.
   * 
   * @param studentId - Student profile ID
   * @param academicPeriodId - Optional: calculate for specific period (current GPA) or all periods (cumulative)
   */
  async calculateAndUpdateGpa(
    studentId: string,
    academicPeriodId?: string,
  ): Promise<{ current_gpa: number | null; cumulative_gpa: number | null }> {
    const profile = await this.studentProfileRepository.findOne({
      where: { id: studentId },
    });
    if (!profile) {
      throw new NotFoundException(`Student with id "${studentId}" not found.`);
    }

    // Import at runtime to avoid circular dependency
    const { FinalGrade } = await import('../../entities/final-grade.entity');
    const { Course } = await import('../../entities/course.entity');
    const { GpaCalculatorService } = await import('../grades/gpa-calculator.service');
    
    const finalGradeRepo = this.userRepository.manager.getRepository(FinalGrade);
    const courseRepo = this.userRepository.manager.getRepository(Course);
    const gpaCalc = new GpaCalculatorService();

    // Get all published final grades for this student
    const finalGrades = await finalGradeRepo.find({
      where: {
        student_id: studentId,
        is_published: true,
      },
      relations: ['course'],
    });

    if (finalGrades.length === 0) {
      // No grades yet - set GPA to null
      profile.current_gpa = null;
      profile.cumulative_gpa = null;
      await this.studentProfileRepository.save(profile);
      return { current_gpa: null, cumulative_gpa: null };
    }

    // Calculate cumulative GPA (all published grades)
    const gradesForGpa = finalGrades.map((fg) => ({
      grade_points: fg.grade_points || 0,
      credit_hours: fg.course.credit_hours,
    }));
    const cumulativeGpa = gpaCalc.computeGpa(gradesForGpa);

    // Calculate current GPA (specific academic period if provided)
    let currentGpa = cumulativeGpa; // Default to cumulative if no period specified
    if (academicPeriodId) {
      const periodGrades = finalGrades.filter(
        (fg) => fg.academic_period_id === academicPeriodId,
      );
      if (periodGrades.length > 0) {
        const periodGradesForGpa = periodGrades.map((fg) => ({
          grade_points: fg.grade_points || 0,
          credit_hours: fg.course.credit_hours,
        }));
        currentGpa = gpaCalc.computeGpa(periodGradesForGpa);
      }
    }

    // Update student profile
    profile.current_gpa = currentGpa;
    profile.cumulative_gpa = cumulativeGpa;
    await this.studentProfileRepository.save(profile);

    this.logger.log(
      `GPA updated for student ${studentId}: current=${currentGpa}, cumulative=${cumulativeGpa}`,
    );

    return {
      current_gpa: currentGpa,
      cumulative_gpa: cumulativeGpa,
    };
  }

  /**
   * Check if student is eligible to register for new semester.
   * Requirements:
   * - Cumulative GPA >= 1.80 (below 1.80 = blocked)
   * - No active discipline issues (or super admin override)
   * - Warning if GPA between 1.80 and 2.00
   */
  async checkRegistrationEligibility(studentId: string): Promise<{
    eligible: boolean;
    gpa_status: 'good' | 'warning' | 'blocked' | 'no_grades';
    discipline_status: 'clear' | 'blocked';
    current_gpa: number | null;
    cumulative_gpa: number | null;
    has_active_discipline: boolean;
    message: string;
  }> {
    const profile = await this.studentProfileRepository.findOne({
      where: { id: studentId },
    });
    if (!profile) {
      throw new NotFoundException(`Student with id "${studentId}" not found.`);
    }

    // Check GPA status
    let gpaStatus: 'good' | 'warning' | 'blocked' | 'no_grades' = 'no_grades';
    if (profile.cumulative_gpa === null || profile.cumulative_gpa === undefined) {
      gpaStatus = 'no_grades';
    } else if (profile.cumulative_gpa < 1.80) {
      gpaStatus = 'blocked';
    } else if (profile.cumulative_gpa >= 1.80 && profile.cumulative_gpa <= 2.00) {
      gpaStatus = 'warning';
    } else {
      gpaStatus = 'good';
    }

    // Check discipline status
    const disciplineStatus = profile.has_active_discipline ? 'blocked' : 'clear';

    // Determine eligibility
    const eligible =
      (gpaStatus === 'good' || gpaStatus === 'warning' || gpaStatus === 'no_grades') &&
      disciplineStatus === 'clear';

    // Build message
    let message = '';
    if (!eligible) {
      const reasons: string[] = [];
      if (gpaStatus === 'blocked') {
        reasons.push(
          `GPA ${profile.cumulative_gpa?.toFixed(2)} is below 1.80 minimum requirement`,
        );
      }
      if (disciplineStatus === 'blocked') {
        reasons.push('Active discipline issue(s) pending clearance');
      }
      message = `Registration blocked: ${reasons.join('; ')}. Contact academic affairs for assistance.`;
    } else if (gpaStatus === 'warning') {
      message = `Registration allowed with WARNING: GPA ${profile.cumulative_gpa?.toFixed(2)} is between 1.80-2.00. Academic support recommended.`;
    } else if (gpaStatus === 'no_grades') {
      message = 'Registration allowed. No grades on record yet (new student).';
    } else {
      message = `Registration eligible. GPA: ${profile.cumulative_gpa?.toFixed(2)}`;
    }

    return {
      eligible,
      gpa_status: gpaStatus,
      discipline_status: disciplineStatus,
      current_gpa: profile.current_gpa,
      cumulative_gpa: profile.cumulative_gpa,
      has_active_discipline: profile.has_active_discipline,
      message,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Generate a unique student number in the format STU-{year}-{5-digit-seq}.
   * Uniqueness is guaranteed by counting existing profiles for the same year
   * and incrementing.
   */
  private async generateStudentNumber(yearOfEntry: number): Promise<string> {
    const count = await this.studentProfileRepository
      .createQueryBuilder('sp')
      .where('sp.year_of_entry = :year', { year: yearOfEntry })
      .getCount();

    const seq = (count + 1).toString().padStart(5, '0');
    return `STU-${yearOfEntry}-${seq}`;
  }

  /**
   * Resolve a unique username by appending a numeric suffix if the base
   * username is already taken.
   */
  private async resolveUniqueUsername(base: string): Promise<string> {
    let candidate = base;
    let counter = 1;
    while (
      await this.userRepository.findOne({ where: { username: candidate } })
    ) {
      candidate = `${base}${counter}`;
      counter++;
    }
    return candidate;
  }

  /**
   * Resolve a UUID that could be either a StudentProfile.id or a User.id
   * to the matching StudentProfile.id.
   */
  async resolveStudentProfileId(idOrUserId: string): Promise<string> {
    const profile = await this.studentProfileRepository.findOne({
      where: [{ id: idOrUserId }, { user_id: idOrUserId }],
    });
    return profile ? profile.id : idOrUserId;
  }

  /**
   * Batch graduate active students in a programme/cohort and generate alumni records.
   */
  async batchGraduate(
    dto: BatchGraduateDto,
    actorId: string,
  ): Promise<{ graduatedCount: number }> {
    const whereClause: Record<string, unknown> = {
      programme_id: dto.programme_id,
      status: StudentStatus.ACTIVE,
    };
    if (dto.year_of_entry) {
      whereClause['year_of_entry'] = dto.year_of_entry;
    }

    const students = await this.studentProfileRepository.find({
      where: whereClause as any,
      relations: ['programme'],
    });

    if (students.length === 0) {
      return { graduatedCount: 0 };
    }

    const gradDate = dto.graduation_date ? new Date(dto.graduation_date) : new Date();
    let graduatedCount = 0;

    for (const student of students) {
      const previousValues = { status: student.status };
      student.status = StudentStatus.GRADUATED;
      await this.studentProfileRepository.save(student);

      if (this.alumniService) {
        await this.alumniService.onStudentGraduated(
          student.id,
          gradDate,
          null,
          actorId,
        );
      }

      await this.auditService.log({
        actorId,
        operation: AuditOperation.UPDATE,
        recordType: 'student_profiles',
        recordId: student.id,
        previousValues,
        newValues: { status: StudentStatus.GRADUATED, graduation_date: gradDate },
      });

      graduatedCount++;
    }

    this.logger.log(
      `Batch graduated ${graduatedCount} students for programme ${dto.programme_id} by actor ${actorId}`,
    );
    return { graduatedCount };
  }

  /**
   * Ensure a MinIO bucket exists, creating it if necessary.
   */
  private async ensureBucketExists(bucketName: string): Promise<void> {
    try {
      const exists = await this.minioClient.bucketExists(bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(bucketName, 'us-east-1');
        this.logger.log(`MinIO bucket "${bucketName}" created.`);
      }
    } catch (err) {
      this.logger.warn(
        `Could not verify/create MinIO bucket "${bucketName}": ${String(err)}`,
      );
    }
  }
}

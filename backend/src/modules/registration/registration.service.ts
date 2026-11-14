import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SemesterRegistration } from '../../entities/semester-registration.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { AcademicPeriod } from '../../entities/academic-period.entity';
import { DisciplineRecord, DisciplineStatus } from '../../entities/discipline-record.entity';
import { AuditService } from '../audit/audit.service';
import { AuditOperation } from '../../entities/audit-log.entity';
import { RegisterSemesterDto } from './dto/register-semester.dto';

/**
 * RegistrationService - Handles semester registration for senior students
 * with GPA and discipline eligibility checks
 */
@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    @InjectRepository(SemesterRegistration)
    private readonly registrationRepository: Repository<SemesterRegistration>,

    @InjectRepository(StudentProfile)
    private readonly studentRepository: Repository<StudentProfile>,

    @InjectRepository(AcademicPeriod)
    private readonly periodRepository: Repository<AcademicPeriod>,

    @InjectRepository(DisciplineRecord)
    private readonly disciplineRepository: Repository<DisciplineRecord>,

    private readonly auditService: AuditService,
  ) {}

  /**
   * Register student for semester with eligibility checks
   * - Checks GPA >= 1.80 (warning if 1.80-2.00, block if < 1.80)
   * - Checks no active discipline issues
   * - Prevents duplicate registration
   */
  async registerForSemester(
    dto: RegisterSemesterDto,
    actorId: string,
  ): Promise<SemesterRegistration> {
    // Check if student exists
    const student = await this.studentRepository.findOne({
      where: { id: dto.student_id },
      relations: ['user'],
    });

    if (!student) {
      throw new NotFoundException(`Student ${dto.student_id} not found`);
    }

    // Check if academic period exists
    const period = await this.periodRepository.findOne({
      where: { id: dto.academic_period_id },
    });

    if (!period) {
      throw new NotFoundException(
        `Academic period ${dto.academic_period_id} not found`,
      );
    }

    // Check for duplicate registration
    const existing = await this.registrationRepository.findOne({
      where: {
        student_id: dto.student_id,
        academic_period_id: dto.academic_period_id,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Student is already registered for this semester',
      );
    }

    // Check discipline status
    const activeDiscipline = await this.disciplineRepository.findOne({
      where: {
        student_id: dto.student_id,
        status: DisciplineStatus.ACTIVE,
      },
    });

    const hasDisciplineBlock = !!activeDiscipline;

    // Check GPA
    const gpa = student.current_gpa || 0;
    const gpaWarning = gpa >= 1.80 && gpa < 2.00;
    const gpaBlock = gpa < 1.80;

    // Determine if registration should be blocked
    const isBlocked = hasDisciplineBlock || gpaBlock;

    let blockReason: string | null = null;
    if (hasDisciplineBlock) {
      blockReason = 'Student has active discipline issues';
    } else if (gpaBlock) {
      blockReason = `GPA (${gpa.toFixed(2)}) is below minimum requirement of 1.80`;
    }

    // Create registration record
    const registration = this.registrationRepository.create({
      student_id: dto.student_id,
      academic_period_id: dto.academic_period_id,
      status: isBlocked ? 'blocked' : 'approved',
      gpa_at_registration: gpa,
      has_discipline_block: hasDisciplineBlock,
      gpa_warning: gpaWarning,
      gpa_block: gpaBlock,
      block_reason: blockReason,
      notes: dto.notes,
      approved_at: isBlocked ? null : new Date(),
    });

    const saved = await this.registrationRepository.save(registration);

    // Audit log
    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'semester_registration',
      recordId: saved.id,
      newValues: {
        student_id: dto.student_id,
        status: saved.status,
        gpa: gpa,
        blocked: isBlocked,
      },
    });

    if (isBlocked) {
      this.logger.warn(
        `Registration blocked for student ${dto.student_id}: ${blockReason}`,
      );
    } else if (gpaWarning) {
      this.logger.warn(
        `Registration approved with warning for student ${dto.student_id}: GPA ${gpa.toFixed(2)} is in warning zone (1.80-2.00)`,
      );
    } else {
      this.logger.log(
        `Student ${dto.student_id} registered for semester ${dto.academic_period_id}`,
      );
    }

    return saved;
  }

  /**
   * Override registration block (super admin only)
   */
  async overrideBlock(
    registrationId: string,
    overrideReason: string,
    adminId: string,
  ): Promise<SemesterRegistration> {
    const registration = await this.registrationRepository.findOne({
      where: { id: registrationId },
      relations: ['student', 'academicPeriod'],
    });

    if (!registration) {
      throw new NotFoundException(`Registration ${registrationId} not found`);
    }

    if (registration.status !== 'blocked') {
      throw new BadRequestException('Registration is not blocked');
    }

    registration.status = 'approved';
    registration.admin_override = true;
    registration.overridden_by_id = adminId;
    registration.override_reason = overrideReason;
    registration.approved_at = new Date();

    const saved = await this.registrationRepository.save(registration);

    await this.auditService.log({
      actorId: adminId,
      operation: AuditOperation.UPDATE,
      recordType: 'semester_registration',
      recordId: registrationId,
      previousValues: { status: 'blocked' },
      newValues: { status: 'approved', override_reason: overrideReason },
    });

    this.logger.log(
      `Admin ${adminId} overrode registration block for ${registrationId}: ${overrideReason}`,
    );

    return saved;
  }

  /**
   * Get all registrations with optional filters
   */
  async findAll(
    status?: string,
    academicPeriodId?: string,
  ): Promise<SemesterRegistration[]> {
    const query = this.registrationRepository
      .createQueryBuilder('sr')
      .leftJoinAndSelect('sr.student', 'student')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('sr.academicPeriod', 'academicPeriod')
      .leftJoinAndSelect('sr.overriddenBy', 'overriddenBy')
      .orderBy('sr.registered_at', 'DESC');

    if (status) {
      query.andWhere('sr.status = :status', { status });
    }

    if (academicPeriodId) {
      query.andWhere('sr.academic_period_id = :academicPeriodId', {
        academicPeriodId,
      });
    }

    return query.getMany();
  }

  /**
   * Get registration by ID
   */
  async findOne(id: string): Promise<SemesterRegistration> {
    const registration = await this.registrationRepository.findOne({
      where: { id },
      relations: ['student', 'student.user', 'academicPeriod', 'overriddenBy'],
    });

    if (!registration) {
      throw new NotFoundException(`Registration ${id} not found`);
    }

    return registration;
  }

  /**
   * Get student's registration history
   */
  async getStudentRegistrations(
    studentId: string,
  ): Promise<SemesterRegistration[]> {
    return this.registrationRepository.find({
      where: { student_id: studentId },
      relations: ['academicPeriod', 'overriddenBy'],
      order: { registered_at: 'DESC' },
    });
  }

  /**
   * Check if student can register for current/upcoming semester
   */
  async checkEligibility(studentId: string): Promise<{
    eligible: boolean;
    warnings: string[];
    blocks: string[];
    gpa: number | null;
    has_active_discipline: boolean;
  }> {
    const student = await this.studentRepository.findOne({
      where: { id: studentId },
    });

    if (!student) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    const warnings: string[] = [];
    const blocks: string[] = [];

    // Check GPA
    const gpa = student.current_gpa || 0;
    if (gpa < 1.80 && gpa > 0) {
      blocks.push(`GPA ${gpa.toFixed(2)} is below minimum requirement of 1.80`);
    } else if (gpa >= 1.80 && gpa < 2.00) {
      warnings.push(`GPA ${gpa.toFixed(2)} is in warning zone (1.80-2.00)`);
    }

    // Check discipline
    const activeDiscipline = await this.disciplineRepository.findOne({
      where: {
        student_id: studentId,
        status: DisciplineStatus.ACTIVE,
      },
    });

    if (activeDiscipline) {
      blocks.push('Student has active discipline issues');
    }

    const eligible = blocks.length === 0;

    return {
      eligible,
      warnings,
      blocks,
      gpa: student.current_gpa,
      has_active_discipline: !!activeDiscipline,
    };
  }
}

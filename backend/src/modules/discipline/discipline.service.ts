import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  DisciplineRecord,
  DisciplineStatus,
} from '../../entities/discipline-record.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { AuditService } from '../audit/audit.service';
import { AuditOperation } from '../../entities/audit-log.entity';
import { CreateDisciplineDto } from './dto/create-discipline.dto';
import { ClearDisciplineDto } from './dto/clear-discipline.dto';

/**
 * DisciplineService — manages student discipline records.
 * 
 * Key features:
 *  - Lecturers, dept heads, and admin can report discipline issues
 *  - Only super admin can clear discipline issues
 *  - Auto-updates student_profile.has_active_discipline flag
 *  - Registration eligibility check based on discipline status
 */
@Injectable()
export class DisciplineService {
  private readonly logger = new Logger(DisciplineService.name);

  constructor(
    @InjectRepository(DisciplineRecord)
    private readonly disciplineRepository: Repository<DisciplineRecord>,

    @InjectRepository(StudentProfile)
    private readonly studentProfileRepository: Repository<StudentProfile>,

    private readonly auditService: AuditService,
  ) {}

  /**
   * Create a new discipline record.
   * Automatically sets has_active_discipline flag on student profile.
   */
  async create(
    dto: CreateDisciplineDto,
    actorId: string,
  ): Promise<DisciplineRecord> {
    // Verify student exists
    const student = await this.studentProfileRepository.findOne({
      where: { id: dto.student_id },
    });
    if (!student) {
      throw new NotFoundException(
        `Student with id "${dto.student_id}" not found.`,
      );
    }

    // Create discipline record
    const record = this.disciplineRepository.create({
      student_id: dto.student_id,
      issue_type: dto.issue_type,
      description: dto.description,
      reported_by: actorId,
      status: DisciplineStatus.ACTIVE,
    });

    const saved = await this.disciplineRepository.save(record);

    // Update student profile flag
    await this.updateStudentDisciplineStatus(dto.student_id);

    // Audit log
    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'discipline_records',
      recordId: saved.id,
      newValues: {
        student_id: saved.student_id,
        issue_type: saved.issue_type,
        description: saved.description,
        status: saved.status,
      },
    });

    this.logger.log(
      `Discipline record created for student ${dto.student_id} by actor ${actorId}`,
    );

    return saved;
  }

  /**
   * List all discipline records with optional filtering.
   */
  async findAll(filters?: {
    studentId?: string;
    status?: DisciplineStatus;
  }): Promise<DisciplineRecord[]> {
    const qb = this.disciplineRepository
      .createQueryBuilder('dr')
      .leftJoinAndSelect('dr.student', 'student')
      .leftJoinAndSelect('dr.reporter', 'reporter')
      .leftJoinAndSelect('dr.clearedByUser', 'clearedByUser');

    if (filters?.studentId) {
      qb.where('dr.student_id = :studentId', { studentId: filters.studentId });
    }

    if (filters?.status) {
      qb.andWhere('dr.status = :status', { status: filters.status });
    }

    qb.orderBy('dr.created_at', 'DESC');

    return qb.getMany();
  }

  /**
   * Get a single discipline record by ID.
   */
  async findOne(id: string): Promise<DisciplineRecord> {
    const record = await this.disciplineRepository.findOne({
      where: { id },
      relations: ['student', 'reporter', 'clearedByUser'],
    });

    if (!record) {
      throw new NotFoundException(`Discipline record with id "${id}" not found.`);
    }

    return record;
  }

  /**
   * Clear a discipline issue (super admin only).
   * Updates status to CLEARED and sets clearance details.
   */
  async clear(
    id: string,
    dto: ClearDisciplineDto,
    actorId: string,
  ): Promise<DisciplineRecord> {
    const record = await this.disciplineRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Discipline record with id "${id}" not found.`);
    }

    if (record.status === DisciplineStatus.CLEARED) {
      throw new BadRequestException(
        'This discipline issue has already been cleared.',
      );
    }

    // Update record
    record.status = DisciplineStatus.CLEARED;
    record.cleared_by = actorId;
    record.cleared_at = new Date();
    record.clearance_note = dto.clearance_note || null;

    const saved = await this.disciplineRepository.save(record);

    // Update student profile flag
    await this.updateStudentDisciplineStatus(record.student_id);

    // Audit log
    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'discipline_records',
      recordId: id,
      previousValues: { status: DisciplineStatus.ACTIVE },
      newValues: {
        status: DisciplineStatus.CLEARED,
        cleared_by: actorId,
        cleared_at: saved.cleared_at?.toISOString(),
        clearance_note: saved.clearance_note,
      },
    });

    this.logger.log(
      `Discipline record ${id} cleared by actor ${actorId}`,
    );

    return saved;
  }

  /**
   * Check if a student has any active discipline issues.
   * Returns true if student is blocked from registration.
   */
  async hasActiveDiscipline(studentId: string): Promise<boolean> {
    const count = await this.disciplineRepository.count({
      where: {
        student_id: studentId,
        status: DisciplineStatus.ACTIVE,
      },
    });

    return count > 0;
  }

  /**
   * Get discipline status summary for a student.
   * Used for registration eligibility check.
   */
  async getStudentDisciplineStatus(studentId: string): Promise<{
    hasActiveDiscipline: boolean;
    activeRecordsCount: number;
    canRegister: boolean;
    message?: string;
  }> {
    const activeRecords = await this.disciplineRepository.find({
      where: {
        student_id: studentId,
        status: DisciplineStatus.ACTIVE,
      },
    });

    const hasActiveDiscipline = activeRecords.length > 0;

    return {
      hasActiveDiscipline,
      activeRecordsCount: activeRecords.length,
      canRegister: !hasActiveDiscipline,
      message: hasActiveDiscipline
        ? `Student has ${activeRecords.length} active discipline issue(s). Registration blocked pending super admin clearance.`
        : 'No active discipline issues. Student can register.',
    };
  }

  /**
   * Private helper: Update student_profile.has_active_discipline flag
   * based on current active discipline records.
   */
  private async updateStudentDisciplineStatus(studentId: string): Promise<void> {
    const hasActive = await this.hasActiveDiscipline(studentId);

    await this.studentProfileRepository.update(
      { id: studentId },
      { has_active_discipline: hasActive },
    );

    this.logger.log(
      `Student ${studentId} discipline flag updated to: ${hasActive}`,
    );
  }
}

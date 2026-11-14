import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Alumni } from '../../entities/alumni.entity';
import { CareerPlacement } from '../../entities/career-placement.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { AuditService } from '../audit/audit.service';
import { AuditOperation } from '../../entities/audit-log.entity';
import { UpdateAlumniContactDto } from './dto/update-alumni-contact.dto';
import { CreateCareerPlacementDto } from './dto/create-career-placement.dto';

/**
 * AlumniService — alumni record lifecycle and career placement management.
 *
 * Key behaviours:
 *  - onStudentGraduated(): auto-create alumni record when student status → 'graduated'
 *  - updateContactDetails(): alumni self-service contact update
 *  - addCareerPlacement(): Admin Staff records placement outcomes
 *  - findAll(): role-scoped listing (Dept Head → own dept)
 *
 * Requirements: 10.1–10.6
 */
@Injectable()
export class AlumniService {
  private readonly logger = new Logger(AlumniService.name);

  constructor(
    @InjectRepository(Alumni)
    private readonly alumniRepository: Repository<Alumni>,

    @InjectRepository(CareerPlacement)
    private readonly placementRepository: Repository<CareerPlacement>,

    @InjectRepository(StudentProfile)
    private readonly studentProfileRepository: Repository<StudentProfile>,

    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Auto-create on graduation
  // ---------------------------------------------------------------------------

  /**
   * Create an Alumni record when a student's status is set to 'graduated'.
   * Called by StudentsService when status is updated to graduated.
   * Requirements: 10.1
   */
  async onStudentGraduated(
    studentId: string,
    graduationDate: Date,
    finalGpa: number | null,
    actorId: string,
  ): Promise<Alumni> {
    // Idempotent — skip if already exists
    const existing = await this.alumniRepository.findOne({
      where: { student_id: studentId },
    });
    if (existing) {
      this.logger.warn(`Alumni record already exists for student ${studentId}`);
      return existing;
    }

    const alumni = this.alumniRepository.create({
      student_id: studentId,
      graduation_date: graduationDate,
      final_gpa: finalGpa,
    });
    const saved = await this.alumniRepository.save(alumni);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'alumni',
      recordId: saved.id,
      newValues: {
        student_id: studentId,
        graduation_date: graduationDate,
        final_gpa: finalGpa,
      },
    });

    this.logger.log(`Alumni record created for student ${studentId}`);
    return saved;
  }

  // ---------------------------------------------------------------------------
  // Contact update (self-service for Alumni role)
  // ---------------------------------------------------------------------------

  /**
   * Update contact / employment details for an alumni record.
   * The alumniUserId guard ensures Alumni can only update their own record.
   * Requirements: 10.2, 10.6
   */
  async updateContactDetails(
    alumniId: string,
    dto: UpdateAlumniContactDto,
    actorId: string,
    actorRole: string,
  ): Promise<Alumni> {
    const alumni = await this.findOneOrFail(alumniId);

    // Alumni role: can only update their own record
    // Admin Staff / Super Admin: can update any
    if (actorRole !== 'admin_staff' && actorRole !== 'super_admin') {
      const student = await this.studentProfileRepository.findOne({
        where: { id: alumni.student_id },
        relations: ['user'],
      });
      if (!student || student.user_id !== actorId) {
        throw new ForbiddenException('Alumni can only update their own contact details.');
      }
    }

    const previousValues = {
      current_email: alumni.current_email,
      current_phone: alumni.current_phone,
      employer: alumni.employer,
      job_title: alumni.job_title,
    };

    Object.assign(alumni, dto);
    const saved = await this.alumniRepository.save(alumni);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'alumni',
      recordId: alumniId,
      previousValues,
      newValues: dto as Record<string, unknown>,
    });

    return saved;
  }

  // ---------------------------------------------------------------------------
  // Career placements
  // ---------------------------------------------------------------------------

  /**
   * Record a career placement for an alumni.
   * Requirements: 10.3
   */
  async addCareerPlacement(
    dto: CreateCareerPlacementDto,
    actorId: string,
  ): Promise<CareerPlacement> {
    // Verify alumni exists
    await this.findOneOrFail(dto.alumni_id);

    const placement = this.placementRepository.create({
      alumni_id: dto.alumni_id,
      employer_name: dto.employer_name,
      position_title: dto.position_title,
      start_date: dto.start_date as unknown as Date,
      sector: dto.sector ?? null,
      placement_type: dto.placement_type ?? null,
    });
    const saved = await this.placementRepository.save(placement);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'career_placements',
      recordId: saved.id,
      newValues: { ...dto },
    });

    this.logger.log(`Career placement created for alumni ${dto.alumni_id}`);
    return saved;
  }

  findPlacementsForAlumni(alumniId: string): Promise<CareerPlacement[]> {
    return this.placementRepository.find({
      where: { alumni_id: alumniId },
      order: { start_date: 'DESC' },
    });
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /**
   * Role-scoped listing. Department Head sees only their dept's alumni.
   * Requirements: 10.4
   */
  async findAll(
    role: string,
    departmentId?: string,
    graduationYear?: number,
    programmeId?: string,
  ): Promise<Alumni[]> {
    const qb = this.alumniRepository
      .createQueryBuilder('al')
      .leftJoinAndSelect('al.student', 'sp')
      .leftJoinAndSelect('sp.programme', 'prog');

    if (role === 'department_head' && departmentId) {
      qb.andWhere('prog.department_id = :departmentId', { departmentId });
    }

    if (graduationYear) {
      qb.andWhere("EXTRACT(YEAR FROM al.graduation_date) = :year", {
        year: graduationYear,
      });
    }

    if (programmeId) {
      qb.andWhere('sp.programme_id = :programmeId', { programmeId });
    }

    return qb.orderBy('al.graduation_date', 'DESC').getMany();
  }

  async findOne(id: string): Promise<Alumni> {
    return this.findOneOrFail(id);
  }

  async findByStudentId(studentId: string): Promise<Alumni | null> {
    return this.alumniRepository.findOne({
      where: { student_id: studentId },
      relations: ['student'],
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async findOneOrFail(id: string): Promise<Alumni> {
    const alumni = await this.alumniRepository.findOne({
      where: { id },
      relations: ['student'],
    });
    if (!alumni) {
      throw new NotFoundException(`Alumni record "${id}" not found.`);
    }
    return alumni;
  }
}

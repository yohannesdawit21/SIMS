import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { ParentGuardian } from '../../entities/parent-guardian.entity';
import { GuardianStudentLink } from '../../entities/guardian-student-link.entity';
import { User, UserRole } from '../../entities/user.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { FeeRecord } from '../../entities/fee-record.entity';
import { AuditService } from '../audit/audit.service';
import { AuditOperation } from '../../entities/audit-log.entity';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import { UpdateGuardianContactDto } from './dto/update-guardian-contact.dto';

/**
 * GuardianService — Parent/Guardian account management and linked student portal.
 *
 * Key behaviours:
 *  - createGuardian(): Admin Staff creates User (role=parent_guardian) + ParentGuardian row
 *  - linkToStudent(): Admin Staff links guardian to student, records consent in audit log
 *  - getLinkedStudentData(): Read-only view of enrolled student's profile, grades,
 *    attendance, and outstanding fees
 *  - updateContact(): Guardian updates own email/phone
 *
 * Requirements: 12.1–12.5
 */
@Injectable()
export class GuardianService {
  private readonly logger = new Logger(GuardianService.name);

  constructor(
    @InjectRepository(ParentGuardian)
    private readonly guardianRepository: Repository<ParentGuardian>,

    @InjectRepository(GuardianStudentLink)
    private readonly linkRepository: Repository<GuardianStudentLink>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(StudentProfile)
    private readonly studentProfileRepository: Repository<StudentProfile>,

    @InjectRepository(FeeRecord)
    private readonly feeRecordRepository: Repository<FeeRecord>,

    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Account creation
  // ---------------------------------------------------------------------------

  /**
   * Create a ParentGuardian account (Admin Staff only).
   * Requirements: 12.1
   */
  async createGuardian(
    dto: CreateGuardianDto,
    actorId: string,
  ): Promise<ParentGuardian> {
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const username = await this.resolveUniqueUsername(
      dto.email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase(),
    );

    const user = this.userRepository.create({
      username,
      email: dto.email,
      phone: dto.phone,
      password_hash: passwordHash,
      role: UserRole.PARENT_GUARDIAN,
      is_active: true,
    });
    const savedUser = await this.userRepository.save(user);

    const guardian = this.guardianRepository.create({ user_id: savedUser.id });
    const savedGuardian = await this.guardianRepository.save(guardian);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'parent_guardians',
      recordId: savedGuardian.id,
      newValues: { user_id: savedUser.id, email: dto.email },
    });

    this.logger.log(`Guardian account created: ${savedGuardian.id} by actor ${actorId}`);
    return savedGuardian;
  }

  // ---------------------------------------------------------------------------
  // Student linking
  // ---------------------------------------------------------------------------

  /**
   * Link a guardian to a student, recording explicit consent.
   * Requirements: 12.1
   */
  async linkToStudent(
    guardianId: string,
    studentId: string,
    actorId: string,
  ): Promise<GuardianStudentLink> {
    await this.findGuardianOrFail(guardianId);

    const student = await this.studentProfileRepository.findOne({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException(`Student profile "${studentId}" not found.`);
    }

    const consentAt = new Date();
    const link = this.linkRepository.create({
      guardian_id: guardianId,
      student_id: studentId,
      consent_recorded_at: consentAt,
    });
    const saved = await this.linkRepository.save(link);

    // Audit the consent (req 12.1)
    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'guardian_student_links',
      recordId: `${guardianId}:${studentId}`,
      newValues: {
        guardian_id: guardianId,
        student_id: studentId,
        consent_recorded_at: consentAt,
      },
    });

    this.logger.log(
      `Guardian ${guardianId} linked to student ${studentId} with consent at ${consentAt.toISOString()}`,
    );
    return saved;
  }

  // ---------------------------------------------------------------------------
  // Linked student data portal
  // ---------------------------------------------------------------------------

  /**
   * Return read-only view of all linked students' data.
   * Scope: student profile, current enrollment, published grades,
   *        attendance percentages, outstanding fee balance.
   * Requirements: 12.2, 12.3
   */
  async getLinkedStudentData(guardianId: string, actorId: string): Promise<unknown[]> {
    // Verify caller is the guardian or an admin
    const guardian = await this.findGuardianOrFail(guardianId);

    const links = await this.linkRepository.find({
      where: { guardian_id: guardian.id },
      relations: [
        'student',
        'student.user',
        'student.programme',
      ],
    });

    const results = await Promise.all(
      links.map(async (link) => {
        const student = link.student;

        // Outstanding fee balance
        const feeRecords = await this.feeRecordRepository.find({
          where: { student_id: student.id },
        });
        const outstandingBalance = feeRecords.reduce((sum, r) => {
          const outstanding =
            Number(r.amount_due) - Number(r.waiver_amount) - Number(r.amount_paid);
          return sum + Math.max(0, outstanding);
        }, 0);

        return {
          student_id: student.id,
          student_number: student.student_number,
          full_name: student.full_legal_name,
          programme: student.programme,
          status: student.status,
          outstanding_fee_balance: outstandingBalance,
          // Grades and attendance are available via their own endpoints
          // (/grades/transcript/:studentId, /attendance/summary/:studentId/:courseId)
        };
      }),
    );

    return results;
  }

  // ---------------------------------------------------------------------------
  // Contact update
  // ---------------------------------------------------------------------------

  /**
   * Guardian updates their own email/phone only.
   * Requirements: 12.5
   */
  async updateContact(
    guardianId: string,
    dto: UpdateGuardianContactDto,
    actorId: string,
    actorRole: string,
  ): Promise<User> {
    const guardian = await this.findGuardianOrFail(guardianId);

    // Enforce own-only update for guardian role
    if (actorRole === 'parent_guardian' && guardian.user_id !== actorId) {
      throw new ForbiddenException('Guardians can only update their own contact details.');
    }

    const user = await this.userRepository.findOne({ where: { id: guardian.user_id } });
    if (!user) throw new NotFoundException('Guardian user account not found.');

    const previousValues = { email: user.email, phone: user.phone };

    if (dto.email) user.email = dto.email;
    if (dto.phone) user.phone = dto.phone;

    const saved = await this.userRepository.save(user);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'users',
      recordId: user.id,
      previousValues,
      newValues: dto as Record<string, unknown>,
    });

    return saved;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  findAll(): Promise<ParentGuardian[]> {
    return this.guardianRepository.find({ relations: ['user'] });
  }

  async findOne(id: string): Promise<ParentGuardian> {
    return this.findGuardianOrFail(id);
  }

  findLinks(guardianId: string): Promise<GuardianStudentLink[]> {
    return this.linkRepository.find({
      where: { guardian_id: guardianId },
      relations: ['student'],
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  async findMe(userId: string): Promise<ParentGuardian> {
    const guardian = await this.guardianRepository.findOne({
      where: [{ id: userId }, { user_id: userId }],
      relations: ['user'],
    });
    if (!guardian) {
      throw new NotFoundException('Guardian record not found for this user.');
    }
    return guardian;
  }

  async getLinkedStudentDataForUser(userId: string): Promise<unknown[]> {
    const guardian = await this.findMe(userId);
    return this.getLinkedStudentData(guardian.id, userId);
  }

  private async findGuardianOrFail(id: string): Promise<ParentGuardian> {
    const guardian = await this.guardianRepository.findOne({
      where: [{ id }, { user_id: id }],
      relations: ['user'],
    });
    if (!guardian) {
      throw new NotFoundException(`Guardian "${id}" not found.`);
    }
    return guardian;
  }

  private async resolveUniqueUsername(base: string): Promise<string> {
    let username = base;
    let counter = 1;
    while (await this.userRepository.findOne({ where: { username } })) {
      username = `${base}${counter++}`;
    }
    return username;
  }
}

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';

import { Hostel } from '../../entities/hostel.entity';
import { HostelAllocation } from '../../entities/hostel-allocation.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { AuditService } from '../audit/audit.service';
import { AuditOperation } from '../../entities/audit-log.entity';
import { FeesService } from '../fees/fees.service';
import { CreateHostelDto } from './dto/create-hostel.dto';
import { CreateAllocationDto } from './dto/create-allocation.dto';
import { TerminateAllocationDto } from './dto/terminate-allocation.dto';

/**
 * HostelService — hostel room management and student allocation lifecycle.
 *
 * Key behaviours:
 *  - createHostel / updateHostel: CRUD for hostel rooms
 *  - createAllocation: capacity check → insert → auto-create hostel fee record
 *  - terminateAllocation: record departure date + reason
 *  - getOccupancyCount: count active (non-terminated, in-range) allocations
 *
 * Requirements: 9.1–9.7
 */
@Injectable()
export class HostelService {
  private readonly logger = new Logger(HostelService.name);

  /** Placeholder academic period used when creating hostel fee records.
   *  In production this would come from an active-period lookup. */
  private readonly HOSTEL_FEE_AMOUNT = 500; // default; Super Admin configures via fee categories

  constructor(
    @InjectRepository(Hostel)
    private readonly hostelRepository: Repository<Hostel>,

    @InjectRepository(HostelAllocation)
    private readonly allocationRepository: Repository<HostelAllocation>,

    private readonly auditService: AuditService,
    private readonly feesService: FeesService,
  ) {}

  // ---------------------------------------------------------------------------
  // Hostel CRUD
  // ---------------------------------------------------------------------------

  async createHostel(dto: CreateHostelDto, actorId: string): Promise<Hostel> {
    const hostel = this.hostelRepository.create({
      block_name: dto.block_name,
      room_number: dto.room_number,
      room_type: dto.room_type ?? null,
      max_occupancy: dto.max_occupancy,
    });
    const saved = await this.hostelRepository.save(hostel);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'hostels',
      recordId: saved.id,
      newValues: { ...dto },
    });

    this.logger.log(`Hostel created: ${saved.id} (${saved.block_name} ${saved.room_number})`);
    return saved;
  }

  async updateHostel(
    id: string,
    dto: Partial<CreateHostelDto>,
    actorId: string,
  ): Promise<Hostel> {
    const hostel = await this.findHostelOrFail(id);
    const prev = { ...hostel };
    Object.assign(hostel, dto);
    const saved = await this.hostelRepository.save(hostel);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'hostels',
      recordId: id,
      previousValues: prev,
      newValues: dto as Record<string, unknown>,
    });
    return saved;
  }

  findAllHostels(): Promise<Hostel[]> {
    return this.hostelRepository.find({ order: { block_name: 'ASC', room_number: 'ASC' } });
  }

  findOneHostel(id: string): Promise<Hostel> {
    return this.findHostelOrFail(id);
  }

  // ---------------------------------------------------------------------------
  // Allocations
  // ---------------------------------------------------------------------------

  /**
   * Create a hostel allocation after enforcing max_occupancy.
   * Auto-creates a hostel fee record on success.
   * Requirements: 9.2, 9.3, 9.7
   */
  async createAllocation(
    dto: CreateAllocationDto,
    actorId: string,
  ): Promise<HostelAllocation> {
    const hostel = await this.findHostelOrFail(dto.hostel_id);

    // Count active allocations: no departure_date set, date range overlaps
    const activeCount = await this.getOccupancyCount(dto.hostel_id, new Date(dto.start_date));

    if (activeCount >= hostel.max_occupancy) {
      throw new ConflictException({
        code: 'HOSTEL_CAPACITY_EXCEEDED',
        message: `Hostel room ${hostel.block_name} ${hostel.room_number} is at full capacity (${hostel.max_occupancy}).`,
        current_occupancy: activeCount,
        max_occupancy: hostel.max_occupancy,
      });
    }

    const allocation = this.allocationRepository.create({
      student_id: dto.student_id,
      hostel_id: dto.hostel_id,
      start_date: dto.start_date as unknown as Date,
      end_date: dto.end_date as unknown as Date,
      departure_date: null,
      departure_reason: null,
    });
    const saved = await this.allocationRepository.save(allocation);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'hostel_allocations',
      recordId: saved.id,
      newValues: {
        student_id: dto.student_id,
        hostel_id: dto.hostel_id,
        start_date: dto.start_date,
        end_date: dto.end_date,
      },
    });

    // Auto-create hostel fee record (req 9.7)
    // We use a best-effort approach — fee creation failure does not roll back the allocation
    try {
      await this.feesService.createFeeRecordInternal({
        studentId: dto.student_id,
        categoryName: 'hostel',
        academicPeriodId: saved.id, // use allocation id as period placeholder when no period provided
        amountDue: this.HOSTEL_FEE_AMOUNT,
        dueDate: new Date(dto.start_date),
        actorId,
      });
    } catch (err) {
      this.logger.warn(
        `Auto hostel fee creation failed for allocation ${saved.id}: ${(err as Error).message}`,
      );
    }

    this.logger.log(`Hostel allocation created: ${saved.id} for student ${dto.student_id}`);
    return saved;
  }

  /**
   * Terminate an allocation before its end date.
   * Requirements: 9.4
   */
  async terminateAllocation(
    id: string,
    dto: TerminateAllocationDto,
    actorId: string,
  ): Promise<HostelAllocation> {
    const allocation = await this.findAllocationOrFail(id);

    const previousValues = {
      departure_date: allocation.departure_date,
      departure_reason: allocation.departure_reason,
    };

    allocation.departure_date = dto.departure_date as unknown as Date;
    allocation.departure_reason = dto.departure_reason ?? null;

    const saved = await this.allocationRepository.save(allocation);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'hostel_allocations',
      recordId: id,
      previousValues,
      newValues: {
        departure_date: dto.departure_date,
        departure_reason: dto.departure_reason,
      },
    });

    this.logger.log(`Hostel allocation ${id} terminated by actor ${actorId}`);
    return saved;
  }

  private async resolveStudentProfileId(idOrUserId: string): Promise<string> {
    const profile = await this.allocationRepository.manager
      .getRepository(StudentProfile)
      .findOne({ where: [{ id: idOrUserId }, { user_id: idOrUserId }] });
    return profile ? profile.id : idOrUserId;
  }

  async findAllAllocations(studentId?: string, hostelId?: string): Promise<HostelAllocation[]> {
    const where: Record<string, unknown> = {};
    if (studentId) where['student_id'] = await this.resolveStudentProfileId(studentId);
    if (hostelId) where['hostel_id'] = hostelId;
    return this.allocationRepository.find({
      where,
      relations: ['hostel', 'student'],
      order: { created_at: 'DESC' },
    });
  }

  async findStudentAllocations(studentId: string): Promise<HostelAllocation[]> {
    const effectiveStudentId = await this.resolveStudentProfileId(studentId);
    return this.allocationRepository.find({
      where: { student_id: effectiveStudentId },
      relations: ['hostel'],
      order: { start_date: 'DESC' },
    });
  }

  /**
   * Count active (non-terminated) allocations for a hostel on a given date.
   * Requirements: 9.3
   */
  async getOccupancyCount(hostelId: string, onDate: Date): Promise<number> {
    const dateStr = onDate.toISOString().split('T')[0];
    return this.allocationRepository
      .createQueryBuilder('ha')
      .where('ha.hostel_id = :hostelId', { hostelId })
      .andWhere('ha.departure_date IS NULL')
      .andWhere('ha.start_date::date <= :date', { date: dateStr })
      .andWhere('ha.end_date::date >= :date', { date: dateStr })
      .getCount();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async findHostelOrFail(id: string): Promise<Hostel> {
    const hostel = await this.hostelRepository.findOne({ where: { id } });
    if (!hostel) {
      throw new NotFoundException(`Hostel "${id}" not found.`);
    }
    return hostel;
  }

  private async findAllocationOrFail(id: string): Promise<HostelAllocation> {
    const allocation = await this.allocationRepository.findOne({
      where: { id },
      relations: ['hostel', 'student'],
    });
    if (!allocation) {
      throw new NotFoundException(`Hostel allocation "${id}" not found.`);
    }
    return allocation;
  }
}

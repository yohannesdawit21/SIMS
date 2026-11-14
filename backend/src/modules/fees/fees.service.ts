import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

import { FeeRecord } from '../../entities/fee-record.entity';
import { FeeCategory } from '../../entities/fee-category.entity';
import { Payment } from '../../entities/payment.entity';
import { GuardianStudentLink } from '../../entities/guardian-student-link.entity';
import { StudentProfile, StudentStatus } from '../../entities/student-profile.entity';
import { BatchTermFeeDto } from './dto/batch-term-fee.dto';
import { AuditService } from '../audit/audit.service';
import { AuditOperation } from '../../entities/audit-log.entity';
import { NotificationService } from '../notifications/notification.service';
import { BalanceCalculatorService } from './balance-calculator.service';
import { CreateFeeRecordDto } from './dto/create-fee-record.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { ApplyWaiverDto } from './dto/apply-waiver.dto';

/**
 * FeesService — fee records, payments, waivers, and scheduled reminders.
 *
 * Requirements: 7.1–7.10
 */
@Injectable()
export class FeesService {
  private readonly logger = new Logger(FeesService.name);

  constructor(
    @InjectRepository(FeeRecord)
    private readonly feeRecordRepository: Repository<FeeRecord>,

    @InjectRepository(FeeCategory)
    private readonly feeCategoryRepository: Repository<FeeCategory>,

    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,

    @InjectRepository(GuardianStudentLink)
    private readonly guardianLinkRepository: Repository<GuardianStudentLink>,

    @InjectRepository(StudentProfile)
    private readonly studentProfileRepository: Repository<StudentProfile>,

    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
    private readonly balanceCalculator: BalanceCalculatorService,

    @InjectQueue('fees:reminders')
    private readonly remindersQueue: Queue,
  ) {}

  // ---------------------------------------------------------------------------
  // Fee record CRUD
  // ---------------------------------------------------------------------------

  /**
   * Create a new fee record for a student.
   * Admin Staff only (enforced by controller).
   * Requirements: 7.1
   */
  async createFeeRecord(
    dto: CreateFeeRecordDto,
    actorId: string,
  ): Promise<FeeRecord> {
    const record = this.feeRecordRepository.create({
      student_id: dto.student_id,
      category_id: dto.category_id,
      academic_period_id: dto.academic_period_id,
      amount_due: dto.amount_due,
      amount_paid: 0,
      waiver_amount: 0,
      due_date: dto.due_date as unknown as Date,
    });

    const saved = await this.feeRecordRepository.save(record);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'fee_records',
      recordId: saved.id,
      newValues: {
        student_id: saved.student_id,
        category_id: saved.category_id,
        amount_due: saved.amount_due,
        due_date: saved.due_date,
      },
    });

    // Schedule reminder jobs for this fee record
    await this.scheduleReminders(saved);

    this.logger.log(`Fee record created: ${saved.id} for student ${dto.student_id}`);
    return saved;
  }

  /**
   * Create a fee record directly from internal services (e.g. hostel allocation).
   * Same as createFeeRecord but accepts raw fields directly.
   */
  async createFeeRecordInternal(params: {
    studentId: string;
    categoryName: string;
    academicPeriodId: string;
    amountDue: number;
    dueDate: Date;
    actorId: string;
  }): Promise<FeeRecord> {
    // Find or create fee category
    let category = await this.feeCategoryRepository.findOne({
      where: { name: params.categoryName },
    });
    if (!category) {
      category = this.feeCategoryRepository.create({ name: params.categoryName });
      category = await this.feeCategoryRepository.save(category);
    }

    return this.createFeeRecord(
      {
        student_id: params.studentId,
        category_id: category.id,
        academic_period_id: params.academicPeriodId,
        amount_due: params.amountDue,
        due_date: params.dueDate.toISOString().split('T')[0],
      },
      params.actorId,
    );
  }

  async findAll(studentId?: string, periodId?: string): Promise<FeeRecord[]> {
    const where: Record<string, string> = {};
    if (studentId) {
      where['student_id'] = await this.resolveStudentProfileId(studentId);
    }
    if (periodId) where['academic_period_id'] = periodId;
    return this.feeRecordRepository.find({
      where,
      relations: ['category', 'academicPeriod'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<FeeRecord> {
    const record = await this.feeRecordRepository.findOne({
      where: { id },
      relations: ['category', 'academicPeriod', 'student'],
    });
    if (!record) {
      throw new NotFoundException(`Fee record "${id}" not found.`);
    }
    return record;
  }

  // ---------------------------------------------------------------------------
  // Payments
  // ---------------------------------------------------------------------------

  /**
   * Record a payment against a fee record.
   * Updates amount_paid, generates a receipt URL placeholder.
   * Requirements: 7.2, 7.3
   */
  async recordPayment(
    feeRecordId: string,
    dto: RecordPaymentDto,
    actorId: string,
  ): Promise<Payment> {
    const feeRecord = await this.findOne(feeRecordId);

    const outstanding =
      Number(feeRecord.amount_due) -
      Number(feeRecord.waiver_amount) -
      Number(feeRecord.amount_paid);

    if (dto.amount > outstanding) {
      throw new BadRequestException(
        `Payment amount ${dto.amount} exceeds outstanding balance ${outstanding}.`,
      );
    }

    // Create payment row
    const payment = this.paymentRepository.create({
      fee_record_id: feeRecordId,
      amount: dto.amount,
      recorded_by: actorId,
      receipt_url: null, // PDF receipt generation is handled by ReportsService
    });
    const savedPayment = await this.paymentRepository.save(payment);

    // Update amount_paid on fee record
    await this.feeRecordRepository.increment(
      { id: feeRecordId },
      'amount_paid',
      dto.amount,
    );

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'payments',
      recordId: savedPayment.id,
      newValues: {
        fee_record_id: feeRecordId,
        amount: dto.amount,
        recorded_by: actorId,
      },
    });

    this.logger.log(
      `Payment ${savedPayment.id} of ${dto.amount} recorded for fee record ${feeRecordId}`,
    );
    return savedPayment;
  }

  async getPayments(feeRecordId: string): Promise<Payment[]> {
    return this.paymentRepository.find({
      where: { fee_record_id: feeRecordId },
      order: { payment_date: 'DESC' },
    });
  }

  // ---------------------------------------------------------------------------
  // Waivers
  // ---------------------------------------------------------------------------

  /**
   * Apply a fee waiver with mandatory justification note.
   * Requirements: 7.7
   */
  async applyWaiver(
    feeRecordId: string,
    dto: ApplyWaiverDto,
    actorId: string,
  ): Promise<FeeRecord> {
    const feeRecord = await this.findOne(feeRecordId);

    if (dto.amount > Number(feeRecord.amount_due)) {
      throw new BadRequestException(
        `Waiver amount ${dto.amount} cannot exceed amount due ${feeRecord.amount_due}.`,
      );
    }

    const previousValues = {
      waiver_amount: feeRecord.waiver_amount,
      waiver_reason: feeRecord.waiver_reason,
    };

    feeRecord.waiver_amount = dto.amount;
    feeRecord.waiver_reason = dto.reason;
    const saved = await this.feeRecordRepository.save(feeRecord);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'fee_records',
      recordId: feeRecordId,
      previousValues,
      newValues: { waiver_amount: dto.amount, waiver_reason: dto.reason },
    });

    this.logger.log(`Waiver applied to fee record ${feeRecordId}: ${dto.amount}`);
    return saved;
  }

  private async resolveStudentProfileId(idOrUserId: string): Promise<string> {
    const profile = await this.studentProfileRepository.findOne({
      where: [{ id: idOrUserId }, { user_id: idOrUserId }],
    });
    return profile ? profile.id : idOrUserId;
  }

  // ---------------------------------------------------------------------------
  // Balance summary
  // ---------------------------------------------------------------------------

  async getBalance(studentId: string): Promise<{
    total_due: number;
    total_waivers: number;
    total_paid: number;
    outstanding: number;
    records: FeeRecord[];
  }> {
    const effectiveStudentId = await this.resolveStudentProfileId(studentId);
    const records = await this.feeRecordRepository.find({
      where: { student_id: effectiveStudentId },
      relations: ['category'],
      order: { created_at: 'DESC' },
    });

    const fees = records.map((r) => ({
      amountDue: Number(r.amount_due),
      waiver: Number(r.waiver_amount),
    }));
    const payments = records.map((r) => Number(r.amount_paid));
    const outstanding = this.balanceCalculator.computeOutstandingBalance(
      fees,
      payments,
    );

    const total_due = fees.reduce(
      (s, f) => s + Math.max(0, f.amountDue - f.waiver),
      0,
    );
    const total_paid = payments.reduce((s, p) => s + p, 0);

    return {
      total_due,
      total_waivers: fees.reduce((s, f) => s + f.waiver, 0),
      total_paid,
      outstanding,
      records,
    };
  }

  // ---------------------------------------------------------------------------
  // Fee categories
  // ---------------------------------------------------------------------------

  findAllCategories(): Promise<FeeCategory[]> {
    return this.feeCategoryRepository.find();
  }

  async createCategory(
    name: string,
    description: string | null,
    actorId: string,
  ): Promise<FeeCategory> {
    const category = this.feeCategoryRepository.create({ name, description });
    const saved = await this.feeCategoryRepository.save(category);
    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'fee_categories',
      recordId: saved.id,
      newValues: { name, description },
    });
    return saved;
  }

  // ---------------------------------------------------------------------------
  // Scheduled reminder logic (triggered by BullMQ jobs)
  // ---------------------------------------------------------------------------

  /**
   * Check for fee records due in 7 days and enqueue reminder notifications.
   * Called by the BullMQ processor when the daily job fires.
   * Requirements: 7.4
   */
  async processDueReminders(): Promise<void> {
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const dateStr = sevenDaysFromNow.toISOString().split('T')[0];

    const records = await this.feeRecordRepository
      .createQueryBuilder('fr')
      .where('fr.due_date::date = :date', { date: dateStr })
      .andWhere(
        'fr.amount_due - fr.waiver_amount - fr.amount_paid > 0',
      )
      .getMany();

    for (const record of records) {
      await this.sendFeeNotification(record, 'fee_due_reminder');
    }

    this.logger.log(`Due-date reminders processed: ${records.length} records`);
  }

  /**
   * Check for overdue fee records and enqueue overdue notifications.
   * Requirements: 7.5
   */
  async processOverdueNotifications(): Promise<void> {
    const today = new Date();

    const records = await this.feeRecordRepository
      .createQueryBuilder('fr')
      .where('fr.due_date < :today', { today })
      .andWhere(
        'fr.amount_due - fr.waiver_amount - fr.amount_paid > 0',
      )
      .getMany();

    for (const record of records) {
      await this.sendFeeNotification(record, 'fee_overdue');
    }

    this.logger.log(`Overdue notifications processed: ${records.length} records`);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async scheduleReminders(feeRecord: FeeRecord): Promise<void> {
    // Schedule two delayed jobs — one for 7-day reminder, one for overdue
    const now = Date.now();
    const dueTs = new Date(feeRecord.due_date).getTime();

    const reminderDelay = dueTs - 7 * 24 * 60 * 60 * 1000 - now;
    const overdueDelay = dueTs - now + 60 * 60 * 1000; // 1h after due date

    if (reminderDelay > 0) {
      await this.remindersQueue.add(
        'due_reminder',
        { feeRecordId: feeRecord.id },
        { delay: reminderDelay, removeOnComplete: true },
      );
    }
    if (overdueDelay > 0) {
      await this.remindersQueue.add(
        'overdue',
        { feeRecordId: feeRecord.id },
        { delay: overdueDelay, removeOnComplete: true },
      );
    }
  }

  private async sendFeeNotification(
    record: FeeRecord,
    triggerEvent: string,
  ): Promise<void> {
    const outstanding =
      Number(record.amount_due) -
      Number(record.waiver_amount) -
      Number(record.amount_paid);

    const payload = {
      fee_record_id: record.id,
      outstanding,
      due_date: record.due_date,
    };

    // Notify student
    await this.notificationService.enqueue(
      record.student_id,
      triggerEvent,
      'email',
      triggerEvent,
      payload,
    );
    await this.notificationService.enqueue(
      record.student_id,
      triggerEvent,
      'sms',
      triggerEvent,
      payload,
    );

    // Notify linked guardians
    const links = await this.guardianLinkRepository.find({
      where: { student_id: record.student_id },
      relations: ['guardian', 'guardian.user'],
    });

    for (const link of links) {
      await this.notificationService.enqueue(
        link.guardian.user_id,
        triggerEvent,
        'email',
        triggerEvent,
        payload,
      );
      await this.notificationService.enqueue(
        link.guardian.user_id,
        triggerEvent,
        'sms',
        triggerEvent,
        payload,
      );
    }
  }

  /**
   * Batch generation of tuition/term fee invoices for cohorts.
   */
  async generateBatchTermFees(
    dto: BatchTermFeeDto,
    actorId: string,
  ): Promise<{ generated: number; studentCount: number }> {
    const qb = this.studentProfileRepository
      .createQueryBuilder('s')
      .where('s.status = :status', { status: StudentStatus.ACTIVE });

    if (dto.programme_id) {
      qb.andWhere('s.programme_id = :progId', { progId: dto.programme_id });
    }

    const students = await qb.getMany();
    const createdRecords: FeeRecord[] = [];

    for (const student of students) {
      const existing = await this.feeRecordRepository.findOne({
        where: {
          student_id: student.id,
          academic_period_id: dto.academic_period_id,
          category_id: dto.category_id,
        },
      });

      if (!existing) {
        const record = this.feeRecordRepository.create({
          student_id: student.id,
          category_id: dto.category_id,
          academic_period_id: dto.academic_period_id,
          amount_due: dto.amount,
          amount_paid: 0,
          waiver_amount: 0,
          waiver_reason: null,
          due_date: new Date(dto.due_date),
        });
        createdRecords.push(record);
      }
    }

    if (createdRecords.length > 0) {
      await this.feeRecordRepository.save(createdRecords);
      await this.auditService.log({
        actorId,
        operation: AuditOperation.CREATE,
        recordType: 'fee_records_batch',
        recordId: dto.academic_period_id,
        newValues: {
          category_id: dto.category_id,
          amount: dto.amount,
          generatedCount: createdRecords.length,
        },
      });
    }

    return { generated: createdRecords.length, studentCount: students.length };
  }

  /**
   * Check whether a student has cleared all outstanding fees for graduation (soft clearance).
   */
  async checkGraduationClearance(studentId: string): Promise<{
    cleared: boolean;
    totalDue: number;
    totalPaid: number;
    outstandingBalance: number;
  }> {
    const effectiveStudentId = await this.resolveStudentProfileId(studentId);
    const records = await this.feeRecordRepository.find({
      where: { student_id: effectiveStudentId },
    });

    let totalDue = 0;
    let totalPaid = 0;
    let totalWaiver = 0;

    for (const r of records) {
      totalDue += Number(r.amount_due);
      totalPaid += Number(r.amount_paid);
      totalWaiver += Number(r.waiver_amount || 0);
    }

    const outstandingBalance = Math.max(0, totalDue - totalPaid - totalWaiver);
    return {
      cleared: outstandingBalance === 0,
      totalDue,
      totalPaid,
      outstandingBalance,
    };
  }

}

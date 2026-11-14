import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { StudentProfile } from '../../entities/student-profile.entity';
import { Enrollment } from '../../entities/enrollment.entity';
import { FinalGrade } from '../../entities/final-grade.entity';
import { AttendanceRecord } from '../../entities/attendance-record.entity';
import { FeeRecord } from '../../entities/fee-record.entity';
import { Payment } from '../../entities/payment.entity';
import { LibraryLoan } from '../../entities/library-loan.entity';
import { HostelAllocation } from '../../entities/hostel-allocation.entity';
import { Alumni } from '../../entities/alumni.entity';
import { CareerPlacement } from '../../entities/career-placement.entity';

export interface ReportFilters {
  departmentId?: string;
  periodId?: string;
  studentId?: string;
  graduationYear?: number;
  programmeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * ReportsService — query builders for all 8 standard SIMS reports.
 *
 * Each report accepts scope filters and returns raw data arrays.
 * PdfGeneratorService and CsvGeneratorService handle serialisation.
 *
 * Requirements: 14.1, 14.2, 14.5
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(StudentProfile)
    private readonly studentProfileRepo: Repository<StudentProfile>,

    @InjectRepository(Enrollment)
    private readonly enrollmentRepo: Repository<Enrollment>,

    @InjectRepository(FinalGrade)
    private readonly finalGradeRepo: Repository<FinalGrade>,

    @InjectRepository(AttendanceRecord)
    private readonly attendanceRepo: Repository<AttendanceRecord>,

    @InjectRepository(FeeRecord)
    private readonly feeRecordRepo: Repository<FeeRecord>,

    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,

    @InjectRepository(LibraryLoan)
    private readonly loanRepo: Repository<LibraryLoan>,

    @InjectRepository(HostelAllocation)
    private readonly allocationRepo: Repository<HostelAllocation>,

    @InjectRepository(Alumni)
    private readonly alumniRepo: Repository<Alumni>,

    @InjectRepository(CareerPlacement)
    private readonly placementRepo: Repository<CareerPlacement>,
  ) {}

  // ---------------------------------------------------------------------------
  // 1. Enrollment Report
  // ---------------------------------------------------------------------------
  async enrollmentReport(filters: ReportFilters): Promise<unknown[]> {
    const qb = this.enrollmentRepo
      .createQueryBuilder('en')
      .leftJoinAndSelect('en.student', 'sp')
      .leftJoinAndSelect('en.course', 'course')
      .leftJoinAndSelect('course.department', 'dept')
      .leftJoinAndSelect('en.academicPeriod', 'period');

    if (filters.periodId) {
      qb.andWhere('en.academic_period_id = :periodId', { periodId: filters.periodId });
    }
    if (filters.studentId) {
      qb.andWhere('en.student_id = :studentId', { studentId: filters.studentId });
    }
    if (filters.departmentId) {
      qb.andWhere('course.department_id = :departmentId', { departmentId: filters.departmentId });
    }

    return qb.orderBy('sp.full_legal_name', 'ASC').getMany();
  }

  // ---------------------------------------------------------------------------
  // 2. Grade Report
  // ---------------------------------------------------------------------------
  async gradeReport(filters: ReportFilters): Promise<unknown[]> {
    const qb = this.finalGradeRepo
      .createQueryBuilder('fg')
      .leftJoinAndSelect('fg.student', 'sp')
      .leftJoinAndSelect('fg.course', 'course')
      .leftJoinAndSelect('course.department', 'dept')
      .leftJoinAndSelect('fg.academicPeriod', 'period')
      .where('fg.is_published = true');

    if (filters.periodId) {
      qb.andWhere('fg.academic_period_id = :periodId', { periodId: filters.periodId });
    }
    if (filters.studentId) {
      qb.andWhere('fg.student_id = :studentId', { studentId: filters.studentId });
    }
    if (filters.departmentId) {
      qb.andWhere('course.department_id = :departmentId', { departmentId: filters.departmentId });
    }

    return qb.orderBy('sp.full_legal_name', 'ASC').getMany();
  }

  // ---------------------------------------------------------------------------
  // 3. Attendance Report
  // ---------------------------------------------------------------------------
  async attendanceReport(filters: ReportFilters): Promise<unknown[]> {
    const qb = this.attendanceRepo
      .createQueryBuilder('ar')
      .leftJoinAndSelect('ar.student', 'sp')
      .leftJoinAndSelect('ar.session', 'session')
      .leftJoinAndSelect('session.course', 'course')
      .leftJoinAndSelect('course.department', 'dept');

    if (filters.departmentId) {
      qb.andWhere('course.department_id = :departmentId', { departmentId: filters.departmentId });
    }
    if (filters.studentId) {
      qb.andWhere('ar.student_id = :studentId', { studentId: filters.studentId });
    }
    if (filters.dateFrom) {
      qb.andWhere('session.session_date >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      qb.andWhere('session.session_date <= :dateTo', { dateTo: filters.dateTo });
    }

    return qb.orderBy('session.session_date', 'DESC').getMany();
  }

  // ---------------------------------------------------------------------------
  // 4. Fee Statement
  // ---------------------------------------------------------------------------
  async feeStatementReport(filters: ReportFilters): Promise<unknown[]> {
    const qb = this.feeRecordRepo
      .createQueryBuilder('fr')
      .leftJoinAndSelect('fr.student', 'sp')
      .leftJoinAndSelect('sp.programme', 'prog')
      .leftJoinAndSelect('prog.department', 'dept')
      .leftJoinAndSelect('fr.category', 'cat')
      .leftJoinAndSelect('fr.academicPeriod', 'period');

    if (filters.studentId) {
      qb.andWhere('fr.student_id = :studentId', { studentId: filters.studentId });
    }
    if (filters.periodId) {
      qb.andWhere('fr.academic_period_id = :periodId', { periodId: filters.periodId });
    }
    if (filters.departmentId) {
      qb.andWhere('dept.id = :departmentId', { departmentId: filters.departmentId });
    }

    return qb.orderBy('fr.due_date', 'ASC').getMany();
  }

  // ---------------------------------------------------------------------------
  // 5. Library Loan Report
  // ---------------------------------------------------------------------------
  async libraryLoanReport(filters: ReportFilters): Promise<unknown[]> {
    const qb = this.loanRepo
      .createQueryBuilder('ll')
      .leftJoinAndSelect('ll.student', 'sp')
      .leftJoinAndSelect('ll.resource', 'res');

    if (filters.studentId) {
      qb.andWhere('ll.student_id = :studentId', { studentId: filters.studentId });
    }
    if (filters.dateFrom) {
      qb.andWhere('ll.loan_date >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      qb.andWhere('ll.loan_date <= :dateTo', { dateTo: filters.dateTo });
    }

    return qb.orderBy('ll.loan_date', 'DESC').getMany();
  }

  // ---------------------------------------------------------------------------
  // 6. Hostel Occupancy Report
  // ---------------------------------------------------------------------------
  async hostelOccupancyReport(filters: ReportFilters): Promise<unknown[]> {
    const qb = this.allocationRepo
      .createQueryBuilder('ha')
      .leftJoinAndSelect('ha.student', 'sp')
      .leftJoinAndSelect('ha.hostel', 'hostel')
      .where('ha.departure_date IS NULL');

    if (filters.dateFrom) {
      qb.andWhere('ha.start_date <= :date', { date: filters.dateFrom });
      qb.andWhere('ha.end_date >= :date', { date: filters.dateFrom });
    }

    return qb.orderBy('hostel.block_name', 'ASC').getMany();
  }

  // ---------------------------------------------------------------------------
  // 7. Alumni Report
  // ---------------------------------------------------------------------------
  async alumniReport(filters: ReportFilters): Promise<unknown[]> {
    const qb = this.alumniRepo
      .createQueryBuilder('al')
      .leftJoinAndSelect('al.student', 'sp')
      .leftJoinAndSelect('sp.programme', 'prog')
      .leftJoinAndSelect('prog.department', 'dept');

    if (filters.graduationYear) {
      qb.andWhere("EXTRACT(YEAR FROM al.graduation_date) = :year", {
        year: filters.graduationYear,
      });
    }
    if (filters.programmeId) {
      qb.andWhere('sp.programme_id = :programmeId', { programmeId: filters.programmeId });
    }
    if (filters.departmentId) {
      qb.andWhere('dept.id = :departmentId', { departmentId: filters.departmentId });
    }

    return qb.orderBy('al.graduation_date', 'DESC').getMany();
  }

  // ---------------------------------------------------------------------------
  // 8. Placement Report
  // ---------------------------------------------------------------------------
  async placementReport(filters: ReportFilters): Promise<unknown[]> {
    const qb = this.placementRepo
      .createQueryBuilder('cp')
      .leftJoinAndSelect('cp.alumni', 'al')
      .leftJoinAndSelect('al.student', 'sp')
      .leftJoinAndSelect('sp.programme', 'prog')
      .leftJoinAndSelect('prog.department', 'dept');

    if (filters.departmentId) {
      qb.andWhere('dept.id = :departmentId', { departmentId: filters.departmentId });
    }
    if (filters.dateFrom) {
      qb.andWhere('cp.start_date >= :dateFrom', { dateFrom: filters.dateFrom });
    }
    if (filters.dateTo) {
      qb.andWhere('cp.start_date <= :dateTo', { dateTo: filters.dateTo });
    }

    return qb.orderBy('cp.start_date', 'DESC').getMany();
  }
}

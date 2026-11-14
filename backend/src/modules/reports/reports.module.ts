import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

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

import { ReportsService } from './reports.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { CsvGeneratorService } from './csv-generator.service';
import { ReportsController } from './reports.controller';

/**
 * ReportsModule — all 8 standard reports with PDF and CSV export.
 *
 * Requirements: 14.1–14.5
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentProfile,
      Enrollment,
      FinalGrade,
      AttendanceRecord,
      FeeRecord,
      Payment,
      LibraryLoan,
      HostelAllocation,
      Alumni,
      CareerPlacement,
    ]),
  ],
  providers: [ReportsService, PdfGeneratorService, CsvGeneratorService],
  controllers: [ReportsController],
  exports: [PdfGeneratorService, CsvGeneratorService],
})
export class ReportsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';

import { FeeRecord } from '../../entities/fee-record.entity';
import { FeeCategory } from '../../entities/fee-category.entity';
import { Payment } from '../../entities/payment.entity';
import { GuardianStudentLink } from '../../entities/guardian-student-link.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';
import { BalanceCalculatorService } from './balance-calculator.service';
import { FeesService } from './fees.service';
import { FeesController } from './fees.controller';
import { FeesProcessor } from './fees.processor';

/**
 * FeesModule — fee record management, payments, waivers, and reminders.
 *
 * Requirements: 7.1–7.10
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([FeeRecord, FeeCategory, Payment, GuardianStudentLink, StudentProfile]),
    BullModule.registerQueue({ name: 'fees:reminders' }),
    AuditModule,
    NotificationModule,
  ],
  providers: [BalanceCalculatorService, FeesService, FeesProcessor],
  controllers: [FeesController],
  exports: [FeesService, BalanceCalculatorService],
})
export class FeesModule {}

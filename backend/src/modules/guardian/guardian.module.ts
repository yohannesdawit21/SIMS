import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ParentGuardian } from '../../entities/parent-guardian.entity';
import { GuardianStudentLink } from '../../entities/guardian-student-link.entity';
import { User } from '../../entities/user.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { FeeRecord } from '../../entities/fee-record.entity';
import { AuditModule } from '../audit/audit.module';
import { GuardianService } from './guardian.service';
import { GuardianController } from './guardian.controller';

/**
 * GuardianModule — Parent/Guardian accounts, student links, consent audit trail,
 * and the guardian read-only portal.
 *
 * Requirements: 12.1–12.5
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ParentGuardian,
      GuardianStudentLink,
      User,
      StudentProfile,
      FeeRecord,
    ]),
    AuditModule,
  ],
  providers: [GuardianService],
  controllers: [GuardianController],
  exports: [GuardianService],
})
export class GuardianModule {}

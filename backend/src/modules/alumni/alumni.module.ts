import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Alumni } from '../../entities/alumni.entity';
import { CareerPlacement } from '../../entities/career-placement.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { AuditModule } from '../audit/audit.module';
import { AlumniService } from './alumni.service';
import { AlumniController } from './alumni.controller';

/**
 * AlumniModule — alumni records, contact self-service, and career placements.
 *
 * Requirements: 10.1–10.6
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Alumni, CareerPlacement, StudentProfile]),
    AuditModule,
  ],
  providers: [AlumniService],
  controllers: [AlumniController],
  exports: [AlumniService],
})
export class AlumniModule {}

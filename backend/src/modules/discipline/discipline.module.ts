import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DisciplineRecord } from '../../entities/discipline-record.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { AuditModule } from '../audit/audit.module';
import { DisciplineService } from './discipline.service';
import { DisciplineController } from './discipline.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DisciplineRecord, StudentProfile]),
    AuditModule,
  ],
  controllers: [DisciplineController],
  providers: [DisciplineService],
  exports: [DisciplineService],
})
export class DisciplineModule {}

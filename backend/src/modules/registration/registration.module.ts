import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';
import { SemesterRegistration } from '../../entities/semester-registration.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { AcademicPeriod } from '../../entities/academic-period.entity';
import { DisciplineRecord } from '../../entities/discipline-record.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SemesterRegistration,
      StudentProfile,
      AcademicPeriod,
      DisciplineRecord,
    ]),
    AuditModule,
  ],
  controllers: [RegistrationController],
  providers: [RegistrationService],
  exports: [RegistrationService],
})
export class RegistrationModule {}

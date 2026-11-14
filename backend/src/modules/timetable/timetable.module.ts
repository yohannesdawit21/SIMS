import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TimetableEntry } from '../../entities/timetable-entry.entity';
import { Enrollment } from '../../entities/enrollment.entity';
import { Course } from '../../entities/course.entity';
import { Department } from '../../entities/department.entity';
import { User } from '../../entities/user.entity';
import { AcademicPeriod } from '../../entities/academic-period.entity';
import { CourseLecturer } from '../../entities/course-lecturer.entity';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';
import { ConflictDetectorService } from './conflict-detector.service';
import { TimetableService } from './timetable.service';
import { TimetableController } from './timetable.controller';

/**
 * TimetableModule — provides timetable entry management and conflict detection.
 *
 * Requirements: 6.1–6.9
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TimetableEntry, Enrollment, Course, Department, User, AcademicPeriod, CourseLecturer]),
    AuditModule,
    NotificationModule,
  ],
  providers: [ConflictDetectorService, TimetableService],
  controllers: [TimetableController],
  exports: [ConflictDetectorService, TimetableService],
})
export class TimetableModule {}

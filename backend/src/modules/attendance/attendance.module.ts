import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AttendanceRecord } from '../../entities/attendance-record.entity';
import { TimetableSession } from '../../entities/timetable-session.entity';
import { CourseLecturer } from '../../entities/course-lecturer.entity';
import { GuardianStudentLink } from '../../entities/guardian-student-link.entity';
import { ParentGuardian } from '../../entities/parent-guardian.entity';
import { StudentProfile } from '../../entities/student-profile.entity';

import { AttendanceService } from './attendance.service';
import { AttendanceCalculatorService } from './attendance-calculator.service';
import { AttendanceController } from './attendance.controller';

import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';
import { RedisModule } from '../../common/modules/redis.module';

/**
 * AttendanceModule — provides attendance recording, amendment, threshold
 * configuration, and the HTTP controller surface.
 *
 * Entities:
 *  - AttendanceRecord    — the core attendance_records table
 *  - TimetableSession    — needed to look up course_id / lecturer_id
 *  - CourseLecturer      — authorisation check: lecturer ↔ course assignment
 *  - GuardianStudentLink — find guardians for low-attendance notifications
 *  - ParentGuardian      — resolve guardian user_id for notification dispatch
 *  - StudentProfile      — resolve student user_id for notification dispatch
 *
 * Imports:
 *  - AuditModule         — write immutable audit log entries
 *  - NotificationModule  — enqueue email/SMS notifications
 *  - RedisModule         — REDIS_CLIENT token for threshold caching
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.7, 5.8
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceRecord,
      TimetableSession,
      CourseLecturer,
      GuardianStudentLink,
      ParentGuardian,
      StudentProfile,
    ]),
    AuditModule,
    NotificationModule,
    RedisModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceCalculatorService],
  exports: [AttendanceService, AttendanceCalculatorService],
})
export class AttendanceModule {}

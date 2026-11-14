import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Grade } from '../../entities/grade.entity';
import { FinalGrade } from '../../entities/final-grade.entity';
import { Enrollment } from '../../entities/enrollment.entity';
import { Course } from '../../entities/course.entity';
import { AssessmentComponent } from '../../entities/assessment-component.entity';
import { AcademicPeriod } from '../../entities/academic-period.entity';
import { CourseLecturer } from '../../entities/course-lecturer.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { Department } from '../../entities/department.entity';
import { GuardianStudentLink } from '../../entities/guardian-student-link.entity';

import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';

import { GradesController } from './grades.controller';
import { GradesService } from './grades.service';
import { GpaCalculatorService } from './gpa-calculator.service';

/**
 * GradesModule — provides grade management, GPA calculation, and publishing.
 *
 * Provides:
 *  - GradesService (enterGrade, publishGrades, lockPeriod, getTranscript, getGpa, findAll)
 *  - GpaCalculatorService (computeFinalGrade, computeGpa, scoreToLetterGrade, scoreToGradePoints)
 *
 * Imports:
 *  - TypeOrmModule for Grade, FinalGrade, AcademicPeriod, AssessmentComponent,
 *    Enrollment, Course, CourseLecturer, StudentProfile, Department
 *  - AuditModule so services can write audit log entries
 *  - NotificationModule for grade_published notifications
 *
 * Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 4.8, 4.9, 4.10
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Grade,
      FinalGrade,
      AcademicPeriod,
      AssessmentComponent,
      Enrollment,
      Course,
      CourseLecturer,
      StudentProfile,
      Department,
      GuardianStudentLink,
    ]),
    AuditModule,
    NotificationModule,
  ],
  controllers: [GradesController],
  providers: [GradesService, GpaCalculatorService],
  exports: [GradesService],
})
export class GradesModule {}

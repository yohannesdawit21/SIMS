import { Module, forwardRef } from '@nestjs/common';
import { AlumniModule } from '../alumni/alumni.module';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../../entities/user.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { Course } from '../../entities/course.entity';
import { Enrollment } from '../../entities/enrollment.entity';
import { AcademicPeriod } from '../../entities/academic-period.entity';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { EnrollmentService } from './enrollment.service';
import { EnrollmentController } from './enrollment.controller';
import { AuditModule } from '../audit/audit.module';
import { RedisModule } from '../../common/modules/redis.module';
import { MinioModule } from '../../common/modules/minio.module';

/**
 * StudentsModule — manages student profile lifecycle and course enrollment.
 *
 * Provides:
 *  - StudentsService (create, findAll, findOne, update, deactivate, uploadPhoto)
 *  - EnrollmentService (enroll, remove, findAll)
 *  - StudentsController (GET, POST, PATCH /students)
 *  - EnrollmentController (GET, POST, DELETE /enrollments)
 *
 * Imports:
 *  - TypeOrmModule for User, StudentProfile, Course, Enrollment, AcademicPeriod
 *  - AuditModule so services can write audit log entries
 *  - RedisModule for any session-related operations
 *  - MinioModule for photo upload capabilities (MinioModule is @Global, but
 *    listed here explicitly for clarity)
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.8, 3.9, 3.10
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, StudentProfile, Course, Enrollment, AcademicPeriod]),
    AuditModule,
    RedisModule,
    MinioModule,
    forwardRef(() => AlumniModule),
  ],
  controllers: [StudentsController, EnrollmentController],
  providers: [StudentsService, EnrollmentService],
  exports: [StudentsService, EnrollmentService],
})
export class StudentsModule {}

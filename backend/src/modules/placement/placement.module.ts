import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JobListing } from '../../entities/job-listing.entity';
import { JobListingProgramme } from '../../entities/job-listing-programme.entity';
import { JobApplication } from '../../entities/job-application.entity';
import { Enrollment } from '../../entities/enrollment.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';
import { PlacementService } from './placement.service';
import { PlacementController } from './placement.controller';

/**
 * PlacementModule — job/internship listings, student applications, and
 * programme-scoped new-listing notifications.
 *
 * Requirements: 11.1–11.6
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      JobListing,
      JobListingProgramme,
      JobApplication,
      Enrollment,
      StudentProfile,
    ]),
    AuditModule,
    NotificationModule,
  ],
  providers: [PlacementService],
  controllers: [PlacementController],
  exports: [PlacementService],
})
export class PlacementModule {}

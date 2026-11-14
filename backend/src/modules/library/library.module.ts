import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';

import { LibraryResource } from '../../entities/library-resource.entity';
import { LibraryLoan } from '../../entities/library-loan.entity';
import { AuditModule } from '../audit/audit.module';
import { NotificationModule } from '../notifications/notification.module';
import { LibraryService } from './library.service';
import { LibraryController } from './library.controller';
import { LibraryProcessor } from './library.processor';

/**
 * LibraryModule — catalogue CRUD, loan lifecycle, and overdue notifications.
 *
 * Requirements: 8.1–8.9
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([LibraryResource, LibraryLoan]),
    BullModule.registerQueue({ name: 'library:jobs' }),
    AuditModule,
    NotificationModule,
  ],
  providers: [LibraryService, LibraryProcessor],
  controllers: [LibraryController],
  exports: [LibraryService],
})
export class LibraryModule {}

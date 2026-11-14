import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';

import { NotificationLog } from '../../entities/notification-log.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import {
  EmailNotificationProcessor,
  SmsNotificationProcessor,
} from './notification.processor';

/**
 * NotificationModule — async notification dispatch via BullMQ.
 *
 * Provides:
 *  - NotificationService (enqueue, enqueueBulk)
 *  - EmailNotificationProcessor (consumer for notification:email queue)
 *  - SmsNotificationProcessor (consumer for notification:sms queue)
 *  - NotificationController (Super Admin log management endpoints)
 *
 * Requirements: 13.1–13.7
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationLog]),
    BullModule.registerQueue(
      { name: 'notification:email' },
      { name: 'notification:sms' },
    ),
  ],
  providers: [
    NotificationService,
    EmailNotificationProcessor,
    SmsNotificationProcessor,
  ],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}

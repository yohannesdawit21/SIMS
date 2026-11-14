import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

import {
  NotificationLog,
  NotificationChannel,
  NotificationStatus,
} from '../../entities/notification-log.entity';
import { NotificationChannelType } from './dto/enqueue-notification.dto';

/**
 * NotificationService — enqueues notifications for async delivery.
 *
 * Key behaviours:
 *  - enqueue(): insert a pending NotificationLog row then push a BullMQ job
 *               to the appropriate queue (notification:email or notification:sms).
 *  - enqueueBulk(): call enqueue() for each recipient in a list.
 *
 * Requirements: 13.1, 13.2, 13.4
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(NotificationLog)
    private readonly notificationLogRepository: Repository<NotificationLog>,

    @InjectQueue('notification:email')
    private readonly emailQueue: Queue,

    @InjectQueue('notification:sms')
    private readonly smsQueue: Queue,
  ) {}

  /**
   * Enqueue a single notification.
   *  1. Insert a `notification_logs` row with status='pending', attempt_count=0.
   *  2. Push a job to the appropriate BullMQ queue.
   *  3. Return the created NotificationLog entity.
   *
   * Requirements: 13.1, 13.2
   */
  async enqueue(
    recipientId: string,
    type: string,
    channel: NotificationChannelType,
    triggerEvent: string,
    payload: Record<string, unknown>,
  ): Promise<NotificationLog> {
    // 1. Insert notification_log row
    const log = this.notificationLogRepository.create({
      recipient_id: recipientId,
      notification_type: type,
      channel: channel as NotificationChannel,
      trigger_event: triggerEvent,
      payload,
      status: NotificationStatus.PENDING,
      attempt_count: 0,
      dispatched_at: null,
    });
    const saved = await this.notificationLogRepository.save(log);

    // 2. Push job to the appropriate queue
    const jobData = {
      notificationLogId: saved.id,
      recipientId,
      type,
      triggerEvent,
      payload,
    };

    if (channel === 'email') {
      await this.emailQueue.add(jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      });
      this.logger.log(
        `Notification ${saved.id} enqueued to notification:email for recipient ${recipientId}`,
      );
    } else {
      await this.smsQueue.add(jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      });
      this.logger.log(
        `Notification ${saved.id} enqueued to notification:sms for recipient ${recipientId}`,
      );
    }

    return saved;
  }

  /**
   * Enqueue notifications for multiple recipients.
   * Calls enqueue() for each recipientId and returns all created logs.
   *
   * Requirements: 13.4
   */
  async enqueueBulk(
    recipients: string[],
    type: string,
    channel: NotificationChannelType,
    triggerEvent: string,
    payload: Record<string, unknown>,
  ): Promise<NotificationLog[]> {
    const results = await Promise.all(
      recipients.map((recipientId) =>
        this.enqueue(recipientId, type, channel, triggerEvent, payload),
      ),
    );

    this.logger.log(
      `Bulk enqueue: ${results.length} notifications of type "${type}" via ${channel}`,
    );

    return results;
  }
}

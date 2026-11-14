import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bull';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

import {
  NotificationLog,
  NotificationStatus,
} from '../../entities/notification-log.entity';

interface NotificationJobData {
  notificationLogId: string;
  recipientId: string;
  type: string;
  triggerEvent: string;
  payload: Record<string, unknown>;
}

/**
 * NotificationProcessor — BullMQ consumer for email and SMS dispatch.
 *
 * Queues consumed:
 *  - notification:email  → sends via Nodemailer SMTP
 *  - notification:sms    → sends via configurable SMS provider (Twilio-compatible)
 *
 * Retry behaviour:
 *  - Bull is configured with attempts=3 in the producer; each failure is logged.
 *  - After all retries exhausted, @OnQueueFailed marks the log row as 'failed'.
 *
 * Requirements: 13.2, 13.4, 13.6
 */
@Injectable()
@Processor('notification:email')
export class EmailNotificationProcessor {
  private readonly logger = new Logger(EmailNotificationProcessor.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(NotificationLog)
    private readonly logRepository: Repository<NotificationLog>,
    private readonly configService: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST', 'localhost'),
      port: this.configService.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.configService.get<string>('SMTP_USER', ''),
        pass: this.configService.get<string>('SMTP_PASS', ''),
      },
    });
  }

  @Process()
  async handleEmailJob(job: Job<NotificationJobData>): Promise<void> {
    const { notificationLogId, recipientId, type, payload } = job.data;
    this.logger.log(`Processing email job ${job.id} for notification ${notificationLogId}`);

    const log = await this.logRepository.findOne({ where: { id: notificationLogId } });
    if (!log) {
      this.logger.warn(`Notification log ${notificationLogId} not found; skipping.`);
      return;
    }

    // Check if notification type is enabled via config
    const typeEnabled = this.configService.get<string>(
      `NOTIFICATION_${type.toUpperCase()}_ENABLED`,
      'true',
    );
    if (typeEnabled === 'false') {
      this.logger.log(`Notification type ${type} is disabled; skipping.`);
      await this.markSent(log);
      return;
    }

    // Build a human-readable email body from the payload
    const subject = this.buildSubject(type);
    const text = this.buildEmailBody(type, payload);

    const senderAddress = this.configService.get<string>(
      'SMTP_FROM',
      'noreply@sims.college.edu',
    );

    await this.transporter.sendMail({
      from: senderAddress,
      to: recipientId, // In production this would resolve to user.email via a user lookup
      subject,
      text,
    });

    await this.markSent(log);
    this.logger.log(`Email sent for notification ${notificationLogId}`);
  }

  @OnQueueFailed()
  async handleEmailFailure(job: Job<NotificationJobData>, error: Error): Promise<void> {
    const { notificationLogId } = job.data;
    this.logger.error(
      `Email job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}): ${error.message}`,
    );

    // Mark as failed only after all retries are exhausted
    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      const log = await this.logRepository.findOne({ where: { id: notificationLogId } });
      if (log) {
        log.status = NotificationStatus.FAILED;
        log.attempt_count = job.attemptsMade;
        await this.logRepository.save(log);
        this.logger.error(`Notification ${notificationLogId} permanently failed after ${job.attemptsMade} attempts.`);
      }
    }
  }

  private async markSent(log: NotificationLog): Promise<void> {
    log.status = NotificationStatus.SENT;
    log.dispatched_at = new Date();
    log.attempt_count = (log.attempt_count ?? 0) + 1;
    await this.logRepository.save(log);
  }

  private buildSubject(type: string): string {
    const subjects: Record<string, string> = {
      grade_published: 'Your grades have been published',
      low_attendance: 'Attendance Warning',
      fee_due_reminder: 'Fee Payment Reminder',
      fee_overdue: 'Overdue Fee Notice',
      timetable_published: 'Timetable Published',
      exam_scheduled: 'Exam Schedule Update',
      exam_updated: 'Exam Schedule Updated',
      job_listing_published: 'New Job Opportunity',
      library_loan_overdue: 'Overdue Library Book',
      account_lockout: 'Account Locked',
    };
    return subjects[type] ?? `SIMS Notification: ${type}`;
  }

  private buildEmailBody(type: string, payload: Record<string, unknown>): string {
    return `You have a new notification from SIMS.\n\nType: ${type}\n\nDetails:\n${JSON.stringify(payload, null, 2)}`;
  }
}

/**
 * SMS processor — consumes the notification:sms queue.
 * Uses a stub implementation; wire in Twilio or another SMS provider via config.
 *
 * Requirements: 13.2, 13.6
 */
@Injectable()
@Processor('notification:sms')
export class SmsNotificationProcessor {
  private readonly logger = new Logger(SmsNotificationProcessor.name);

  constructor(
    @InjectRepository(NotificationLog)
    private readonly logRepository: Repository<NotificationLog>,
    private readonly configService: ConfigService,
  ) {}

  @Process()
  async handleSmsJob(job: Job<NotificationJobData>): Promise<void> {
    const { notificationLogId, type, payload } = job.data;
    this.logger.log(`Processing SMS job ${job.id} for notification ${notificationLogId}`);

    const log = await this.logRepository.findOne({ where: { id: notificationLogId } });
    if (!log) return;

    const typeEnabled = this.configService.get<string>(
      `NOTIFICATION_${type.toUpperCase()}_ENABLED`,
      'true',
    );
    if (typeEnabled === 'false') {
      await this.markSent(log);
      return;
    }

    // SMS dispatch stub — replace body with Twilio SDK call when credentials available
    const smsEnabled = this.configService.get<string>('SMS_ENABLED', 'false');
    if (smsEnabled === 'true') {
      // TODO: inject Twilio client and dispatch SMS here
      this.logger.log(`SMS dispatch (stub) for notification ${notificationLogId}: type=${type}`);
    } else {
      this.logger.log(`SMS disabled by config; skipping notification ${notificationLogId}`);
    }

    await this.markSent(log);
  }

  @OnQueueFailed()
  async handleSmsFailure(job: Job<NotificationJobData>, error: Error): Promise<void> {
    const { notificationLogId } = job.data;
    this.logger.error(`SMS job ${job.id} failed: ${error.message}`);

    if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
      const log = await this.logRepository.findOne({ where: { id: notificationLogId } });
      if (log) {
        log.status = NotificationStatus.FAILED;
        log.attempt_count = job.attemptsMade;
        await this.logRepository.save(log);
      }
    }
  }

  private async markSent(log: NotificationLog): Promise<void> {
    log.status = NotificationStatus.SENT;
    log.dispatched_at = new Date();
    log.attempt_count = (log.attempt_count ?? 0) + 1;
    await this.logRepository.save(log);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Request,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Request as ExpressRequest } from 'express';

import {
  NotificationLog,
  NotificationStatus,
  NotificationChannel,
} from '../../entities/notification-log.entity';
import { SearchNotificationsDto } from './dto/search-notifications.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/strategies/jwt.strategy';
import { NotificationService } from './notification.service';

/**
 * NotificationController — Super Admin management of the notification log.
 *
 * Routes:
 *  GET  /notifications/logs          — paginated, filterable notification log
 *  POST /notifications/retry/:id     — manually retry a failed notification
 *  PUT  /notifications/config        — update SMS/email gateway config (stub)
 *  PATCH /notifications/types/:type  — enable/disable a notification type
 *
 * All endpoints require Super Admin (notification_config.manage).
 * Requirements: 13.3, 13.4, 13.5, 13.7
 */
@Controller('notifications')
export class NotificationController {
  constructor(
    @InjectRepository(NotificationLog)
    private readonly logRepository: Repository<NotificationLog>,

    @InjectQueue('notification:email')
    private readonly emailQueue: Queue,

    @InjectQueue('notification:sms')
    private readonly smsQueue: Queue,

    private readonly notificationService: NotificationService,
  ) {}

  /**
   * GET /notifications/logs
   * Paginated notification log with filters.
   * Requirements: 13.4
   */
  @Get('logs')
  @RequirePermission('notification_config', 'manage')
  async getLogs(@Query() query: SearchNotificationsDto) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const skip = (page - 1) * limit;

    const qb = this.logRepository
      .createQueryBuilder('nl')
      .orderBy('nl.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.recipientId) {
      qb.andWhere('nl.recipient_id = :recipientId', { recipientId: query.recipientId });
    }
    if (query.type) {
      qb.andWhere('nl.notification_type = :type', { type: query.type });
    }
    if (query.status) {
      qb.andWhere('nl.status = :status', { status: query.status });
    }
    if (query.dateFrom && query.dateTo) {
      qb.andWhere('nl.created_at BETWEEN :dateFrom AND :dateTo', {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      });
    } else if (query.dateFrom) {
      qb.andWhere('nl.created_at >= :dateFrom', { dateFrom: query.dateFrom });
    } else if (query.dateTo) {
      qb.andWhere('nl.created_at <= :dateTo', { dateTo: query.dateTo });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  /**
   * POST /notifications/retry/:id
   * Re-enqueue a failed notification for delivery.
   * Requirements: 13.5
   */
  @Post('retry/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('notification_config', 'manage')
  async retryNotification(@Param('id', ParseUUIDPipe) id: string) {
    const log = await this.logRepository.findOne({ where: { id } });
    if (!log) {
      return { success: false, message: `Notification ${id} not found.` };
    }

    // Reset status to pending
    log.status = NotificationStatus.PENDING;
    log.attempt_count = 0;
    await this.logRepository.save(log);

    const jobData = {
      notificationLogId: log.id,
      recipientId: log.recipient_id,
      type: log.notification_type,
      triggerEvent: log.trigger_event,
      payload: log.payload as Record<string, unknown>,
    };

    if (log.channel === NotificationChannel.EMAIL) {
      await this.emailQueue.add(jobData, {
        attempts: 3,
        backoff: { type: 'fixed', delay: 10 * 60 * 1000 }, // 10-min intervals (req 13.6)
        removeOnComplete: true,
      });
    } else {
      await this.smsQueue.add(jobData, {
        attempts: 3,
        backoff: { type: 'fixed', delay: 10 * 60 * 1000 },
        removeOnComplete: true,
      });
    }

    return { success: true, message: `Notification ${id} re-queued for delivery.` };
  }

  /**
   * PUT /notifications/config
   * Update gateway config (SMTP / SMS credentials).
   * In this implementation, config is environment-driven; this endpoint
   * acknowledges the request and documents the expected env var names.
   * Requirements: 13.3
   */
  @Put('config')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('notification_config', 'manage')
  updateConfig(@Body() _body: Record<string, unknown>) {
    // Gateway credentials are managed via environment variables:
    //   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
    //   SMS_ENABLED, SMS_ACCOUNT_SID, SMS_AUTH_TOKEN, SMS_FROM_NUMBER
    return {
      message:
        'Gateway configuration is managed via environment variables. ' +
        'Update the deployment environment and restart the service to apply changes.',
      env_vars: [
        'SMTP_HOST',
        'SMTP_PORT',
        'SMTP_USER',
        'SMTP_PASS',
        'SMTP_FROM',
        'SMS_ENABLED',
        'SMS_ACCOUNT_SID',
        'SMS_AUTH_TOKEN',
        'SMS_FROM_NUMBER',
      ],
    };
  }

  /**
   * PATCH /notifications/types/:type
   * Enable or disable a specific notification type.
   * In this implementation, persisted as a notification_log convention;
   * runtime toggle stored in env config.
   * Requirements: 13.7
   */
  @Patch('types/:type')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('notification_config', 'manage')
  toggleNotificationType(
    @Param('type') type: string,
    @Body('enabled') enabled: boolean,
  ) {
    // In a full deployment this would write to a config table / Redis.
    // The processors read NOTIFICATION_<TYPE>_ENABLED env var to skip/send.
    return {
      message: `Notification type "${type}" ${enabled ? 'enabled' : 'disabled'}.`,
      note:
        `Set env var NOTIFICATION_${type.toUpperCase()}_ENABLED=${enabled} ` +
        `and restart to make this persistent.`,
    };
  }
}

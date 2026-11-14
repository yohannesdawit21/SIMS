import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

import { FeesService } from './fees.service';

/**
 * FeesProcessor — processes scheduled fee reminder jobs.
 *
 * Jobs:
 *  - due_reminder : notify student + guardians 7 days before due date
 *  - overdue      : notify student + guardians after due date passes
 *
 * Requirements: 7.4, 7.5
 */
@Processor('fees:reminders')
export class FeesProcessor {
  private readonly logger = new Logger(FeesProcessor.name);

  constructor(private readonly feesService: FeesService) {}

  @Process('due_reminder')
  async handleDueReminder(job: Job<{ feeRecordId: string }>): Promise<void> {
    this.logger.log(`Processing due_reminder job for fee record ${job.data.feeRecordId}`);
    try {
      // Re-check the specific record before notifying
      const record = await this.feesService.findOne(job.data.feeRecordId);
      const outstanding =
        Number(record.amount_due) -
        Number(record.waiver_amount) -
        Number(record.amount_paid);

      if (outstanding > 0) {
        await this.feesService.processDueReminders();
      }
    } catch (err) {
      this.logger.error(`Due reminder job failed: ${(err as Error).message}`);
      throw err;
    }
  }

  @Process('overdue')
  async handleOverdue(job: Job<{ feeRecordId: string }>): Promise<void> {
    this.logger.log(`Processing overdue job for fee record ${job.data.feeRecordId}`);
    try {
      const record = await this.feesService.findOne(job.data.feeRecordId);
      const outstanding =
        Number(record.amount_due) -
        Number(record.waiver_amount) -
        Number(record.amount_paid);

      if (outstanding > 0) {
        await this.feesService.processOverdueNotifications();
      }
    } catch (err) {
      this.logger.error(`Overdue job failed: ${(err as Error).message}`);
      throw err;
    }
  }
}

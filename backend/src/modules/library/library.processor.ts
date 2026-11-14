import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';

import { LibraryService } from './library.service';
import { NotificationService } from '../notifications/notification.service';

/**
 * LibraryProcessor — handles the daily overdue-loan notification sweep.
 *
 * Jobs:
 *  - check_overdue : find all unreturned loans past their due date and notify
 *
 * Requirements: 8.5
 */
@Processor('library:jobs')
export class LibraryProcessor {
  private readonly logger = new Logger(LibraryProcessor.name);

  constructor(
    private readonly libraryService: LibraryService,
    private readonly notificationService: NotificationService,
  ) {}

  @Process('check_overdue')
  async handleOverdueCheck(_job: Job): Promise<void> {
    this.logger.log('Running overdue loan notification sweep');

    const overdueLoans = await this.libraryService.findOverdueLoans();
    const now = new Date();

    for (const loan of overdueLoans) {
      const daysOverdue = Math.floor(
        (now.getTime() - new Date(loan.due_date).getTime()) / (1000 * 60 * 60 * 24),
      );

      const payload = {
        loan_id: loan.id,
        resource_title: loan.resource?.title ?? 'Unknown',
        due_date: loan.due_date,
        days_overdue: daysOverdue,
      };

      await this.notificationService.enqueue(
        loan.student_id,
        'library_loan_overdue',
        'email',
        'library_loan_overdue',
        payload,
      );
      await this.notificationService.enqueue(
        loan.student_id,
        'library_loan_overdue',
        'sms',
        'library_loan_overdue',
        payload,
      );
    }

    this.logger.log(`Overdue loan notifications sent for ${overdueLoans.length} loans`);
  }
}

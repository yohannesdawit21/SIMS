import { Injectable } from '@nestjs/common';

/**
 * Pure calculation service for attendance percentage computations.
 * No database or external dependencies — all methods are deterministic.
 *
 * Requirements: 5.2
 */
@Injectable()
export class AttendanceCalculatorService {
  /**
   * Compute the attendance percentage for a student.
   *
   * Formula: (present + late) / total * 100
   * Late sessions count as attended for percentage purposes.
   *
   * @param counts  Object containing present, late, and absent session counts
   * @returns Percentage rounded to 2 decimal places, or 0.00 if total is 0
   */
  computeAttendancePercentage(counts: {
    present: number;
    late: number;
    absent: number;
  }): number {
    const total = counts.present + counts.late + counts.absent;
    if (total === 0) return 0.0;

    const percentage = ((counts.present + counts.late) / total) * 100;
    return Math.round(percentage * 100) / 100;
  }

  /**
   * Determine whether an attendance percentage falls below the required threshold.
   *
   * @param percentage  Computed attendance percentage (0–100)
   * @param threshold   Minimum required attendance percentage (e.g. 75)
   * @returns true if the student's attendance is below the threshold
   */
  isBelowThreshold(percentage: number, threshold: number): boolean {
    return percentage < threshold;
  }
}

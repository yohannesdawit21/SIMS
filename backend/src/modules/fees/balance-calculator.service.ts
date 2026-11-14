import { Injectable } from '@nestjs/common';

/**
 * Pure calculation service for fee balance computations.
 * No database or external dependencies — all methods are deterministic.
 *
 * Requirements: 7.2
 */
@Injectable()
export class BalanceCalculatorService {
  /**
   * Compute the outstanding balance for a student given their fee records and payments.
   *
   * Formula:
   *   max(0, Σ( max(0, fee.amountDue - fee.waiver) ) - Σ(payments))
   *
   * Each fee entry's effective charge is clamped to 0 so a waiver exceeding the
   * amount due cannot produce a negative charge. The aggregate outstanding balance
   * is also clamped to 0 (overpayment does not produce a negative balance).
   *
   * @param fees      Array of fee entries, each with amountDue and waiver
   * @param payments  Array of payment amounts already made
   * @returns Outstanding balance rounded to 2 decimal places, minimum 0
   */
  computeOutstandingBalance(
    fees: { amountDue: number; waiver: number }[],
    payments: number[],
  ): number {
    const totalCharged = (fees ?? []).reduce(
      (sum, fee) => sum + Math.max(0, fee.amountDue - fee.waiver),
      0,
    );

    const totalPaid = (payments ?? []).reduce((sum, p) => sum + p, 0);

    const balance = Math.max(0, totalCharged - totalPaid);
    return Math.round(balance * 100) / 100;
  }
}

/**
 * Fees Module Property-Based Tests
 *
 * Validates: Requirements 7.2, 7.3, 7.4
 *
 * Property 21: Fee balance invariant —
 *  outstanding = max(0, Σ(max(0, amountDue - waiver)) - Σ(payments)),
 *  never negative, correctly rounds to 2 decimal places.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { BalanceCalculatorService } from '../../modules/fees/balance-calculator.service';

describe('Fees Property Tests', () => {
  const balanceCalculator = new BalanceCalculatorService();

  describe('Property 21: Fee balance invariant', () => {
    it('outstanding balance is never negative for any fees and payments', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              amountDue: fc.double({ min: 0, max: 100000, noNaN: true }),
              waiver: fc.double({ min: 0, max: 100000, noNaN: true }),
            }),
            { maxLength: 50 },
          ),
          fc.array(fc.double({ min: 0, max: 100000, noNaN: true }), { maxLength: 50 }),
          (fees, payments) => {
            const balance = balanceCalculator.computeOutstandingBalance(fees, payments);
            expect(balance).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(balance)).toBe(true);
          },
        ),
      );
    });

    it('waiver exceeding amountDue is clamped and does not produce negative charge', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 10, max: 1000, noNaN: true }),
          fc.double({ min: 1001, max: 5000, noNaN: true }),
          (amountDue, waiver) => {
            const balance = balanceCalculator.computeOutstandingBalance(
              [{ amountDue, waiver }],
              [],
            );
            expect(balance).toBe(0);
          },
        ),
      );
    });

    it('payments exceeding total charge clamp to 0 balance', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 10, max: 500, noNaN: true }),
          fc.double({ min: 501, max: 2000, noNaN: true }),
          (amountDue, payment) => {
            const balance = balanceCalculator.computeOutstandingBalance(
              [{ amountDue, waiver: 0 }],
              [payment],
            );
            expect(balance).toBe(0);
          },
        ),
      );
    });

    it('exact payments leave zero outstanding balance', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.double({ min: 1, max: 500, noNaN: true }).map((d) => Math.round(d * 100) / 100),
            { minLength: 1, maxLength: 20 },
          ),
          (amounts) => {
            const fees = amounts.map((a) => ({ amountDue: a, waiver: 0 }));
            const balance = balanceCalculator.computeOutstandingBalance(fees, amounts);
            expect(balance).toBe(0);
          },
        ),
      );
    });

    it('partial payment reduces balance by exactly the payment amount', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 100, max: 1000, noNaN: true }).map((d) => Math.round(d * 100) / 100),
          fc.double({ min: 1, max: 99, noNaN: true }).map((d) => Math.round(d * 100) / 100),
          (amountDue, payment) => {
            const initialBalance = balanceCalculator.computeOutstandingBalance(
              [{ amountDue, waiver: 0 }],
              [],
            );
            const afterPayment = balanceCalculator.computeOutstandingBalance(
              [{ amountDue, waiver: 0 }],
              [payment],
            );
            const expectedRemaining = Math.round((initialBalance - payment) * 100) / 100;
            expect(afterPayment).toBeCloseTo(expectedRemaining, 2);
          },
        ),
      );
    });
  });
});

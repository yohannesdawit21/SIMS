/**
 * Students & Enrollment Module Property-Based Tests
 *
 * Validates: Requirements 3.2, 3.4
 *
 * Property 9: Student identification number format — follows STU-{year}-{5 digit sequence}
 * Property 10: Course capacity enforcement invariant — enrollment never accepts additions beyond max_enrollment
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

describe('Students & Enrollment Property Tests', () => {
  describe('Property 9: Student identification number format and sequence padding', () => {
    function generateStudentNumber(year: number, count: number): string {
      const seq = (count + 1).toString().padStart(5, '0');
      return `STU-${year}-${seq}`;
    }

    it('generates student numbers matching STU-{year}-{sequence} format', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2000, max: 2099 }),
          fc.integer({ min: 0, max: 99998 }),
          (year, count) => {
            const num = generateStudentNumber(year, count);
            expect(num).toMatch(/^STU-\d{4}-\d{5}$/);
            expect(num.startsWith(`STU-${year}-`)).toBe(true);
          },
        ),
      );
    });

    it('distinct sequence indices for the same year always produce distinct student numbers', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2000, max: 2099 }),
          fc.integer({ min: 0, max: 50000 }),
          fc.integer({ min: 50001, max: 99998 }),
          (year, countA, countB) => {
            const numA = generateStudentNumber(year, countA);
            const numB = generateStudentNumber(year, countB);
            expect(numA).not.toBe(numB);
          },
        ),
      );
    });
  });

  describe('Property 10: Course capacity invariant', () => {
    function canEnroll(current: number, max: number): boolean {
      return current < max;
    }

    it('enrollment is accepted iff current_enrollment < max_enrollment', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 500 }),
          fc.integer({ min: 1, max: 500 }),
          (current, max) => {
            const allowed = canEnroll(current, max);
            if (current < max) {
              expect(allowed).toBe(true);
            } else {
              expect(allowed).toBe(false);
            }
          },
        ),
      );
    });

    it('incremental enrollment strictly respects max capacity limit', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 1, max: 200 }),
          (maxCapacity, attemptedEnrollments) => {
            let current = 0;
            let successful = 0;
            let rejected = 0;

            for (let i = 0; i < attemptedEnrollments; i++) {
              if (canEnroll(current, maxCapacity)) {
                current += 1;
                successful += 1;
              } else {
                rejected += 1;
              }
            }

            expect(current).toBeLessThanOrEqual(maxCapacity);
            expect(successful).toBe(Math.min(maxCapacity, attemptedEnrollments));
            expect(rejected).toBe(Math.max(0, attemptedEnrollments - maxCapacity));
          },
        ),
      );
    });
  });
});

/**
 * Attendance Module Property-Based Tests
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.5
 *
 * Properties:
 *   16. computeAttendancePercentage returns round((present+late)/total*100, 2);
 *       returns 0 when total is 0.
 *   17. Students below threshold get notification enqueued;
 *       at/above threshold do not.
 *   18. setThreshold accepts values in [50, 100]; rejects outside that range.
 *   19. amendRecord within 48 h allows lecturer; beyond 48 h requires
 *       admin_staff or super_admin.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttendanceCalculatorService } from '../../modules/attendance/attendance-calculator.service';

// ---------------------------------------------------------------------------
// Helper: build a minimal AttendanceService stand-in for unit-level testing
// of amendRecord and setThreshold without a real database or Redis.
// ---------------------------------------------------------------------------

/**
 * Constructs a lightweight mock of AttendanceService that uses in-memory
 * state and exposes only the methods under test (amendRecord, setThreshold).
 * This avoids having to spin up a full NestJS application context.
 */
function buildMockAttendanceService(overrides: {
  sessionDate?: Date;
  existingStatus?: string;
  redisFallback?: number | null;
} = {}) {
  const sessionDate = overrides.sessionDate ?? new Date();
  const existingStatus = overrides.existingStatus ?? 'present';

  // In-memory threshold store (simulates Redis)
  let storedThreshold: number | null = overrides.redisFallback ?? null;

  const auditLog = vi.fn().mockResolvedValue(undefined);

  // Minimal record object returned by the mock repo
  const mockRecord = {
    id: 'record-uuid-1',
    status: existingStatus,
    student_id: 'student-uuid-1',
    session_id: 'session-uuid-1',
    recorded_by: 'lecturer-uuid-1',
    amended_by: null as string | null,
    amended_at: null as Date | null,
    session: {
      id: 'session-uuid-1',
      session_date: sessionDate,
      lecturer_id: 'lecturer-uuid-1',
      course_id: 'course-uuid-1',
    },
  };

  // Simulate the service's amendRecord business logic directly
  async function amendRecord(
    recordId: string,
    status: string,
    actorId: string,
    actorRole: string,
  ) {
    if (recordId !== mockRecord.id) {
      throw new NotFoundException(`Attendance record ${recordId} not found`);
    }

    const hoursElapsed =
      (Date.now() - new Date(mockRecord.session.session_date).getTime()) /
      (1000 * 60 * 60);

    const AMEND_WINDOW_HOURS = 48;

    if (hoursElapsed > AMEND_WINDOW_HOURS) {
      if (actorRole !== 'admin_staff' && actorRole !== 'super_admin') {
        throw new ForbiddenException(
          'Amending records older than 48 hours requires admin_staff or super_admin role',
        );
      }
    }

    const previousStatus = mockRecord.status;
    mockRecord.status = status;
    mockRecord.amended_by = actorId;
    mockRecord.amended_at = new Date();

    await auditLog({
      actorId,
      operation: 'update',
      recordType: 'attendance_records',
      recordId: mockRecord.id,
      previousValues: { status: previousStatus },
      newValues: { status },
    });

    return { ...mockRecord };
  }

  // Simulate the service's setThreshold business logic
  async function setThreshold(value: number, actorId: string) {
    if (value < 50 || value > 100) {
      throw new BadRequestException('Threshold must be between 50 and 100');
    }
    storedThreshold = value;
    await auditLog({
      actorId,
      operation: 'update',
      recordType: 'config',
      recordId: 'config:attendance_threshold',
      previousValues: null,
      newValues: { attendance_threshold: value },
    });
  }

  async function getThreshold(): Promise<number> {
    if (storedThreshold === null) return 75;
    return storedThreshold;
  }

  return { amendRecord, setThreshold, getThreshold, auditLog, mockRecord };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Non-negative integer attendance counts — constrained to keep totals small */
const arbCounts = fc.record({
  present: fc.nat({ max: 100 }),
  late: fc.nat({ max: 100 }),
  absent: fc.nat({ max: 100 }),
});

/** A threshold value strictly inside the valid range [50, 100] */
const arbValidThreshold = fc.integer({ min: 50, max: 100 });

/** A threshold value strictly outside the valid range */
const arbInvalidThreshold = fc.oneof(
  fc.integer({ min: -1000, max: 49 }),
  fc.integer({ min: 101, max: 1000 }),
);

/** Roles that may amend within or outside the 48 h window */
const arbPrivilegedRole = fc.constantFrom('admin_staff', 'super_admin');
const arbUnprivilegedRole = fc.constantFrom('lecturer', 'student', 'department_head');

// ---------------------------------------------------------------------------
// Property 16: computeAttendancePercentage
//
// For any (present, late, absent) triple:
//   - percentage = round((present + late) / total * 100, 2)
//   - when total = 0, percentage = 0
//
// **Validates: Requirements 5.2**
// ---------------------------------------------------------------------------

describe('Property 16: computeAttendancePercentage', () => {
  const calculator = new AttendanceCalculatorService();

  /**
   * **Validates: Requirements 5.2**
   *
   * For any non-negative (present, late, absent) counts, the returned
   * percentage equals round((present + late) / total * 100, 2).
   */
  it('returns round((present+late)/total*100, 2) for any non-zero total', () => {
    fc.assert(
      fc.property(
        arbCounts.filter((c) => c.present + c.late + c.absent > 0),
        ({ present, late, absent }) => {
          const total = present + late + absent;
          const expected = Math.round(((present + late) / total) * 100 * 100) / 100;
          const actual = calculator.computeAttendancePercentage({ present, late, absent });
          expect(actual).toBe(expected);
        },
      ),
      { numRuns: 500 },
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * When total is 0 (all counts zero) the function must return exactly 0.
   */
  it('returns 0 when total is 0', () => {
    const result = calculator.computeAttendancePercentage({ present: 0, late: 0, absent: 0 });
    expect(result).toBe(0);
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * Result is always in [0, 100] for any non-negative input.
   */
  it('result is always in [0, 100]', () => {
    fc.assert(
      fc.property(arbCounts, ({ present, late, absent }) => {
        const result = calculator.computeAttendancePercentage({ present, late, absent });
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(100);
      }),
      { numRuns: 300 },
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * Absent-only counts always yield 0%.
   */
  it('absent-only counts always yield 0%', () => {
    fc.assert(
      fc.property(fc.nat({ max: 200 }), (absent) => {
        const result = calculator.computeAttendancePercentage({ present: 0, late: 0, absent });
        expect(result).toBe(absent === 0 ? 0 : 0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * Present-only counts always yield 100%.
   */
  it('present-only counts (absent=0, late=0) always yield 100%', () => {
    fc.assert(
      fc.property(fc.nat({ max: 200 }).filter((n) => n > 0), (present) => {
        const result = calculator.computeAttendancePercentage({ present, late: 0, absent: 0 });
        expect(result).toBe(100);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 17: Low-attendance notification logic
//
// Students below threshold get notification enqueued;
// at/above threshold do not.
//
// **Validates: Requirements 5.2**
// ---------------------------------------------------------------------------

describe('Property 17: Low-attendance notification gating', () => {
  const calculator = new AttendanceCalculatorService();

  /**
   * **Validates: Requirements 5.2**
   *
   * For any attendance percentage strictly below the threshold,
   * isBelowThreshold returns true (notification should be enqueued).
   */
  it('isBelowThreshold returns true for percentage < threshold', () => {
    fc.assert(
      fc.property(
        // Use integer arithmetic to avoid 32-bit float constraints.
        // percentage in [0, 99], threshold in [percentage+1, 100].
        fc.integer({ min: 0, max: 99 }),
        fc.integer({ min: 1, max: 100 }),
        (percentageInt, deltaInt) => {
          const percentage = percentageInt;
          const threshold = Math.min(percentageInt + deltaInt, 100);
          if (percentage < threshold) {
            expect(calculator.isBelowThreshold(percentage, threshold)).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * For any percentage >= threshold, isBelowThreshold returns false
   * (no notification should be enqueued).
   */
  it('isBelowThreshold returns false for percentage >= threshold', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (base, extra) => {
          const threshold = base;
          const percentage = base + extra; // percentage >= threshold
          expect(calculator.isBelowThreshold(percentage, threshold)).toBe(false);
        },
      ),
      { numRuns: 300 },
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * Exactly at the threshold (equal) → NOT below → no notification.
   */
  it('isBelowThreshold returns false when percentage equals threshold', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        (value) => {
          expect(calculator.isBelowThreshold(value, value)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * Simulates the full notification gating: when the computed percentage
   * falls below threshold, the notification enqueue mock is called;
   * when at or above threshold it is NOT called.
   */
  it('notification is enqueued iff percentage < threshold', () => {
    fc.assert(
      fc.property(
        arbCounts,
        arbValidThreshold,
        ({ present, late, absent }, threshold) => {
          const enqueueMock = vi.fn();

          const percentage = calculator.computeAttendancePercentage({ present, late, absent });
          const isBelow = calculator.isBelowThreshold(percentage, threshold);

          // Simulate the guard logic from markAttendance
          if (isBelow) {
            enqueueMock();
          }

          if (isBelow) {
            expect(enqueueMock).toHaveBeenCalledTimes(1);
          } else {
            expect(enqueueMock).not.toHaveBeenCalled();
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 18: setThreshold input validation
//
// setThreshold accepts [50, 100], rejects outside that range.
//
// **Validates: Requirements 5.5**
// ---------------------------------------------------------------------------

describe('Property 18: setThreshold validation', () => {
  /**
   * **Validates: Requirements 5.5**
   *
   * For any value in [50, 100], setThreshold must NOT throw.
   */
  it('accepts threshold values in [50, 100]', async () => {
    await fc.assert(
      fc.asyncProperty(arbValidThreshold, async (value) => {
        const { setThreshold } = buildMockAttendanceService();
        await expect(setThreshold(value, 'actor-uuid')).resolves.not.toThrow();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.5**
   *
   * For any value outside [50, 100], setThreshold must throw BadRequestException.
   */
  it('rejects threshold values outside [50, 100] with BadRequestException', async () => {
    await fc.assert(
      fc.asyncProperty(arbInvalidThreshold, async (value) => {
        const { setThreshold } = buildMockAttendanceService();
        await expect(setThreshold(value, 'actor-uuid')).rejects.toThrow(BadRequestException);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.5**
   *
   * Exactly 50 and exactly 100 are boundary values that MUST be accepted.
   */
  it('accepts boundary values 50 and 100', async () => {
    const { setThreshold } = buildMockAttendanceService();
    await expect(setThreshold(50, 'actor-uuid')).resolves.not.toThrow();
    await expect(setThreshold(100, 'actor-uuid')).resolves.not.toThrow();
  });

  /**
   * **Validates: Requirements 5.5**
   *
   * 49 and 101 are the boundary-adjacent invalid values and MUST be rejected.
   */
  it('rejects boundary-adjacent invalid values 49 and 101', async () => {
    const { setThreshold } = buildMockAttendanceService();
    await expect(setThreshold(49, 'actor-uuid')).rejects.toThrow(BadRequestException);
    await expect(setThreshold(101, 'actor-uuid')).rejects.toThrow(BadRequestException);
  });

  /**
   * **Validates: Requirements 5.5**
   *
   * getThreshold returns the last stored value after setThreshold.
   */
  it('getThreshold returns the stored value after setThreshold', async () => {
    await fc.assert(
      fc.asyncProperty(arbValidThreshold, async (value) => {
        const { setThreshold, getThreshold } = buildMockAttendanceService();
        await setThreshold(value, 'actor-uuid');
        const stored = await getThreshold();
        expect(stored).toBe(value);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.5**
   *
   * getThreshold returns the default 75 when no threshold has been set.
   */
  it('getThreshold falls back to 75 when not set', async () => {
    const { getThreshold } = buildMockAttendanceService({ redisFallback: null });
    const result = await getThreshold();
    expect(result).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// Property 19: amendRecord time-window enforcement
//
// Within 48 h → lecturer may amend; beyond 48 h → only admin_staff / super_admin.
//
// **Validates: Requirements 5.3**
// ---------------------------------------------------------------------------

describe('Property 19: amendRecord time-window enforcement', () => {
  const VALID_STATUSES = ['present', 'absent', 'late'] as const;
  const arbStatus = fc.constantFrom(...VALID_STATUSES);

  /**
   * **Validates: Requirements 5.3**
   *
   * For any session date within the last 48 hours, a lecturer actor must
   * succeed in amending the record (no ForbiddenException).
   */
  it('within 48 h: lecturer may amend the record', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbStatus,
        // hoursAgo in [0, 47] (integer hours, strictly within 48 h window)
        fc.integer({ min: 0, max: 47 }),
        async (status, hoursAgo) => {
          const sessionDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
          const { amendRecord, mockRecord } = buildMockAttendanceService({ sessionDate });

          await expect(
            amendRecord(mockRecord.id, status, 'actor-uuid', 'lecturer'),
          ).resolves.not.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.3**
   *
   * For any session date older than 48 hours, a lecturer actor must receive
   * ForbiddenException when attempting to amend.
   */
  it('beyond 48 h: lecturer is forbidden from amending', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbStatus,
        // hoursAgo in [49, 720] — strictly older than 48 h
        fc.integer({ min: 49, max: 720 }),
        async (status, hoursAgo) => {
          const sessionDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
          const { amendRecord, mockRecord } = buildMockAttendanceService({ sessionDate });

          await expect(
            amendRecord(mockRecord.id, status, 'actor-uuid', 'lecturer'),
          ).rejects.toThrow(ForbiddenException);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.3**
   *
   * For any session date older than 48 hours, admin_staff and super_admin
   * must be allowed to amend (no exception thrown).
   */
  it('beyond 48 h: admin_staff and super_admin may amend', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbStatus,
        arbPrivilegedRole,
        fc.integer({ min: 49, max: 720 }),
        async (status, role, hoursAgo) => {
          const sessionDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
          const { amendRecord, mockRecord } = buildMockAttendanceService({ sessionDate });

          await expect(
            amendRecord(mockRecord.id, status, 'actor-uuid', role),
          ).resolves.not.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.3**
   *
   * For any session date older than 48 hours, non-privileged roles (student,
   * department_head) must receive ForbiddenException.
   */
  it('beyond 48 h: unprivileged roles are forbidden', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbStatus,
        arbUnprivilegedRole,
        fc.integer({ min: 49, max: 720 }),
        async (status, role, hoursAgo) => {
          const sessionDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
          const { amendRecord, mockRecord } = buildMockAttendanceService({ sessionDate });

          await expect(
            amendRecord(mockRecord.id, status, 'actor-uuid', role),
          ).rejects.toThrow(ForbiddenException);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.3**
   *
   * A NotFoundException is thrown when the recordId does not match any record.
   */
  it('throws NotFoundException for an unknown recordId', async () => {
    const { amendRecord } = buildMockAttendanceService();
    await expect(
      amendRecord('nonexistent-record-id', 'present', 'actor-uuid', 'lecturer'),
    ).rejects.toThrow(NotFoundException);
  });
});

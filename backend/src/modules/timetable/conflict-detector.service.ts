import { Injectable } from '@nestjs/common';

/**
 * Shape of a timetable entry used for conflict detection.
 * Times are expressed as minutes from midnight (0–1439) for easy numeric comparison.
 *
 * Requirements: 6.2, 6.3
 */
export interface TimetableEntryInput {
  /** UUID of the academic period this entry belongs to */
  academic_period_id: string;

  /** ISO day-of-week number: 0 = Sunday … 6 = Saturday (matches DB column) */
  day_of_week: number;

  /** Session start time as minutes from midnight (e.g. 09:00 → 540) */
  start_time: number;

  /** Session end time as minutes from midnight (e.g. 10:30 → 630) */
  end_time: number;

  /** Room / venue identifier */
  room: string;

  /** UUID of the lecturer assigned to the session */
  lecturer_id: string;

  /**
   * Optional list of student-group / cohort identifiers enrolled in this session.
   * Conflicts are detected when two entries share at least one group.
   */
  student_group_ids?: string[];
}

/**
 * Pure conflict-detection service for timetable entries.
 * No database or external dependencies — all methods are deterministic.
 *
 * Requirements: 6.2, 6.3
 */
@Injectable()
export class ConflictDetectorService {
  /**
   * Determine whether two timetable entries conflict.
   *
   * Two entries conflict when ALL of the following hold:
   *   1. They belong to the same academic period
   *   2. They fall on the same day of the week
   *   3. Their time intervals overlap: a.start_time < b.end_time AND a.end_time > b.start_time
   *   4. They share at least one resource: same lecturer, same room, or at least one
   *      common student group
   *
   * @param a  First timetable entry
   * @param b  Second timetable entry
   * @returns  true if the two entries conflict, false otherwise
   */
  detectConflict(a: TimetableEntryInput, b: TimetableEntryInput): boolean {
    // 1. Must be in the same academic period
    if (a.academic_period_id !== b.academic_period_id) {
      return false;
    }

    // 2. Must be on the same day of the week
    if (a.day_of_week !== b.day_of_week) {
      return false;
    }

    // 3. Time intervals must overlap (standard interval-overlap test)
    const timesOverlap = a.start_time < b.end_time && a.end_time > b.start_time;
    if (!timesOverlap) {
      return false;
    }

    // 4. Must share a resource: lecturer, room, or student group
    const sameLecturer = a.lecturer_id === b.lecturer_id;
    const sameRoom = a.room === b.room;
    const sharedGroup = this.hasSharedGroup(
      a.student_group_ids ?? [],
      b.student_group_ids ?? [],
    );

    return sameLecturer || sameRoom || sharedGroup;
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private hasSharedGroup(groupsA: string[], groupsB: string[]): boolean {
    if (groupsA.length === 0 || groupsB.length === 0) return false;
    const setB = new Set(groupsB);
    return groupsA.some((g) => setB.has(g));
  }
}

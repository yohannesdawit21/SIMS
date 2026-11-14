import { Injectable } from '@nestjs/common';

/**
 * Pure calculation service for grade and GPA computations.
 * No database or external dependencies — all methods are deterministic.
 *
 * Requirements: 4.3, 4.10
 */
@Injectable()
export class GpaCalculatorService {
  /**
   * Compute a weighted final grade from assessment components.
   * Each component contributes (score × weight / 100) to the total.
   *
   * @param components  Array of { score, weight } pairs (weights should sum to 100)
   * @returns Weighted sum rounded to 2 decimal places, or 0 if empty
   */
  computeFinalGrade(
    components: { score: number; weight: number }[],
  ): number {
    if (!components || components.length === 0) return 0;

    const total = components.reduce(
      (sum, c) => sum + (c.score * c.weight) / 100,
      0,
    );
    return Math.round(total * 100) / 100;
  }

  /**
   * Compute the cumulative GPA from a set of course final grades.
   * Uses the standard weighted formula: Σ(grade_points × credit_hours) / Σ(credit_hours)
   *
   * @param finalGrades  Array of { grade_points, credit_hours } pairs
   * @returns GPA rounded to 2 decimal places, or 0.00 if empty
   */
  computeGpa(
    finalGrades: { grade_points: number; credit_hours: number }[],
  ): number {
    if (!finalGrades || finalGrades.length === 0) return 0.0;

    const totalCredits = finalGrades.reduce(
      (sum, g) => sum + g.credit_hours,
      0,
    );
    if (totalCredits === 0) return 0.0;

    const weightedSum = finalGrades.reduce(
      (sum, g) => sum + g.grade_points * g.credit_hours,
      0,
    );

    return Math.round((weightedSum / totalCredits) * 100) / 100;
  }

  /**
   * Convert a numeric score to a letter grade.
   *
   * Scale:
   *   A   90–100  B+  80–84  C+  65–69  D+  50–54
   *   A-  85–89   B   75–79  C   60–64  D   45–49
   *                   B-  70–74  C-  55–59  F   <45
   *
   * @param score  Numeric score (0–100)
   * @returns Letter grade string
   */
  scoreToLetterGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 85) return 'A-';
    if (score >= 80) return 'B+';
    if (score >= 75) return 'B';
    if (score >= 70) return 'B-';
    if (score >= 65) return 'C+';
    if (score >= 60) return 'C';
    if (score >= 55) return 'C-';
    if (score >= 50) return 'D+';
    if (score >= 45) return 'D';
    return 'F';
  }

  /**
   * Convert a numeric score to GPA grade points on the 4.0 scale.
   *
   * Scale:
   *   A   90–100 → 4.0   B+  80–84 → 3.3   C+  65–69 → 2.3   D+  50–54 → 1.3
   *   A-  85–89  → 3.7   B   75–79 → 3.0   C   60–64 → 2.0   D   45–49 → 1.0
   *                       B-  70–74 → 2.7   C-  55–59 → 1.7   F   <45   → 0.0
   *
   * @param score  Numeric score (0–100)
   * @returns Grade points (0.0 – 4.0)
   */
  scoreToGradePoints(score: number): number {
    if (score >= 90) return 4.0;
    if (score >= 85) return 3.7;
    if (score >= 80) return 3.3;
    if (score >= 75) return 3.0;
    if (score >= 70) return 2.7;
    if (score >= 65) return 2.3;
    if (score >= 60) return 2.0;
    if (score >= 55) return 1.7;
    if (score >= 50) return 1.3;
    if (score >= 45) return 1.0;
    return 0.0;
  }
}

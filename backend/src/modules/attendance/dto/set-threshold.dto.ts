import { IsNumber, Min, Max } from 'class-validator';

/**
 * DTO for PUT /attendance/config/threshold
 *
 * Admin Staff sets the attendance warning threshold.
 * Allowed range: 50 – 100 (inclusive).
 *
 * Requirements: 5.4
 */
export class SetThresholdDto {
  @IsNumber()
  @Min(50)
  @Max(100)
  value!: number;
}

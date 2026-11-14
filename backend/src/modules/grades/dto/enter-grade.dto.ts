import { IsNumber, IsUUID, Max, Min } from 'class-validator';

/**
 * DTO for entering or updating a student grade for an assessment component.
 * Requirements: 4.1, 4.2
 */
export class EnterGradeDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  courseId!: string;

  @IsUUID()
  componentId!: string;

  @IsUUID()
  academicPeriodId!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  score!: number;
}

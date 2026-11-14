import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

/**
 * DTO for publishing grades for a course in an academic period.
 * Requirements: 4.5, 4.6
 */
export class PublishGradesDto {
  @IsUUID()
  courseId!: string;

  @IsUUID()
  academicPeriodId!: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean = false;
}

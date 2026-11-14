import { IsUUID, IsNotEmpty } from 'class-validator';

/**
 * DTO for enrolling a student in a course for an academic period.
 * Requirements: 3.3, 3.4
 */
export class CreateEnrollmentDto {
  @IsUUID()
  @IsNotEmpty()
  student_id!: string;

  @IsUUID()
  @IsNotEmpty()
  course_id!: string;

  @IsUUID()
  @IsNotEmpty()
  academic_period_id!: string;
}

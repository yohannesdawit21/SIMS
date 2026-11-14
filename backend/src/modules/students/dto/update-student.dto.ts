import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { StudentStatus } from '../../../entities/student-profile.entity';

/**
 * DTO for updating an existing student profile.
 * student_number is intentionally excluded — it must never change after creation.
 * Requirements: 3.8
 */
export class UpdateStudentDto {
  /** Updating email also updates the linked User account email */
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  full_legal_name?: string;

  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  national_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  personal_email?: string | null;

  @IsOptional()
  @IsString()
  home_address?: string | null;

  @IsOptional()
  @IsUUID()
  programme_id?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  year_of_entry?: number;

  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}

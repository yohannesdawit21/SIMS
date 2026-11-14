import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * DTO for creating a new student profile.
 * Requirements: 3.1, 3.2
 */
export class CreateStudentDto {
  /** Institutional email address that becomes the User account email */
  @IsEmail()
  @MaxLength(255)
  email!: string;

  /** Student's full legal name as on official documents */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  full_legal_name!: string;

  @IsDateString()
  date_of_birth!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string | null;

  /** National ID — must be unique across all student profiles */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  national_id!: string;

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

  @IsInt()
  @Min(1900)
  @Max(2100)
  year_of_entry!: number;
}

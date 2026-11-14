import {
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateApplicationDto {
  // Personal Information
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  full_legal_name!: string;

  @IsDateString()
  date_of_birth!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  national_id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @IsNotEmpty()
  home_address!: string;

  // Educational Background
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  previous_school!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  previous_school_graduation_year!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  previous_grade_gpa?: string;

  // Emergency Contact
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  emergency_contact_name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  emergency_contact_phone!: string;

  // Parent/Guardian (optional)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  parent_guardian_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  parent_guardian_phone?: string;

  // Program Selection
  @IsUUID()
  preferred_programme_id!: string;

  @IsInt()
  @Min(2020)
  @Max(2100)
  year_of_entry!: number;
}

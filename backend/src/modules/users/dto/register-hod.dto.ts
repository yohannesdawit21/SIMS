import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO for Super Admin registering a new Head of Department.
 */
export class RegisterHODDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  /**
   * Password must be >=8 chars with at least one uppercase, lowercase, digit,
   * and special character.
   */
  @IsString()
  @MinLength(8)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).+$/,
    {
      message:
        'Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character.',
    },
  )
  password!: string;

  @IsOptional()
  @IsUUID()
  department_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  department_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

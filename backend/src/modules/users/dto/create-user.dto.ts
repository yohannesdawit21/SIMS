import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../../entities/user.entity';

/**
 * DTO for creating a new user account.
 * Requirements: 1.3, 2.4
 */
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username!: string;

  /**
   * Password must be ≥8 chars with at least one uppercase, lowercase, digit,
   * and special character. Requirement 2.4.
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

  @IsEnum(UserRole)
  role!: UserRole;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

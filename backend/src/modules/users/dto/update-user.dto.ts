import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../../entities/user.entity';

/**
 * DTO for updating an existing user account.
 * All fields are optional — only supplied fields are updated.
 * Requirements: 1.3, 1.5, 1.6
 */
export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  /**
   * Role change triggers Redis session update + audit log.
   * Requirement 1.5, 1.6
   */
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  /**
   * Optional password update — must pass complexity rules (Req 2.4).
   */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).+$/,
    {
      message:
        'Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character.',
    },
  )
  password?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

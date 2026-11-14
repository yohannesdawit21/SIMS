import { IsEmail, IsString, IsStrongPassword, MinLength } from 'class-validator';

export class CreateGuardianDto {
  @IsString()
  full_name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  phone!: string;

  /** Initial password for the guardian's user account */
  @IsString()
  @MinLength(8)
  password!: string;
}

import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateGuardianContactDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;
}

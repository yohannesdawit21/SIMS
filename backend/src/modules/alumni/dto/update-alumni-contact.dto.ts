import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateAlumniContactDto {
  @IsEmail()
  @IsOptional()
  current_email?: string;

  @IsString()
  @IsOptional()
  current_phone?: string;

  @IsString()
  @IsOptional()
  employer?: string;

  @IsString()
  @IsOptional()
  job_title?: string;
}

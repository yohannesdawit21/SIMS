import { IsUUID, IsOptional, IsString } from 'class-validator';

export class RegisterSemesterDto {
  @IsUUID()
  student_id!: string;

  @IsUUID()
  academic_period_id!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class OverrideBlockDto {
  @IsString()
  override_reason!: string;
}

import { IsOptional, IsString } from 'class-validator';

export class ApproveScheduleDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectScheduleDto {
  @IsString()
  rejection_reason!: string;
}

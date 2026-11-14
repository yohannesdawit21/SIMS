import { IsDateString, IsOptional, IsString } from 'class-validator';

export class TerminateAllocationDto {
  @IsDateString()
  departure_date!: string;

  @IsString()
  @IsOptional()
  departure_reason?: string;
}

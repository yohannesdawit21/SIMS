import { IsDateString, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class SearchNotificationsDto {
  @IsUUID()
  @IsOptional()
  recipientId?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsIn(['pending', 'sent', 'failed'])
  @IsOptional()
  status?: string;

  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}

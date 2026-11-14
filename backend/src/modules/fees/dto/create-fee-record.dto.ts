import { IsDateString, IsNumber, IsUUID, Min } from 'class-validator';

export class CreateFeeRecordDto {
  @IsUUID()
  student_id!: string;

  @IsUUID()
  category_id!: string;

  @IsUUID()
  academic_period_id!: string;

  @IsNumber()
  @Min(0)
  amount_due!: number;

  @IsDateString()
  due_date!: string;
}

import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
} from 'class-validator';

export class BatchTermFeeDto {
  @IsUUID()
  @IsNotEmpty()
  academic_period_id!: string;

  @IsUUID()
  @IsNotEmpty()
  category_id!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsDateString()
  due_date!: string;

  @IsOptional()
  @IsUUID()
  programme_id?: string;
}

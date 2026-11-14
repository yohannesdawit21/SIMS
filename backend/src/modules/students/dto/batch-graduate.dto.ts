import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class BatchGraduateDto {
  @IsUUID()
  @IsNotEmpty()
  programme_id!: string;

  @IsOptional()
  @IsInt()
  @Min(2000)
  year_of_entry?: number;

  @IsOptional()
  @IsDateString()
  graduation_date?: string;
}

import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class BatchEnrollCohortDto {
  @IsUUID()
  @IsNotEmpty()
  programme_id!: string;

  @IsOptional()
  @IsInt()
  @Min(2000)
  year_of_entry?: number;

  @IsUUID()
  @IsNotEmpty()
  academic_period_id!: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayNotEmpty()
  course_ids!: string[];
}

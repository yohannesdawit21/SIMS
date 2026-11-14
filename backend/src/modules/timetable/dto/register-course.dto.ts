import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

export class RegisterCourseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  credit_hours!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  max_enrollment!: number;

  @IsUUID()
  lecturer_id!: string;

  @IsUUID()
  academic_period_id!: string;

  // Required for admin users; ignored for department heads.
  @IsOptional()
  @IsUUID()
  department_id?: string;
}

import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class GradeEntryItemDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  componentId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score!: number | null;
}

export class BatchEnterGradesDto {
  @IsUUID()
  courseId!: string;

  @IsUUID()
  periodId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GradeEntryItemDto)
  grades!: GradeEntryItemDto[];
}

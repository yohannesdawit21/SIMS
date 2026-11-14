import {
  IsOptional,
  IsString,
} from 'class-validator';

export class ClearDisciplineDto {
  @IsOptional()
  @IsString()
  clearance_note?: string;
}

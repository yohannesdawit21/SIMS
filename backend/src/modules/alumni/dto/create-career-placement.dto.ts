import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PlacementType } from '../../../entities/career-placement.entity';

export class CreateCareerPlacementDto {
  @IsUUID()
  alumni_id!: string;

  @IsString()
  employer_name!: string;

  @IsString()
  position_title!: string;

  @IsDateString()
  start_date!: string;

  @IsString()
  @IsOptional()
  sector?: string;

  @IsEnum(PlacementType)
  @IsOptional()
  placement_type?: PlacementType;
}

import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateListingDto {
  @IsString()
  employer_name!: string;

  @IsString()
  position_title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  deadline!: string;

  /** UUIDs of eligible programmes */
  @IsArray()
  @IsUUID('4', { each: true })
  programme_ids!: string[];
}

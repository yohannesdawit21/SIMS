import { IsString, IsOptional } from 'class-validator';

export class CatalogueQueryDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  author?: string;

  @IsString()
  @IsOptional()
  category?: string;
}

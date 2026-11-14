import { IsString, IsNotEmpty, IsOptional, IsInt, Min, MaxLength } from 'class-validator';

export class CreateResourceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title!: string;

  @IsString()
  @IsOptional()
  authors?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  isbn_or_accession!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  total_copies?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  available_copies?: number;
}

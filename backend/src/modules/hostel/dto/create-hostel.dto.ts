import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateHostelDto {
  @IsString()
  block_name!: string;

  @IsString()
  room_number!: string;

  @IsString()
  @IsOptional()
  room_type?: string;

  @IsInt()
  @Min(1)
  max_occupancy!: number;
}

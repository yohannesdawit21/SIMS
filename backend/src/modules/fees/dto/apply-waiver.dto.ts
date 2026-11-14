import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class ApplyWaiverDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @MinLength(5)
  reason!: string;
}

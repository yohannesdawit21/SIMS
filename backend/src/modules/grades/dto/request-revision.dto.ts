import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class RequestRevisionDto {
  @IsUUID()
  courseId!: string;

  @IsUUID()
  periodId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

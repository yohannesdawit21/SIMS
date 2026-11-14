import { IsDateString, IsUUID } from 'class-validator';

export class CreateAllocationDto {
  @IsUUID()
  student_id!: string;

  @IsUUID()
  hostel_id!: string;

  @IsDateString()
  start_date!: string;

  @IsDateString()
  end_date!: string;
}

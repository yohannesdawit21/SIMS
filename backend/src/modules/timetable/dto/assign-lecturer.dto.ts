import { IsUUID, IsNotEmpty } from 'class-validator';

export class AssignLecturerDto {
  @IsUUID()
  @IsNotEmpty()
  course_id!: string;

  @IsUUID()
  @IsNotEmpty()
  lecturer_id!: string;

  @IsUUID()
  @IsNotEmpty()
  academic_period_id!: string;
}

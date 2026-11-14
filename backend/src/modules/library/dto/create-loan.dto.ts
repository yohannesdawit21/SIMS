import { IsUUID, IsDateString, IsNotEmpty } from 'class-validator';

export class CreateLoanDto {
  @IsUUID()
  @IsNotEmpty()
  resourceId!: string;

  @IsUUID()
  @IsNotEmpty()
  studentId!: string;

  @IsDateString()
  @IsNotEmpty()
  loanDate!: string;

  @IsDateString()
  @IsNotEmpty()
  dueDate!: string;
}

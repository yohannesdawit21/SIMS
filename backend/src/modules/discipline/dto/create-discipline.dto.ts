import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
} from 'class-validator';
import { DisciplineIssueType } from '../../../entities/discipline-record.entity';

export class CreateDisciplineDto {
  @IsUUID()
  student_id!: string;

  @IsEnum(DisciplineIssueType)
  issue_type!: DisciplineIssueType;

  @IsString()
  @IsNotEmpty()
  description!: string;
}

import {
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApplicationStatus } from '../../../entities/student-application.entity';

export class ReviewApplicationDto {
  @IsEnum(ApplicationStatus)
  status!: ApplicationStatus;

  @IsOptional()
  @IsString()
  review_notes?: string;

  @IsOptional()
  @IsString()
  rejection_reason?: string;
}

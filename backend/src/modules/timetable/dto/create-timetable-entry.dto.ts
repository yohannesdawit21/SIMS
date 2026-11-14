import {
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { TimetableEntryType } from '../../../entities/timetable-entry.entity';

export class CreateTimetableEntryDto {
  @IsUUID()
  course_id!: string;

  @IsUUID()
  lecturer_id!: string;

  @IsUUID()
  academic_period_id!: string;

  @IsString()
  room!: string;

  /** 1 = Monday … 7 = Sunday */
  @IsInt()
  @Min(1)
  @Max(7)
  day_of_week!: number;

  /** HH:MM format */
  @Matches(/^\d{2}:\d{2}$/)
  start_time!: string;

  /** HH:MM format */
  @Matches(/^\d{2}:\d{2}$/)
  end_time!: string;

  @IsEnum(TimetableEntryType)
  entry_type!: TimetableEntryType;
}

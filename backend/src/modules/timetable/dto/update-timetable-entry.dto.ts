import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { TimetableEntryType } from '../../../entities/timetable-entry.entity';

export class UpdateTimetableEntryDto {
  @IsUUID()
  @IsOptional()
  course_id?: string;

  @IsUUID()
  @IsOptional()
  lecturer_id?: string;

  @IsUUID()
  @IsOptional()
  academic_period_id?: string;

  @IsString()
  @IsOptional()
  room?: string;

  @IsInt()
  @Min(1)
  @Max(7)
  @IsOptional()
  day_of_week?: number;

  @Matches(/^\d{2}:\d{2}$/)
  @IsOptional()
  start_time?: string;

  @Matches(/^\d{2}:\d{2}$/)
  @IsOptional()
  end_time?: string;

  @IsEnum(TimetableEntryType)
  @IsOptional()
  entry_type?: TimetableEntryType;
}

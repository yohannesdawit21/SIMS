import {
  IsUUID,
  IsEnum,
  IsArray,
  ValidateNested,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AttendanceStatus } from '../../../entities/attendance-record.entity';

/**
 * A single student attendance entry within a batch mark request.
 */
export class AttendanceEntryDto {
  @IsUUID()
  studentId!: string;

  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;
}

/**
 * DTO for POST /attendance/mark
 *
 * The assigned lecturer submits the session UUID and an array of per-student
 * status entries in a single batch operation.
 *
 * Requirements: 5.1
 */
export class MarkAttendanceDto {
  @IsUUID()
  sessionId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  records!: AttendanceEntryDto[];
}

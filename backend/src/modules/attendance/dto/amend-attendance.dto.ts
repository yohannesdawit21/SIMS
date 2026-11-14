import { IsEnum } from 'class-validator';
import { AttendanceStatus } from '../../../entities/attendance-record.entity';

/**
 * DTO for PATCH /attendance/records/:id
 *
 * Amends the status of an existing attendance record.
 * Business rules for who may amend and when are enforced in AttendanceService:
 *  - Within 48 h of the session date → assigned lecturer may amend
 *  - After 48 h → role must be admin_staff or super_admin
 *
 * Requirements: 5.7, 5.8
 */
export class AmendAttendanceDto {
  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;
}

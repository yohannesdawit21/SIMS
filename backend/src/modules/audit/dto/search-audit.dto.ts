import {
  IsOptional,
  IsUUID,
  IsString,
  IsEnum,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuditOperation } from '../../../entities/audit-log.entity';

/**
 * DTO for the Super Admin audit log search endpoint.
 * All fields are optional — omitting a field means no filter on that column.
 *
 * Requirements: 15.3
 */
export class SearchAuditDto {
  /** Filter by actor UUID (the user who performed the action) */
  @IsOptional()
  @IsUUID()
  actor?: string;

  /** Filter by record type (e.g. 'student_profiles', 'enrollments') */
  @IsOptional()
  @IsString()
  recordType?: string;

  /** Filter by operation type: create | update | delete */
  @IsOptional()
  @IsEnum(AuditOperation)
  operation?: AuditOperation;

  /** Inclusive lower bound for created_at (ISO 8601 date string) */
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  /** Inclusive upper bound for created_at (ISO 8601 date string) */
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  /** Page number (1-based). Defaults to 1. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** Number of records per page. Defaults to 20, max 100. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditOperation } from '../../entities/audit-log.entity';
import { SearchAuditDto } from './dto/search-audit.dto';

export interface AuditLogEntry {
  actorId: string;
  operation: AuditOperation;
  recordType: string;
  recordId: string;
  previousValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

/**
 * AuditService — write-only service for the immutable audit_log table.
 *
 * CRITICAL: Only INSERT operations are performed. The audit_logs table has
 * REVOKE UPDATE, DELETE at the PostgreSQL level (req 15.5). This service
 * never calls repository.save() (which may issue UPDATE) — it uses
 * repository.insert() exclusively to guarantee write-only semantics.
 *
 * Requirements: 15.1, 15.2, 15.5
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Load the current state of a record before a mutation so the interceptor
   * can capture the before-state for audit purposes.
   *
   * @param recordType  Entity / table name (e.g. 'student_profiles')
   * @param recordId    UUID of the record to snapshot
   */
  async loadBefore(
    recordType: string,
    recordId: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      // Query the record by its primary key via raw SQL to avoid coupling to
      // every entity type. The result is used only for diff storage.
      const result = await this.auditLogRepository.manager.query(
        `SELECT row_to_json(t) AS snapshot
         FROM ${recordType} t
         WHERE t.id = $1
         LIMIT 1`,
        [recordId],
      );
      if (result && result.length > 0) {
        return result[0].snapshot as Record<string, unknown>;
      }
      return null;
    } catch (err) {
      // Non-fatal: if we can't load the before state we still proceed.
      this.logger.warn(
        `AuditService.loadBefore failed for ${recordType}:${recordId} — ${String(err)}`,
      );
      return null;
    }
  }

  /**
   * Insert a single immutable audit log entry.
   * Uses INSERT (query builder) — never UPDATE or DELETE.
   *
   * Requirements: 15.1, 15.2
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      // Use raw INSERT to avoid TypeORM's strict DeepPartial typing for JSONB
      // columns, and to guarantee no UPDATE path is ever exercised (req 15.5).
      await this.auditLogRepository.manager.query(
        `INSERT INTO audit_logs
           (actor_id, operation, record_type, record_id, previous_values, new_values)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
        [
          entry.actorId,
          entry.operation,
          entry.recordType,
          entry.recordId,
          entry.previousValues !== undefined && entry.previousValues !== null
            ? JSON.stringify(entry.previousValues)
            : null,
          entry.newValues !== undefined && entry.newValues !== null
            ? JSON.stringify(entry.newValues)
            : null,
        ],
      );
    } catch (err) {
      // Log the failure but never throw — a failed audit write must not
      // break the main business operation.
      this.logger.error(
        `AuditService.log INSERT failed: ${String(err)}`,
        entry,
      );
    }
  }

  /**
   * Search / filter audit log entries.
   * All filter parameters are optional; only provided params constrain the
   * query.  Results are ordered newest-first and paginated.
   *
   * Requirements: 15.3
   *
   * @param params  Search criteria and pagination options
   */
  async search(params: SearchAuditDto): Promise<{
    data: AuditLog[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.auditLogRepository
      .createQueryBuilder('al')
      .orderBy('al.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (params.actor) {
      qb.andWhere('al.actor_id = :actor', { actor: params.actor });
    }

    if (params.recordType) {
      qb.andWhere('al.record_type = :recordType', {
        recordType: params.recordType,
      });
    }

    if (params.operation) {
      qb.andWhere('al.operation = :operation', {
        operation: params.operation,
      });
    }

    if (params.dateFrom) {
      qb.andWhere('al.created_at >= :dateFrom', {
        dateFrom: new Date(params.dateFrom),
      });
    }

    if (params.dateTo) {
      // Include all events up to the end of the dateTo day (inclusive).
      qb.andWhere('al.created_at <= :dateTo', {
        dateTo: new Date(params.dateTo),
      });
    }

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }
}

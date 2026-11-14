import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request } from 'express';
import { AuditService } from '../../modules/audit/audit.service';
import { AuditOperation } from '../../entities/audit-log.entity';
import type { AuthenticatedUser } from '../strategies/jwt.strategy';

type RequestWithUser = Request & { user?: AuthenticatedUser };

/** HTTP methods that mutate state and should be audited. */
const MUTABLE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Map HTTP method → AuditOperation enum value.
 */
function resolveOperation(method: string): AuditOperation {
  switch (method.toUpperCase()) {
    case 'POST':
      return AuditOperation.CREATE;
    case 'DELETE':
      return AuditOperation.DELETE;
    default:
      // PUT, PATCH
      return AuditOperation.UPDATE;
  }
}

/**
 * Extract a record ID from the request.
 * Preference: route param `:id` → body.id → undefined.
 */
function extractRecordId(req: Request): string | undefined {
  const params = req.params as Record<string, string>;
  const body = req.body as Record<string, unknown>;
  return params['id'] ?? (typeof body?.['id'] === 'string' ? body['id'] : undefined);
}

/**
 * Derive a record type label from the route path.
 * e.g. "/api/v1/students/123" → "students"
 *       "/api/v1/grades/publish" → "grades"
 */
function extractRecordType(req: Request): string {
  // Strip the global prefix and take the first path segment.
  const path = req.path.replace(/^\/api\/v\d+\//, '');
  return path.split('/')[0] ?? 'unknown';
}

/**
 * AuditInterceptor — global interceptor that captures before/after state for
 * all mutating (POST/PUT/PATCH/DELETE) requests and writes an immutable entry
 * to audit_logs via AuditService.
 *
 * Design notes:
 * - Never throws on audit failure — business operation always completes.
 * - Before-state is loaded BEFORE the handler runs (for UPDATE/DELETE).
 * - After-state is taken from the handler's resolved response value.
 * - actor_id comes from request.user.id (populated by JwtAuthGuard).
 *
 * Requirements: 15.1, 15.2
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();

    // Only audit mutable operations.
    if (!MUTABLE_METHODS.has(req.method.toUpperCase())) {
      return next.handle();
    }

    const operation = resolveOperation(req.method);
    const recordType = extractRecordType(req);
    const recordId = extractRecordId(req);
    const actorId = req.user?.id;

    // Capture before-state asynchronously for update/delete operations.
    const beforeStatePromise: Promise<Record<string, unknown> | null> =
      recordId && operation !== AuditOperation.CREATE
        ? this.auditService.loadBefore(recordType, recordId)
        : Promise.resolve(null);

    return new Observable((subscriber) => {
      next
        .handle()
        .pipe(
          tap((responseData: unknown) => {
            // After the handler resolves, write the audit entry.
            void beforeStatePromise.then((previousValues) => {
              const effectiveRecordId =
                recordId ??
                (responseData &&
                typeof responseData === 'object' &&
                'id' in responseData
                  ? String((responseData as Record<string, unknown>)['id'])
                  : 'unknown');

              const newValues =
                operation !== AuditOperation.DELETE &&
                responseData !== null &&
                typeof responseData === 'object'
                  ? (responseData as Record<string, unknown>)
                  : null;

              void this.auditService
                .log({
                  actorId: actorId ?? 'system',
                  operation,
                  recordType,
                  recordId: effectiveRecordId,
                  previousValues,
                  newValues,
                })
                .catch((err) => {
                  this.logger.error('Audit write failed (post-handler)', err);
                });
            });
          }),
          catchError((err: unknown) => {
            // On handler error we still attempt an audit write with null new values.
            void beforeStatePromise.then((previousValues) => {
              if (recordId) {
                void this.auditService
                  .log({
                    actorId: actorId ?? 'system',
                    operation,
                    recordType,
                    recordId,
                    previousValues,
                    newValues: null,
                  })
                  .catch((auditErr) => {
                    this.logger.error(
                      'Audit write failed (error path)',
                      auditErr,
                    );
                  });
              }
            });
            throw err;
          }),
        )
        .subscribe({
          next: (v) => subscriber.next(v),
          error: (e: unknown) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
    });
  }
}

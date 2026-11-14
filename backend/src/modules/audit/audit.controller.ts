import {
  Controller,
  Get,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AuditService } from './audit.service';
import { SearchAuditDto } from './dto/search-audit.dto';
import { AuditLog } from '../../entities/audit-log.entity';

/**
 * AuditController — Super Admin read access to the immutable audit log.
 *
 * Requirements: 15.3
 */
@Controller('audit')
@UseGuards(JwtAuthGuard, RbacGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * GET /audit
   * Search / filter audit log entries. Super Admin only.
   *
   * @param query  Optional filter and pagination parameters
   * @returns Paginated result: { data, total, page, limit }
   */
  @Get()
  @RequirePermission('audit_log', 'view')
  @UsePipes(new ValidationPipe({ transform: true }))
  async search(
    @Query() query: SearchAuditDto,
  ): Promise<{ data: AuditLog[]; total: number; page: number; limit: number }> {
    return this.auditService.search(query);
  }
}

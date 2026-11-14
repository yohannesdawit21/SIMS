import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../entities/audit-log.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

/**
 * AuditModule — provides AuditService for write-only audit log operations.
 * Exported so it can be consumed by the global AuditInterceptor.
 * Also exposes the read-only search endpoint for Super Admin (req 15.3).
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

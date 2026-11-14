import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Hostel } from '../../entities/hostel.entity';
import { HostelAllocation } from '../../entities/hostel-allocation.entity';
import { AuditModule } from '../audit/audit.module';
import { FeesModule } from '../fees/fees.module';
import { HostelService } from './hostel.service';
import { HostelController } from './hostel.controller';

/**
 * HostelModule — hostel room management, allocations, capacity enforcement,
 * and auto-fee creation on allocation.
 *
 * Requirements: 9.1–9.7
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Hostel, HostelAllocation]),
    AuditModule,
    FeesModule,
  ],
  providers: [HostelService],
  controllers: [HostelController],
  exports: [HostelService],
})
export class HostelModule {}

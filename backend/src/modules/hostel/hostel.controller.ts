import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';

import { HostelService } from './hostel.service';
import { CreateHostelDto } from './dto/create-hostel.dto';
import { CreateAllocationDto } from './dto/create-allocation.dto';
import { TerminateAllocationDto } from './dto/terminate-allocation.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/strategies/jwt.strategy';

/**
 * HostelController — hostel room management and allocation lifecycle.
 *
 * Routes:
 *  GET    /hostels                           — list all hostels
 *  POST   /hostels                           — create hostel room
 *  PATCH  /hostels/:id                       — update hostel room
 *  GET    /hostels/allocations               — list allocations (Admin or own)
 *  POST   /hostels/allocations               — create allocation
 *  PATCH  /hostels/allocations/:id/terminate — terminate allocation
 *  GET    /hostels/:id/occupancy             — get current occupancy count
 *
 * Requirements: 9.1–9.7
 */
@Controller('hostels')
export class HostelController {
  constructor(private readonly hostelService: HostelService) {}

  @Get()
  @RequirePermission('hostel_allocations', 'read')
  findAll() {
    return this.hostelService.findAllHostels();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('hostel_allocations', 'manage')
  create(
    @Body() dto: CreateHostelDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.hostelService.createHostel(dto, req.user!.id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('hostel_allocations', 'manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateHostelDto>,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.hostelService.updateHostel(id, dto, req.user!.id);
  }

  @Get(':id/occupancy')
  @RequirePermission('hostel_allocations', 'manage')
  async getOccupancy(@Param('id', ParseUUIDPipe) id: string) {
    const count = await this.hostelService.getOccupancyCount(id, new Date());
    return { hostel_id: id, current_occupancy: count };
  }

  // ---------------------------------------------------------------------------
  // Allocations
  // ---------------------------------------------------------------------------

  @Get('allocations')
  @RequirePermission('hostel_allocations', 'read')
  findAllocations(
    @Query('studentId') studentId: string | undefined,
    @Query('hostelId') hostelId: string | undefined,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    if (actor.role === 'student') {
      return this.hostelService.findStudentAllocations(actor.id);
    }
    return this.hostelService.findAllAllocations(studentId, hostelId);
  }

  @Post('allocations')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('hostel_allocations', 'manage')
  createAllocation(
    @Body() dto: CreateAllocationDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.hostelService.createAllocation(dto, req.user!.id);
  }

  @Patch('allocations/:id/terminate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('hostel_allocations', 'manage')
  terminateAllocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TerminateAllocationDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.hostelService.terminateAllocation(id, dto, req.user!.id);
  }
}

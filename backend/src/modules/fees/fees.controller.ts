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

import { FeesService } from './fees.service';
import { CreateFeeRecordDto } from './dto/create-fee-record.dto';
import { BatchTermFeeDto } from './dto/batch-term-fee.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { ApplyWaiverDto } from './dto/apply-waiver.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/strategies/jwt.strategy';

/**
 * FeesController — endpoints for fee records, payments, waivers, and balances.
 *
 * Routes:
 *  GET    /fees                       — list fee records (role-scoped)
 *  GET    /fees/categories            — list fee categories
 *  POST   /fees/categories            — create fee category (Super Admin)
 *  GET    /fees/balance/:studentId    — outstanding balance summary
 *  POST   /fees                       — create fee record (Admin Staff)
 *  GET    /fees/:id                   — get single fee record
 *  GET    /fees/:id/payments          — list payments for record
 *  POST   /fees/:id/payment           — record a payment
 *  PATCH  /fees/:id/waiver            — apply waiver
 *
 * Requirements: 7.1–7.10
 */
@Controller('fees')
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  @Get('categories')
  @RequirePermission('fees', 'read')
  findAllCategories() {
    return this.feesService.findAllCategories();
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('user_management', 'any') // Super Admin
  async createCategory(
    @Body('name') name: string,
    @Body('description') description: string | null,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.feesService.createCategory(name, description ?? null, req.user!.id);
  }

  @Get('balance/:studentId')
  @RequirePermission('fees_own', 'read')
  getBalance(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.feesService.getBalance(studentId);
  }

  @Get()
  @RequirePermission('fees_own', 'read')
  findAll(
    @Query('studentId') studentId: string | undefined,
    @Query('periodId') periodId: string | undefined,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    // Students can only see their own records
    const resolvedStudentId =
      actor.role === 'student' ? actor.id : studentId;
    return this.feesService.findAll(resolvedStudentId, periodId);
  }

  
  @Post('batch-invoice')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('fees', 'manage')
  generateBatchFees(
    @Body() dto: BatchTermFeeDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.feesService.generateBatchTermFees(dto, req.user!.id);
  }

  @Get('clearance/:studentId')
  @RequirePermission('fees_own', 'read')
  checkGraduationClearance(@Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.feesService.checkGraduationClearance(studentId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('fees', 'manage')
  create(
    @Body() dto: CreateFeeRecordDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.feesService.createFeeRecord(dto, req.user!.id);
  }

  @Get(':id')
  @RequirePermission('fees_own', 'read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.feesService.findOne(id);
  }

  @Get(':id/payments')
  @RequirePermission('fees_own', 'read')
  getPayments(@Param('id', ParseUUIDPipe) id: string) {
    return this.feesService.getPayments(id);
  }

  @Post(':id/payment')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('fees', 'manage')
  recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPaymentDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.feesService.recordPayment(id, dto, req.user!.id);
  }

  @Patch(':id/waiver')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('fees', 'manage')
  applyWaiver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyWaiverDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.feesService.applyWaiver(id, dto, req.user!.id);
  }
}

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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request as ExpressRequest } from 'express';

import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ReviewApplicationDto } from './dto/review-application.dto';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ApplicationStatus } from '../../entities/student-application.entity';
import type { AuthenticatedUser } from '../../common/strategies/jwt.strategy';

/**
 * ApplicationsController — manages new student applications.
 * 
 * Routes:
 *  POST   /applications                    – Submit new application (public)
 *  POST   /applications/:id/upload/:docType – Upload document (public)
 *  GET    /applications                    – List all applications (admin)
 *  GET    /applications/:id                – Get single application (admin)
 *  PATCH  /applications/:id/review         – Review/approve application (super admin)
 */
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  /**
   * POST /applications
   * Submit a new student application (public endpoint).
   */
  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createApplicationDto: CreateApplicationDto) {
    return this.applicationsService.create(createApplicationDto);
  }

  /**
   * POST /applications/:id/upload/:docType
   * Upload a document for an application (public endpoint).
   * Documents: transcript, national_id, birth_certificate, payment_receipt, photo, entrance_document
   */
  @Post(':id/upload/:docType')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('docType') docType: string,
    @UploadedFile() file: any,
  ) {
    const validTypes = [
      'transcript',
      'national_id',
      'birth_certificate',
      'payment_receipt',
      'photo',
      'entrance_document',
    ];

    if (!validTypes.includes(docType)) {
      throw new Error(`Invalid document type. Must be one of: ${validTypes.join(', ')}`);
    }

    return this.applicationsService.uploadDocument(
      id,
      docType as any,
      file.buffer,
      file.mimetype,
      file.size,
    );
  }

  /**
   * GET /applications
   * List all applications with optional status filtering.
   * Admin/Super Admin only.
   */
  @Get()
  @RequirePermission('user_management', 'any') // Super admin only
  async findAll(@Query('status') status?: ApplicationStatus) {
    return this.applicationsService.findAll(status);
  }

  /**
   * GET /applications/:id
   * Get a single application by ID.
   * Admin/Super Admin only.
   */
  @Get(':id')
  @RequirePermission('user_management', 'any')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.applicationsService.findOne(id);
  }

  /**
   * PATCH /applications/:id/review
   * Review an application (approve or reject).
   * On approval: automatically creates student account.
   * Super Admin only.
   */
  @Patch(':id/review')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('user_management', 'any')
  async review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() reviewApplicationDto: ReviewApplicationDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actorId = req.user!.id;
    return this.applicationsService.review(id, reviewApplicationDto, actorId);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
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
import * as Minio from 'minio';

import { PlacementService } from './placement.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { MINIO_CLIENT } from '../../common/providers/minio.provider';
import type { AuthenticatedUser } from '../../common/strategies/jwt.strategy';

/**
 * PlacementController — job listings and student applications.
 *
 * Routes:
 *  GET    /placement/listings           — list active listings (role-scoped)
 *  GET    /placement/listings/:id       — get single listing
 *  POST   /placement/listings           — create listing (Admin Staff)
 *  PATCH  /placement/listings/:id       — update listing (Admin Staff)
 *  PATCH  /placement/listings/:id/deactivate — deactivate (Admin Staff)
 *  GET    /placement/applications       — list applications
 *  POST   /placement/listings/:id/apply — apply with resume upload (Student)
 *
 * Requirements: 11.1–11.6
 */
@Controller('placement')
export class PlacementController {
  private readonly RESUME_BUCKET = 'resumes';
  private readonly MAX_SIZE = 5 * 1024 * 1024;

  constructor(
    private readonly placementService: PlacementService,
    @Inject(MINIO_CLIENT) private readonly minioClient: Minio.Client,
  ) {}

  @Get('listings')
  @RequirePermission('placement_listings', 'view')
  findListings(
    @Query('listingId') listingId: string | undefined,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    return this.placementService.findListings(actor.role, actor.id);
  }

  @Get('listings/:id')
  @RequirePermission('placement_listings', 'view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.placementService.findOneListing(id);
  }

  @Post('listings')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('placement_listings', 'manage')
  createListing(
    @Body() dto: CreateListingDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.placementService.createListing(dto, req.user!.id);
  }

  @Patch('listings/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('placement_listings', 'manage')
  updateListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateListingDto>,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.placementService.updateListing(id, dto, req.user!.id);
  }

  @Patch('listings/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('placement_listings', 'manage')
  deactivateListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.placementService.deactivateListing(id, req.user!.id);
  }

  @Get('applications')
  @RequirePermission('placement_listings', 'view')
  findApplications(
    @Query('listingId') listingId: string | undefined,
    @Query('studentId') studentId: string | undefined,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    const resolvedStudentId = actor.role === 'student' ? actor.id : studentId;
    return this.placementService.findApplications(listingId, resolvedStudentId);
  }

  /**
   * POST /placement/listings/:id/apply
   * Student uploads PDF resume (≤ 5 MB). Stored in MinIO, URL saved on application.
   * Requirements: 11.2
   */
  @Post('listings/:id/apply')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('placement_listings', 'view')
  @UseInterceptors(FileInterceptor('resume'))
  async applyToListing(
    @Param('id', ParseUUIDPipe) listingId: string,
    @UploadedFile() file: any,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    if (!file) {
      throw new BadRequestException('Resume file is required.');
    }
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Resume must be a PDF file.');
    }
    if (file.size > this.MAX_SIZE) {
      throw new BadRequestException('Resume must not exceed 5 MB.');
    }

    const actor = req.user!;
    const key = `${listingId}/${actor.id}/${Date.now()}.pdf`;

    // Ensure bucket exists
    const exists = await this.minioClient.bucketExists(this.RESUME_BUCKET);
    if (!exists) {
      await this.minioClient.makeBucket(this.RESUME_BUCKET, '');
    }

    await this.minioClient.putObject(
      this.RESUME_BUCKET,
      key,
      file.buffer,
      file.size,
      { 'Content-Type': 'application/pdf' },
    );

    const resumeUrl = `${this.RESUME_BUCKET}/${key}`;
    return this.placementService.applyToListing(listingId, actor.id, resumeUrl, actor.id);
  }
}

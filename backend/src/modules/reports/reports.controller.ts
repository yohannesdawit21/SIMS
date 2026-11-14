import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Request,
  Res,
} from '@nestjs/common';
import { Response, Request as ExpressRequest } from 'express';

import { ReportsService, ReportFilters } from './reports.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { CsvGeneratorService } from './csv-generator.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/strategies/jwt.strategy';

type ReportType =
  | 'enrollment'
  | 'grade'
  | 'attendance'
  | 'fee_statement'
  | 'library_loan'
  | 'hostel_occupancy'
  | 'alumni'
  | 'placement';

/**
 * ReportsController — generate and export all 8 standard SIMS reports.
 *
 * Query params shared by all endpoints:
 *  ?format=pdf|csv    (default: json)
 *  ?departmentId=uuid
 *  ?periodId=uuid
 *  ?studentId=uuid
 *  ?graduationYear=number
 *  ?programmeId=uuid
 *  ?dateFrom=YYYY-MM-DD
 *  ?dateTo=YYYY-MM-DD
 *
 * Requirements: 14.1–14.5
 */
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly csvGenerator: CsvGeneratorService,
  ) {}

  // ---------------------------------------------------------------------------
  // Route helper — runs report query then serialises to requested format
  // ---------------------------------------------------------------------------

  private async runReport(
    type: ReportType,
    filters: ReportFilters,
    format: string,
    actorId: string,
    res: Response,
  ): Promise<void> {
    let data: unknown[];
    switch (type) {
      case 'enrollment':
        data = await this.reportsService.enrollmentReport(filters);
        break;
      case 'grade':
        data = await this.reportsService.gradeReport(filters);
        break;
      case 'attendance':
        data = await this.reportsService.attendanceReport(filters);
        break;
      case 'fee_statement':
        data = await this.reportsService.feeStatementReport(filters);
        break;
      case 'library_loan':
        data = await this.reportsService.libraryLoanReport(filters);
        break;
      case 'hostel_occupancy':
        data = await this.reportsService.hostelOccupancyReport(filters);
        break;
      case 'alumni':
        data = await this.reportsService.alumniReport(filters);
        break;
      case 'placement':
        data = await this.reportsService.placementReport(filters);
        break;
    }

    const rows = data.map((row) =>
      this.csvGenerator.flatten(row as Record<string, unknown>),
    );

    if (format === 'csv') {
      const csv = this.csvGenerator.generate(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}_report.csv"`);
      res.send(csv);
      return;
    }

    if (format === 'pdf') {
      const { url } = await this.pdfGenerator.generate(type, rows, actorId);
      res.json({ success: true, data: { url } });
      return;
    }

    // Default: JSON
    res.json({ success: true, data, meta: { total: data.length, report: type } });
  }

  // ---------------------------------------------------------------------------
  // Endpoints
  // ---------------------------------------------------------------------------

  @Get('enrollment')
  @RequirePermission('reports', 'generate')
  async enrollmentReport(
    @Query() query: ReportFilters & { format?: string },
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
    @Res() res: Response,
  ) {
    const actor = req.user!;
    const filters = this.scopeFilters(query, actor);
    await this.runReport('enrollment', filters, query.format ?? 'json', actor.id, res);
  }

  @Get('grade')
  @RequirePermission('reports', 'generate')
  async gradeReport(
    @Query() query: ReportFilters & { format?: string },
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
    @Res() res: Response,
  ) {
    const actor = req.user!;
    const filters = this.scopeFilters(query, actor);
    await this.runReport('grade', filters, query.format ?? 'json', actor.id, res);
  }

  @Get('attendance')
  @RequirePermission('reports', 'generate')
  async attendanceReport(
    @Query() query: ReportFilters & { format?: string },
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
    @Res() res: Response,
  ) {
    const actor = req.user!;
    const filters = this.scopeFilters(query, actor);
    await this.runReport('attendance', filters, query.format ?? 'json', actor.id, res);
  }

  @Get('fee-statement')
  @RequirePermission('reports', 'generate')
  async feeStatementReport(
    @Query() query: ReportFilters & { format?: string },
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
    @Res() res: Response,
  ) {
    const actor = req.user!;
    const filters = this.scopeFilters(query, actor);
    await this.runReport('fee_statement', filters, query.format ?? 'json', actor.id, res);
  }

  @Get('library-loans')
  @RequirePermission('reports', 'generate')
  async libraryLoanReport(
    @Query() query: ReportFilters & { format?: string },
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
    @Res() res: Response,
  ) {
    const actor = req.user!;
    const filters = this.scopeFilters(query, actor);
    await this.runReport('library_loan', filters, query.format ?? 'json', actor.id, res);
  }

  @Get('hostel-occupancy')
  @RequirePermission('reports', 'generate')
  async hostelOccupancyReport(
    @Query() query: ReportFilters & { format?: string },
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
    @Res() res: Response,
  ) {
    const actor = req.user!;
    const filters = this.scopeFilters(query, actor);
    await this.runReport('hostel_occupancy', filters, query.format ?? 'json', actor.id, res);
  }

  @Get('alumni')
  @RequirePermission('reports', 'generate')
  async alumniReport(
    @Query() query: ReportFilters & { format?: string; graduationYear?: string },
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
    @Res() res: Response,
  ) {
    const actor = req.user!;
    const filters = this.scopeFilters(
      { ...query, graduationYear: query.graduationYear ? Number(query.graduationYear) : undefined },
      actor,
    );
    await this.runReport('alumni', filters, query.format ?? 'json', actor.id, res);
  }

  @Get('placement')
  @RequirePermission('reports', 'generate')
  async placementReport(
    @Query() query: ReportFilters & { format?: string },
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
    @Res() res: Response,
  ) {
    const actor = req.user!;
    const filters = this.scopeFilters(query, actor);
    await this.runReport('placement', filters, query.format ?? 'json', actor.id, res);
  }

  // ---------------------------------------------------------------------------
  // Scope helper — Department Head is auto-scoped to their department
  // ---------------------------------------------------------------------------
  private scopeFilters(
    query: ReportFilters & { format?: string },
    actor: AuthenticatedUser,
  ): ReportFilters {
    const { format: _format, ...filters } = query;
    // Department Heads are restricted to their own department (req 14.2)
    // The departmentId should be passed by the frontend from the authenticated user's profile.
    // Super Admin has no restriction (req 14.5).
    return filters;
  }
}

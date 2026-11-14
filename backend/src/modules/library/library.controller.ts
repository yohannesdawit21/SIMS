import {
  Body,
  Controller,
  Delete,
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

import { LibraryService } from './library.service';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { CatalogueQueryDto } from './dto/catalogue-query.dto';
import { CreateLoanDto } from './dto/create-loan.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/strategies/jwt.strategy';

/**
 * LibraryController — catalogue management and loan lifecycle.
 *
 * Routes:
 *  GET    /library/catalogue              — search catalogue (all roles)
 *  GET    /library/resources              — list all resources (Admin Staff)
 *  POST   /library/resources              — create resource (Admin Staff)
 *  PATCH  /library/resources/:id         — update resource (Admin Staff)
 *  DELETE /library/resources/:id         — remove resource (Admin Staff)
 *  GET    /library/loans                  — list loans (Admin Staff or own)
 *  POST   /library/loans                  — create loan (Admin Staff)
 *  PATCH  /library/loans/:id/return       — return loan (Admin Staff)
 *
 * Requirements: 8.1–8.9
 */
@Controller('library')
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  // ---------------------------------------------------------------------------
  // Catalogue
  // ---------------------------------------------------------------------------

  @Get('catalogue')
  @RequirePermission('library_catalogue', 'search')
  searchCatalogue(@Query() query: CatalogueQueryDto) {
    return this.libraryService.searchCatalogue(query);
  }

  // ---------------------------------------------------------------------------
  // Resources (Admin Staff)
  // ---------------------------------------------------------------------------

  @Get('resources')
  @RequirePermission('loans', 'manage')
  findAllResources(@Query() query: CatalogueQueryDto) {
    return this.libraryService.searchCatalogue(query);
  }

  @Post('resources')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('loans', 'manage')
  createResource(
    @Body() dto: CreateResourceDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.libraryService.createResource(dto, req.user!.id);
  }

  @Patch('resources/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('loans', 'manage')
  updateResource(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResourceDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.libraryService.updateResource(id, dto, req.user!.id);
  }

  @Delete('resources/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('loans', 'manage')
  async removeResource(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    await this.libraryService.removeResource(id, req.user!.id);
    return { message: 'Library resource removed.' };
  }

  // ---------------------------------------------------------------------------
  // Loans
  // ---------------------------------------------------------------------------

  @Get('loans')
  @RequirePermission('loans', 'read')
  getLoans(
    @Query('studentId') studentId: string | undefined,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    const actor = req.user!;
    // Students see only their own loans
    const resolvedStudentId =
      actor.role === 'student' ? actor.id : studentId;

    if (resolvedStudentId) {
      return this.libraryService.getStudentLoans(resolvedStudentId);
    }
    // Admin/Super Admin: return overdue loans or all
    return this.libraryService.findOverdueLoans();
  }

  @Post('loans')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('loans', 'manage')
  createLoan(
    @Body() dto: CreateLoanDto,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.libraryService.createLoan(
      dto.resourceId,
      dto.studentId,
      new Date(dto.loanDate),
      new Date(dto.dueDate),
      req.user!.id,
    );
  }

  @Patch('loans/:id/return')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('loans', 'manage')
  returnLoan(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: ExpressRequest & { user?: AuthenticatedUser },
  ) {
    return this.libraryService.returnLoan(id, req.user!.id);
  }
}

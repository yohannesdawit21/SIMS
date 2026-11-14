import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';

import { LibraryResource } from '../../entities/library-resource.entity';
import { LibraryLoan } from '../../entities/library-loan.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { AuditService } from '../audit/audit.service';
import { AuditOperation } from '../../entities/audit-log.entity';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { CatalogueQueryDto } from './dto/catalogue-query.dto';

/**
 * LibraryService — manages the library catalogue and student loan lifecycle.
 *
 * Key behaviours:
 *  - createResource / updateResource / removeResource: CRUD for library_resources
 *  - createLoan: records a new loan, decrements available_copies, enforces 409 if zero
 *  - returnLoan: marks loan returned, increments available_copies
 *  - searchCatalogue: ILIKE search by title, author, category
 *  - getStudentLoans: active and historical loans for a student
 *  - findOverdueLoans: loans past due_date that have not been returned
 *
 * Requirements: 8.1–8.9
 */
@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);

  constructor(
    @InjectRepository(LibraryResource)
    private readonly resourceRepository: Repository<LibraryResource>,

    @InjectRepository(LibraryLoan)
    private readonly loanRepository: Repository<LibraryLoan>,

    private readonly auditService: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Resource management
  // ---------------------------------------------------------------------------

  /**
   * Create a new library resource record.
   * Requirements: 8.1
   */
  async createResource(
    dto: CreateResourceDto,
    actorId: string,
  ): Promise<LibraryResource> {
    const totalCopies = dto.total_copies ?? 1;
    const availableCopies =
      dto.available_copies !== undefined ? dto.available_copies : totalCopies;

    const resource = this.resourceRepository.create({
      title: dto.title,
      authors: dto.authors ?? null,
      isbn_or_accession: dto.isbn_or_accession,
      category: dto.category ?? null,
      total_copies: totalCopies,
      available_copies: availableCopies,
    });

    const saved = await this.resourceRepository.save(resource);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'library_resources',
      recordId: saved.id,
      newValues: {
        title: saved.title,
        isbn_or_accession: saved.isbn_or_accession,
        total_copies: saved.total_copies,
        available_copies: saved.available_copies,
      },
    });

    this.logger.log(`Library resource created: ${saved.id} by actor ${actorId}`);
    return saved;
  }

  /**
   * Update an existing library resource.
   * Requirements: 8.1
   */
  async updateResource(
    id: string,
    dto: UpdateResourceDto,
    actorId: string,
  ): Promise<LibraryResource> {
    const resource = await this.resourceRepository.findOne({ where: { id } });
    if (!resource) {
      throw new NotFoundException(`Library resource with id "${id}" not found.`);
    }

    const previousValues: Record<string, unknown> = {
      title: resource.title,
      authors: resource.authors,
      isbn_or_accession: resource.isbn_or_accession,
      category: resource.category,
      total_copies: resource.total_copies,
      available_copies: resource.available_copies,
    };

    if (dto.title !== undefined) resource.title = dto.title;
    if (dto.authors !== undefined) resource.authors = dto.authors;
    if (dto.isbn_or_accession !== undefined)
      resource.isbn_or_accession = dto.isbn_or_accession;
    if (dto.category !== undefined) resource.category = dto.category;
    if (dto.total_copies !== undefined) resource.total_copies = dto.total_copies;
    if (dto.available_copies !== undefined)
      resource.available_copies = dto.available_copies;

    const updated = await this.resourceRepository.save(resource);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'library_resources',
      recordId: id,
      previousValues,
      newValues: { ...dto },
    });

    this.logger.log(`Library resource ${id} updated by actor ${actorId}`);
    return updated;
  }

  /**
   * Hard-delete a library resource.
   * Requirements: 8.1
   */
  async removeResource(id: string, actorId: string): Promise<{ message: string }> {
    const resource = await this.resourceRepository.findOne({ where: { id } });
    if (!resource) {
      throw new NotFoundException(`Library resource with id "${id}" not found.`);
    }

    await this.resourceRepository.delete(id);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.DELETE,
      recordType: 'library_resources',
      recordId: id,
      previousValues: {
        title: resource.title,
        isbn_or_accession: resource.isbn_or_accession,
      },
    });

    this.logger.log(`Library resource ${id} deleted by actor ${actorId}`);
    return { message: 'Library resource deleted successfully.' };
  }

  // ---------------------------------------------------------------------------
  // Loan management
  // ---------------------------------------------------------------------------

  /**
   * Record a new loan.
   *  - Throws 409 LIBRARY_NO_COPIES if available_copies === 0.
   *  - Inserts library_loans row.
   *  - Decrements available_copies by 1.
   *  - Writes audit log.
   *
   * Requirements: 8.2, 8.3, 8.9
   */
  async createLoan(
    resourceId: string,
    studentId: string,
    loanDate: Date,
    dueDate: Date,
    actorId: string,
  ): Promise<LibraryLoan> {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });
    if (!resource) {
      throw new NotFoundException(
        `Library resource with id "${resourceId}" not found.`,
      );
    }

    if (resource.available_copies <= 0) {
      throw new ConflictException({
        statusCode: 409,
        error: 'LIBRARY_NO_COPIES',
        message:
          'No available copies of this resource. Cannot create a new loan.',
      });
    }

    // Resolve StudentProfile ID if studentId is a User.id
    const effectiveStudentId = await this.resolveStudentProfileId(studentId);

    // Insert the loan record
    const loan = this.loanRepository.create({
      resource_id: resourceId,
      student_id: effectiveStudentId,
      loan_date: loanDate,
      due_date: dueDate,
      is_returned: false,
      returned_date: null,
    });
    const savedLoan = await this.loanRepository.save(loan);

    // Decrement available_copies
    await this.resourceRepository.decrement(
      { id: resourceId },
      'available_copies',
      1,
    );

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'library_loans',
      recordId: savedLoan.id,
      newValues: {
        resource_id: resourceId,
        student_id: studentId,
        loan_date: loanDate,
        due_date: dueDate,
      },
    });

    this.logger.log(
      `Loan created: ${savedLoan.id} for student ${studentId} by actor ${actorId}`,
    );
    return savedLoan;
  }

  /**
   * Mark a loan as returned.
   *  - Sets is_returned = true, returned_date = NOW().
   *  - Increments available_copies by 1.
   *  - Writes audit log.
   *
   * Requirements: 8.4
   */
  async returnLoan(loanId: string, actorId: string): Promise<LibraryLoan> {
    const loan = await this.loanRepository.findOne({
      where: { id: loanId },
    });
    if (!loan) {
      throw new NotFoundException(`Loan with id "${loanId}" not found.`);
    }

    if (loan.is_returned) {
      // Idempotent — return the existing record without error
      return loan;
    }

    const previousValues = {
      is_returned: loan.is_returned,
      returned_date: loan.returned_date,
    };

    loan.is_returned = true;
    loan.returned_date = new Date();
    const updated = await this.loanRepository.save(loan);

    // Increment available_copies on the parent resource
    await this.resourceRepository.increment(
      { id: loan.resource_id },
      'available_copies',
      1,
    );

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'library_loans',
      recordId: loanId,
      previousValues,
      newValues: {
        is_returned: true,
        returned_date: updated.returned_date,
        event: 'LOAN_RETURNED',
      },
    });

    this.logger.log(`Loan ${loanId} returned by actor ${actorId}`);
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Catalogue search
  // ---------------------------------------------------------------------------

  /**
   * ILIKE search of the library catalogue by title, author, and/or category.
   * Requirements: 8.6
   */
  async searchCatalogue(query: CatalogueQueryDto): Promise<LibraryResource[]> {
    const qb = this.resourceRepository.createQueryBuilder('r');

    if (query.title) {
      qb.andWhere('r.title ILIKE :title', { title: `%${query.title}%` });
    }
    if (query.author) {
      qb.andWhere('r.authors ILIKE :author', { author: `%${query.author}%` });
    }
    if (query.category) {
      qb.andWhere('r.category ILIKE :category', {
        category: `%${query.category}%`,
      });
    }

    qb.orderBy('r.title', 'ASC');

    return qb.getMany();
  }

  // ---------------------------------------------------------------------------
  // Student loan history
  // ---------------------------------------------------------------------------

  private async resolveStudentProfileId(idOrUserId: string): Promise<string> {
    const profile = await this.loanRepository.manager
      .getRepository(StudentProfile)
      .findOne({ where: [{ id: idOrUserId }, { user_id: idOrUserId }] });
    return profile ? profile.id : idOrUserId;
  }

  /**
   * Return all active and historical loans for a student.
   * Requirements: 8.7
   */
  async getStudentLoans(studentId: string): Promise<LibraryLoan[]> {
    const effectiveStudentId = await this.resolveStudentProfileId(studentId);
    return this.loanRepository.find({
      where: { student_id: effectiveStudentId },
      relations: ['resource'],
      order: { created_at: 'DESC' },
    });
  }

  // ---------------------------------------------------------------------------
  // Overdue detection
  // ---------------------------------------------------------------------------

  /**
   * Return all loans where due_date < NOW() and is_returned = false.
   * Requirements: 8.5
   */
  async findOverdueLoans(): Promise<LibraryLoan[]> {
    return this.loanRepository.find({
      where: {
        is_returned: false,
        due_date: LessThan(new Date()),
      },
      relations: ['resource', 'student'],
      order: { due_date: 'ASC' },
    });
  }
}

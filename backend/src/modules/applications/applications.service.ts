import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Minio from 'minio';

import {
  StudentApplication,
  ApplicationStatus,
} from '../../entities/student-application.entity';
import { Programme } from '../../entities/programme.entity';
import { MINIO_CLIENT } from '../../common/providers/minio.provider';
import { AuditService } from '../audit/audit.service';
import { AuditOperation } from '../../entities/audit-log.entity';
import { StudentsService } from '../students/students.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ReviewApplicationDto } from './dto/review-application.dto';

const APPLICATION_DOCS_BUCKET = 'application-documents';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
] as const;

/**
 * ApplicationsService — manages new student applications.
 * 
 * Features:
 *  - Students submit applications with document uploads
 *  - Super admin reviews and approves/rejects
 *  - On approval: auto-creates student account with credentials
 *  - Stores all documents in MinIO
 */
@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    @InjectRepository(StudentApplication)
    private readonly applicationRepository: Repository<StudentApplication>,

    @InjectRepository(Programme)
    private readonly programmeRepository: Repository<Programme>,

    @Inject(MINIO_CLIENT)
    private readonly minioClient: Minio.Client,

    private readonly auditService: AuditService,
    private readonly studentsService: StudentsService,
  ) {}

  /**
   * Create a new student application.
   * Documents are uploaded separately via uploadDocument method.
   */
  async create(dto: CreateApplicationDto): Promise<StudentApplication> {
    // Check for duplicate national ID
    const existing = await this.applicationRepository.findOne({
      where: { national_id: dto.national_id },
    });
    if (existing) {
      if (existing.status === ApplicationStatus.PENDING || existing.status === ApplicationStatus.UNDER_REVIEW) {
        throw new ConflictException(
          'An application with this national ID is already pending review.',
        );
      }
      if (existing.status === ApplicationStatus.APPROVED) {
        throw new ConflictException(
          'An application with this national ID has already been approved. Contact admin if you need assistance.',
        );
      }
      // If rejected, allow reapplication
    }

    // Verify programme exists
    const programme = await this.programmeRepository.findOne({
      where: { id: dto.preferred_programme_id },
    });
    if (!programme) {
      throw new NotFoundException(
        `Programme with id "${dto.preferred_programme_id}" not found.`,
      );
    }

    // Create application
    const application = this.applicationRepository.create({
      ...dto,
      date_of_birth: new Date(dto.date_of_birth),
      status: ApplicationStatus.PENDING,
    });

    const saved = await this.applicationRepository.save(application);

    await this.auditService.log({
      actorId: 'SYSTEM', // Public endpoint
      operation: AuditOperation.CREATE,
      recordType: 'student_applications',
      recordId: saved.id,
      newValues: {
        national_id: saved.national_id,
        email: saved.email,
        preferred_programme_id: saved.preferred_programme_id,
        status: saved.status,
      },
    });

    this.logger.log(`Application created: ${saved.id} for ${saved.full_legal_name}`);

    return saved;
  }

  /**
   * Upload a document for an application.
   * Stores in MinIO under application-documents/{applicationId}/{docType}.{ext}
   */
  async uploadDocument(
    applicationId: string,
    docType: 'transcript' | 'national_id' | 'birth_certificate' | 'payment_receipt' | 'photo' | 'entrance_document',
    buffer: Buffer,
    mimeType: string,
    size: number,
  ): Promise<StudentApplication> {
    // Validate file
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw new BadRequestException(
        'Invalid file type. Only PDF, JPEG, and PNG are allowed.',
      );
    }

    if (size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds 5 MB limit (received ${size} bytes).`,
      );
    }

    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
    });
    if (!application) {
      throw new NotFoundException(`Application with id "${applicationId}" not found.`);
    }

    // Determine file extension
    const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType.split('/')[1];
    const objectKey = `${applicationId}/${docType}.${ext}`;

    // Ensure bucket exists
    await this.ensureBucketExists(APPLICATION_DOCS_BUCKET);

    // Upload to MinIO
    await this.minioClient.putObject(
      APPLICATION_DOCS_BUCKET,
      objectKey,
      buffer,
      size,
      { 'Content-Type': mimeType },
    );

    const documentUrl = `${APPLICATION_DOCS_BUCKET}/${objectKey}`;

    // Update application with document URL
    const urlField = `${docType}_url`;
    (application as any)[urlField] = documentUrl;

    const updated = await this.applicationRepository.save(application);

    this.logger.log(
      `Document uploaded for application ${applicationId}: ${docType}`,
    );

    return updated;
  }

  /**
   * List all applications with optional status filtering.
   */
  async findAll(status?: ApplicationStatus): Promise<StudentApplication[]> {
    const qb = this.applicationRepository
      .createQueryBuilder('app')
      .leftJoinAndSelect('app.preferredProgramme', 'programme')
      .leftJoinAndSelect('app.reviewer', 'reviewer');

    if (status) {
      qb.where('app.status = :status', { status });
    }

    qb.orderBy('app.created_at', 'DESC');

    return qb.getMany();
  }

  /**
   * Get a single application by ID.
   */
  async findOne(id: string): Promise<StudentApplication> {
    const application = await this.applicationRepository.findOne({
      where: { id },
      relations: ['preferredProgramme', 'reviewer'],
    });

    if (!application) {
      throw new NotFoundException(`Application with id "${id}" not found.`);
    }

    return application;
  }

  /**
   * Review an application (approve or reject).
   * On approval: automatically creates student account.
   */
  async review(
    id: string,
    dto: ReviewApplicationDto,
    actorId: string,
  ): Promise<{
    application: StudentApplication;
    studentCredentials?: { username: string; password: string; student_number?: string };
  }> {
    const application = await this.applicationRepository.findOne({
      where: { id },
      relations: ['preferredProgramme'],
    });

    if (!application) {
      throw new NotFoundException(`Application with id "${id}" not found.`);
    }

    if (application.status === ApplicationStatus.APPROVED) {
      throw new BadRequestException('This application has already been approved.');
    }

    if (application.status === ApplicationStatus.REJECTED && dto.status !== ApplicationStatus.APPROVED) {
      throw new BadRequestException('This application has already been rejected.');
    }

    // Update application status
    application.status = dto.status;
    application.reviewed_by = actorId;
    application.reviewed_at = new Date();
    application.review_notes = dto.review_notes || null;

    if (dto.status === ApplicationStatus.REJECTED) {
      application.rejection_reason = dto.rejection_reason || null;
    }

    const saved = await this.applicationRepository.save(application);

    // Audit log
    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'student_applications',
      recordId: id,
      previousValues: { status: ApplicationStatus.PENDING },
      newValues: {
        status: dto.status,
        reviewed_by: actorId,
        reviewed_at: saved.reviewed_at?.toISOString(),
      },
    });

    this.logger.log(
      `Application ${id} ${dto.status} by actor ${actorId}`,
    );

    // If approved, create student account
    if (dto.status === ApplicationStatus.APPROVED) {
      try {
        const studentResult = await this.studentsService.create(
          {
            email: application.email,
            full_legal_name: application.full_legal_name,
            date_of_birth: application.date_of_birth.toISOString().split('T')[0],
            gender: application.gender || undefined,
            national_id: application.national_id,
            phone: application.phone,
            personal_email: application.email,
            home_address: application.home_address,
            programme_id: application.preferred_programme_id,
            year_of_entry: application.year_of_entry,
          },
          actorId,
        );

        // Update application with created student ID
        application.created_student_id = studentResult.id;
        await this.applicationRepository.save(application);

        this.logger.log(
          `Student account created for application ${id}: ${studentResult.student_number}`,
        );

        return {
          application: saved,
          studentCredentials: {
            username: studentResult.user.username,
            password: studentResult.temporary_password,
            student_number: studentResult.student_number,
          },
        };
      } catch (error) {
        this.logger.error(
          `Failed to create student account for application ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw new BadRequestException(
          'Application approved but failed to create student account. Please create manually.',
        );
      }
    }

    return { application: saved };
  }

  /**
   * Private helper: Ensure MinIO bucket exists.
   */
  private async ensureBucketExists(bucketName: string): Promise<void> {
    try {
      const exists = await this.minioClient.bucketExists(bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(bucketName, 'us-east-1');
        this.logger.log(`MinIO bucket "${bucketName}" created.`);
      }
    } catch (err) {
      this.logger.warn(
        `Could not verify/create MinIO bucket "${bucketName}": ${String(err)}`,
      );
    }
  }
}

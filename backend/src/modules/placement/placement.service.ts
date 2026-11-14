import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { JobListing } from '../../entities/job-listing.entity';
import { JobListingProgramme } from '../../entities/job-listing-programme.entity';
import { JobApplication } from '../../entities/job-application.entity';
import { Enrollment } from '../../entities/enrollment.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { AuditService } from '../audit/audit.service';
import { AuditOperation } from '../../entities/audit-log.entity';
import { NotificationService } from '../notifications/notification.service';
import { CreateListingDto } from './dto/create-listing.dto';

/**
 * PlacementService — job/internship listings and student applications.
 *
 * Key behaviours:
 *  - createListing(): Admin Staff creates listing; notifies eligible enrolled students
 *  - applyToListing(): Student uploads resume PDF (≤5 MB) stored in MinIO, inserts application
 *  - findListings(): role-scoped; Student sees only listings for their programme
 *
 * Requirements: 11.1–11.6
 */
@Injectable()
export class PlacementService {
  private readonly logger = new Logger(PlacementService.name);

  private readonly MAX_RESUME_SIZE = 5 * 1024 * 1024; // 5 MB

  constructor(
    @InjectRepository(JobListing)
    private readonly listingRepository: Repository<JobListing>,

    @InjectRepository(JobListingProgramme)
    private readonly listingProgrammeRepository: Repository<JobListingProgramme>,

    @InjectRepository(JobApplication)
    private readonly applicationRepository: Repository<JobApplication>,

    @InjectRepository(Enrollment)
    private readonly enrollmentRepository: Repository<Enrollment>,

    @InjectRepository(StudentProfile)
    private readonly studentProfileRepository: Repository<StudentProfile>,

    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  // ---------------------------------------------------------------------------
  // Listings
  // ---------------------------------------------------------------------------

  /**
   * Create a job/internship listing and notify eligible students.
   * Requirements: 11.1, 11.3
   */
  async createListing(dto: CreateListingDto, actorId: string): Promise<JobListing> {
    const listing = this.listingRepository.create({
      employer_name: dto.employer_name,
      position_title: dto.position_title,
      description: dto.description ?? null,
      deadline: dto.deadline as unknown as Date,
      is_active: true,
    });
    const saved = await this.listingRepository.save(listing);

    // Link eligible programmes
    if (dto.programme_ids.length > 0) {
      const links = dto.programme_ids.map((pid) =>
        this.listingProgrammeRepository.create({
          listing_id: saved.id,
          programme_id: pid,
        }),
      );
      await this.listingProgrammeRepository.save(links);
    }

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'job_listings',
      recordId: saved.id,
      newValues: {
        employer_name: saved.employer_name,
        position_title: saved.position_title,
        deadline: saved.deadline,
        programme_ids: dto.programme_ids,
      },
    });

    // Notify enrolled students in eligible programmes (req 11.3)
    if (dto.programme_ids.length > 0) {
      await this.notifyEligibleStudents(saved, dto.programme_ids);
    }

    this.logger.log(`Job listing created: ${saved.id} by actor ${actorId}`);
    return saved;
  }

  async updateListing(
    id: string,
    dto: Partial<CreateListingDto>,
    actorId: string,
  ): Promise<JobListing> {
    const listing = await this.findListingOrFail(id);
    const prev = { employer_name: listing.employer_name, position_title: listing.position_title };
    Object.assign(listing, {
      employer_name: dto.employer_name ?? listing.employer_name,
      position_title: dto.position_title ?? listing.position_title,
      description: dto.description ?? listing.description,
      deadline: dto.deadline ? (dto.deadline as unknown as Date) : listing.deadline,
    });
    const saved = await this.listingRepository.save(listing);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.UPDATE,
      recordType: 'job_listings',
      recordId: id,
      previousValues: prev,
      newValues: dto as Record<string, unknown>,
    });

    return saved;
  }

  async deactivateListing(id: string, actorId: string): Promise<JobListing> {
    const listing = await this.findListingOrFail(id);
    listing.is_active = false;
    return this.listingRepository.save(listing);
  }

  /**
   * List active listings. Students see only listings matching their programme.
   * Requirements: 11.2
   */
  async findListings(role: string, studentId?: string): Promise<JobListing[]> {
    const qb = this.listingRepository
      .createQueryBuilder('jl')
      .leftJoinAndSelect('jl.listingProgrammes', 'lp')
      .where('jl.is_active = true');

    if (role === 'student' && studentId) {
      const student = await this.studentProfileRepository.findOne({
        where: { user_id: studentId },
      });
      if (student?.programme_id) {
        qb.andWhere(
          'lp.programme_id = :programmeId',
          { programmeId: student.programme_id },
        );
      }
    }

    return qb.orderBy('jl.created_at', 'DESC').getMany();
  }

  async findOneListing(id: string): Promise<JobListing> {
    return this.findListingOrFail(id);
  }

  // ---------------------------------------------------------------------------
  // Applications
  // ---------------------------------------------------------------------------

  /**
   * Submit a job application with a PDF resume stored in MinIO.
   * Requirements: 11.2
   */
  async applyToListing(
    listingId: string,
    studentId: string,
    resumeUrl: string,
    actorId: string,
  ): Promise<JobApplication> {
    await this.findListingOrFail(listingId);

    // Resolve StudentProfile.id if studentId is a user_id
    const studentProfile = await this.studentProfileRepository.findOne({
      where: [{ id: studentId }, { user_id: studentId }],
    });
    if (!studentProfile) {
      throw new NotFoundException('Student profile not found.');
    }
    const resolvedStudentId = studentProfile.id;

    // Enforce unique application per student+listing
    const existing = await this.applicationRepository.findOne({
      where: { listing_id: listingId, student_id: resolvedStudentId },
    });
    if (existing) {
      throw new ConflictException({
        code: 'APPLICATION_ALREADY_EXISTS',
        message: 'You have already applied to this listing.',
      });
    }

    const application = this.applicationRepository.create({
      listing_id: listingId,
      student_id: resolvedStudentId,
      resume_url: resumeUrl,
    });
    const saved = await this.applicationRepository.save(application);

    await this.auditService.log({
      actorId,
      operation: AuditOperation.CREATE,
      recordType: 'job_applications',
      recordId: saved.id,
      newValues: { listing_id: listingId, student_id: resolvedStudentId },
    });

    this.logger.log(`Application created: ${saved.id} for listing ${listingId}`);
    return saved;
  }

  async findApplications(listingId?: string, studentId?: string): Promise<JobApplication[]> {
    const where: Record<string, unknown> = {};
    if (listingId) where['listing_id'] = listingId;
    if (studentId) {
      const studentProfile = await this.studentProfileRepository.findOne({
        where: [{ id: studentId }, { user_id: studentId }],
      });
      where['student_id'] = studentProfile ? studentProfile.id : studentId;
    }
    return this.applicationRepository.find({
      where,
      relations: ['listing', 'student'],
      order: { applied_at: 'DESC' },
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async findListingOrFail(id: string): Promise<JobListing> {
    const listing = await this.listingRepository.findOne({
      where: { id },
      relations: ['listingProgrammes'],
    });
    if (!listing) {
      throw new NotFoundException(`Job listing "${id}" not found.`);
    }
    return listing;
  }

  /**
   * Notify all currently enrolled students in the given programmes.
   * Requirements: 11.3
   */
  private async notifyEligibleStudents(
    listing: JobListing,
    programmeIds: string[],
  ): Promise<void> {
    // Find students enrolled in any course belonging to the eligible programmes
    const students = await this.studentProfileRepository
      .createQueryBuilder('sp')
      .innerJoin('sp.programme', 'prog')
      .where('prog.id IN (:...programmeIds)', { programmeIds })
      .andWhere("sp.status = 'active'")
      .getMany();

    const studentIds = students.map((s) => s.user_id);
    if (studentIds.length === 0) return;

    const payload = {
      listing_id: listing.id,
      employer_name: listing.employer_name,
      position_title: listing.position_title,
      deadline: listing.deadline,
    };

    await this.notificationService.enqueueBulk(
      studentIds,
      'job_listing_published',
      'email',
      'job_listing_published',
      payload,
    );
  }
}

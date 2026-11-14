import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Programme } from './programme.entity';
import { User } from './user.entity';

export enum ApplicationStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity({ name: 'student_applications' })
export class StudentApplication {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Personal Information
  @Column({ type: 'varchar', length: 255, name: 'full_legal_name' })
  full_legal_name!: string;

  @Column({ type: 'date', name: 'date_of_birth' })
  date_of_birth!: Date;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender!: string | null;

  @Column({ type: 'varchar', length: 100, unique: true, name: 'national_id' })
  national_id!: string;

  @Column({ type: 'varchar', length: 30 })
  phone!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'text', name: 'home_address' })
  home_address!: string;

  // Educational Background
  @Column({ type: 'varchar', length: 255, name: 'previous_school' })
  previous_school!: string;

  @Column({ type: 'varchar', length: 100, name: 'previous_school_graduation_year' })
  previous_school_graduation_year!: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'previous_grade_gpa' })
  previous_grade_gpa!: string | null;

  // Emergency Contact
  @Column({ type: 'varchar', length: 255, name: 'emergency_contact_name' })
  emergency_contact_name!: string;

  @Column({ type: 'varchar', length: 30, name: 'emergency_contact_phone' })
  emergency_contact_phone!: string;

  // Parent/Guardian Information
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'parent_guardian_name' })
  parent_guardian_name!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true, name: 'parent_guardian_phone' })
  parent_guardian_phone!: string | null;

  // Program Selection
  @Column({ type: 'uuid', name: 'preferred_programme_id' })
  preferred_programme_id!: string;

  @ManyToOne(() => Programme)
  @JoinColumn({ name: 'preferred_programme_id' })
  preferredProgramme!: Programme;

  @Column({ type: 'int', name: 'year_of_entry' })
  year_of_entry!: number;

  // Document URLs (stored in MinIO)
  @Column({ type: 'varchar', length: 500, nullable: true, name: 'transcript_url' })
  transcript_url!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'national_id_copy_url' })
  national_id_copy_url!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'birth_certificate_url' })
  birth_certificate_url!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'payment_receipt_url' })
  payment_receipt_url!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'photo_url' })
  photo_url!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'entrance_document_url' })
  entrance_document_url!: string | null;

  // Application Status
  @Column({
    type: 'varchar',
    length: 30,
    default: ApplicationStatus.PENDING,
    enum: ApplicationStatus,
  })
  status!: ApplicationStatus;

  @Column({ type: 'uuid', nullable: true, name: 'reviewed_by' })
  reviewed_by!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer!: User | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'reviewed_at' })
  reviewed_at!: Date | null;

  @Column({ type: 'text', nullable: true, name: 'review_notes' })
  review_notes!: string | null;

  @Column({ type: 'text', nullable: true, name: 'rejection_reason' })
  rejection_reason!: string | null;

  // Created Student (after approval)
  @Column({ type: 'uuid', nullable: true, name: 'created_student_id' })
  created_student_id!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at!: Date;
}

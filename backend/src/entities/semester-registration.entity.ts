import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { StudentProfile } from './student-profile.entity';
import { AcademicPeriod } from './academic-period.entity';
import { User } from './user.entity';

@Entity({ name: 'semester_registrations' })
@Unique(['student_id', 'academic_period_id'])
export class SemesterRegistration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  student_id!: string;

  @Column({ type: 'uuid', name: 'academic_period_id' })
  academic_period_id!: string;

  @Column({ 
    type: 'varchar', 
    length: 50, 
    default: 'pending',
    comment: 'pending, approved, rejected, blocked' 
  })
  status!: string;

  // Eligibility checks
  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true, name: 'gpa_at_registration' })
  gpa_at_registration!: number | null;

  @Column({ type: 'boolean', default: false, name: 'has_discipline_block' })
  has_discipline_block!: boolean;

  @Column({ type: 'boolean', default: false, name: 'gpa_warning' })
  gpa_warning!: boolean; // true if GPA 1.80-2.00

  @Column({ type: 'boolean', default: false, name: 'gpa_block' })
  gpa_block!: boolean; // true if GPA < 1.80

  // Override by admin
  @Column({ type: 'boolean', default: false, name: 'admin_override' })
  admin_override!: boolean;

  @Column({ type: 'uuid', name: 'overridden_by_id', nullable: true })
  overridden_by_id!: string | null;

  @Column({ type: 'text', name: 'override_reason', nullable: true })
  override_reason!: string | null;

  // Block/rejection details
  @Column({ type: 'text', name: 'block_reason', nullable: true })
  block_reason!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'registered_at' })
  registered_at!: Date;

  @Column({ type: 'timestamptz', name: 'approved_at', nullable: true })
  approved_at!: Date | null;

  // Relations
  @ManyToOne(() => StudentProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: StudentProfile;

  @ManyToOne(() => AcademicPeriod, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_period_id' })
  academicPeriod!: AcademicPeriod;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'overridden_by_id' })
  overriddenBy!: User | null;
}

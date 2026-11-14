import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { JobListing } from './job-listing.entity';
import { StudentProfile } from './student-profile.entity';

@Entity({ name: 'job_applications' })
@Unique(['listing_id', 'student_id'])
export class JobApplication {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'listing_id' })
  listing_id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  student_id!: string;

  @Column({ type: 'varchar', length: 500, name: 'resume_url' })
  resume_url!: string;

  @ManyToOne(() => JobListing, (listing) => listing.applications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing!: JobListing;

  @ManyToOne(() => StudentProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: StudentProfile;

  @CreateDateColumn({ type: 'timestamptz', name: 'applied_at' })
  applied_at!: Date;
}

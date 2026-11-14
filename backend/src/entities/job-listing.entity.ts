import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { JobListingProgramme } from './job-listing-programme.entity';
import { JobApplication } from './job-application.entity';

@Entity({ name: 'job_listings' })
export class JobListing {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, name: 'employer_name' })
  employer_name!: string;

  @Column({ type: 'varchar', length: 255, name: 'position_title' })
  position_title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'date', name: 'deadline' })
  deadline!: Date;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  is_active!: boolean;

  @OneToMany(() => JobListingProgramme, (jlp) => jlp.listing)
  listingProgrammes!: JobListingProgramme[];

  @OneToMany(() => JobApplication, (app) => app.listing)
  applications!: JobApplication[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;
}

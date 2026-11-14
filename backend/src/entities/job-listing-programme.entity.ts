import {
  Entity,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { JobListing } from './job-listing.entity';
import { Programme } from './programme.entity';

@Entity({ name: 'job_listing_programmes' })
export class JobListingProgramme {
  @PrimaryColumn({ type: 'uuid', name: 'listing_id' })
  listing_id!: string;

  @PrimaryColumn({ type: 'uuid', name: 'programme_id' })
  programme_id!: string;

  @ManyToOne(() => JobListing, (listing) => listing.listingProgrammes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing!: JobListing;

  @ManyToOne(() => Programme, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'programme_id' })
  programme!: Programme;
}

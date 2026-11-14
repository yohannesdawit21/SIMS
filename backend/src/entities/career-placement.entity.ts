import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Alumni } from './alumni.entity';

export enum PlacementType {
  JOB = 'job',
  INTERNSHIP = 'internship',
}

@Entity({ name: 'career_placements' })
export class CareerPlacement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'alumni_id' })
  alumni_id!: string;

  @Column({ type: 'varchar', length: 255, name: 'employer_name' })
  employer_name!: string;

  @Column({ type: 'varchar', length: 255, name: 'position_title' })
  position_title!: string;

  @Column({ type: 'date', name: 'start_date' })
  start_date!: Date;

  @Column({ type: 'varchar', length: 150, nullable: true })
  sector!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'placement_type' })
  placement_type!: PlacementType | null;

  @ManyToOne(() => Alumni, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'alumni_id' })
  alumni!: Alumni;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;
}

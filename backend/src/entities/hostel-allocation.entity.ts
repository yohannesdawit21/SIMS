import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { StudentProfile } from './student-profile.entity';
import { Hostel } from './hostel.entity';

@Entity({ name: 'hostel_allocations' })
export class HostelAllocation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  student_id!: string;

  @Column({ type: 'uuid', name: 'hostel_id' })
  hostel_id!: string;

  @Column({ type: 'date', name: 'start_date' })
  start_date!: Date;

  @Column({ type: 'date', name: 'end_date' })
  end_date!: Date;

  @Column({ type: 'date', nullable: true, name: 'departure_date' })
  departure_date!: Date | null;

  @Column({ type: 'text', nullable: true, name: 'departure_reason' })
  departure_reason!: string | null;

  @ManyToOne(() => StudentProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: StudentProfile;

  @ManyToOne(() => Hostel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hostel_id' })
  hostel!: Hostel;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;
}

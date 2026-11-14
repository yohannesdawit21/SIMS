import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Course } from './course.entity';
import { User } from './user.entity';
import { AcademicPeriod } from './academic-period.entity';

export enum TimetableEntryType {
  CLASS = 'class',
  EXAM = 'exam',
  LAB = 'lab',
}

export enum TimetableStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PUBLISHED = 'published',
}

@Entity({ name: 'timetable_entries' })
export class TimetableEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'course_id' })
  course_id!: string;

  @Column({ type: 'uuid', name: 'lecturer_id' })
  lecturer_id!: string;

  @Column({ type: 'uuid', name: 'academic_period_id' })
  academic_period_id!: string;

  @Column({ type: 'varchar', length: 100 })
  room!: string;

  @Column({ type: 'int', name: 'day_of_week' })
  day_of_week!: number;

  @Column({ type: 'time', name: 'start_time' })
  start_time!: string;

  @Column({ type: 'time', name: 'end_time' })
  end_time!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: TimetableEntryType.CLASS,
    name: 'entry_type',
  })
  entry_type!: TimetableEntryType;

  @Column({
    type: 'varchar',
    length: 30,
    default: TimetableStatus.PENDING,
    enum: TimetableStatus,
  })
  status!: TimetableStatus;

  @Column({ type: 'boolean', default: false, name: 'is_published' })
  is_published!: boolean;

  @Column({ type: 'uuid', name: 'created_by_id', nullable: true })
  created_by_id!: string | null;

  @Column({ type: 'uuid', name: 'approved_by_id', nullable: true })
  approved_by_id!: string | null;

  @Column({ type: 'timestamptz', name: 'approval_date', nullable: true })
  approval_date!: Date | null;

  @Column({ type: 'text', name: 'rejection_reason', nullable: true })
  rejection_reason!: string | null;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course!: Course;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lecturer_id' })
  lecturer!: User;

  @ManyToOne(() => AcademicPeriod, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_period_id' })
  academicPeriod!: AcademicPeriod;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by_id' })
  approvedBy!: User | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;
}

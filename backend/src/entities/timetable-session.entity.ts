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

@Entity({ name: 'timetable_sessions' })
export class TimetableSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'course_id' })
  course_id!: string;

  @Column({ type: 'uuid', name: 'lecturer_id' })
  lecturer_id!: string;

  @Column({ type: 'uuid', name: 'academic_period_id' })
  academic_period_id!: string;

  @Column({ type: 'date', name: 'session_date' })
  session_date!: Date;

  @Column({ type: 'time', name: 'start_time' })
  start_time!: string;

  @Column({ type: 'time', name: 'end_time' })
  end_time!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  room!: string | null;

  // Schedule approval fields
  @Column({ 
    type: 'varchar', 
    length: 50, 
    default: 'pending',
    comment: 'pending, approved, rejected' 
  })
  status!: string;

  @Column({ type: 'uuid', name: 'created_by_id', nullable: true })
  created_by_id!: string | null;

  @Column({ type: 'uuid', name: 'approved_by_id', nullable: true })
  approved_by_id!: string | null;

  @Column({ type: 'timestamptz', name: 'approval_date', nullable: true })
  approval_date!: Date | null;

  @Column({ type: 'text', name: 'rejection_reason', nullable: true })
  rejection_reason!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;

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
}

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
import { TimetableSession } from './timetable-session.entity';
import { User } from './user.entity';

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  LATE = 'late',
}

@Entity({ name: 'attendance_records' })
@Unique(['student_id', 'session_id'])
export class AttendanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  student_id!: string;

  @Column({ type: 'uuid', name: 'session_id' })
  session_id!: string;

  @Column({ type: 'varchar', length: 10 })
  status!: AttendanceStatus;

  @Column({ type: 'uuid', name: 'recorded_by' })
  recorded_by!: string;

  @Column({ type: 'uuid', nullable: true, name: 'amended_by' })
  amended_by!: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'amended_at' })
  amended_at!: Date | null;

  @ManyToOne(() => StudentProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: StudentProfile;

  @ManyToOne(() => TimetableSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: TimetableSession;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'recorded_by' })
  recordedBy!: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'amended_by' })
  amendedBy!: User | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'recorded_at' })
  recorded_at!: Date;
}

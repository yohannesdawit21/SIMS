import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StudentProfile } from './student-profile.entity';
import { User } from './user.entity';

export enum DisciplineIssueType {
  ATTENDANCE = 'attendance',
  BEHAVIOR = 'behavior',
  CHEATING = 'cheating',
  LATE_FEES = 'late_fees',
  PROPERTY_DAMAGE = 'property_damage',
  OTHER = 'other',
}

export enum DisciplineStatus {
  ACTIVE = 'active',
  CLEARED = 'cleared',
  UNDER_REVIEW = 'under_review',
}

@Entity({ name: 'discipline_records' })
export class DisciplineRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  student_id!: string;

  @ManyToOne(() => StudentProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: StudentProfile;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'issue_type',
    enum: DisciplineIssueType,
  })
  issue_type!: DisciplineIssueType;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'uuid', name: 'reported_by' })
  reported_by!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reported_by' })
  reporter!: User;

  @Column({
    type: 'varchar',
    length: 30,
    default: DisciplineStatus.ACTIVE,
    enum: DisciplineStatus,
  })
  status!: DisciplineStatus;

  @Column({ type: 'uuid', nullable: true, name: 'cleared_by' })
  cleared_by!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'cleared_by' })
  clearedByUser!: User | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'cleared_at' })
  cleared_at!: Date | null;

  @Column({ type: 'text', nullable: true, name: 'clearance_note' })
  clearance_note!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at!: Date;
}

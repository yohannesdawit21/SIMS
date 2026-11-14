import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { StudentProfile } from './student-profile.entity';
import { FeeCategory } from './fee-category.entity';
import { AcademicPeriod } from './academic-period.entity';

@Entity({ name: 'fee_records' })
export class FeeRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  student_id!: string;

  @Column({ type: 'uuid', name: 'category_id' })
  category_id!: string;

  @Column({ type: 'uuid', name: 'academic_period_id' })
  academic_period_id!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'amount_due' })
  amount_due!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, name: 'amount_paid' })
  amount_paid!: number;

  @Column({ type: 'date', name: 'due_date' })
  due_date!: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, name: 'waiver_amount' })
  waiver_amount!: number;

  @Column({ type: 'text', nullable: true, name: 'waiver_reason' })
  waiver_reason!: string | null;

  // outstanding is a GENERATED ALWAYS column in the DB; expose as computed property
  get outstanding(): number {
    return Number(this.amount_due) - Number(this.amount_paid);
  }

  @ManyToOne(() => StudentProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: StudentProfile;

  @ManyToOne(() => FeeCategory)
  @JoinColumn({ name: 'category_id' })
  category!: FeeCategory;

  @ManyToOne(() => AcademicPeriod)
  @JoinColumn({ name: 'academic_period_id' })
  academicPeriod!: AcademicPeriod;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { StudentProfile } from './student-profile.entity';
import { Course } from './course.entity';
import { AcademicPeriod } from './academic-period.entity';
import { AssessmentComponent } from './assessment-component.entity';


export enum GradeStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  REVISION_REQUESTED = 'revision_requested',
  PUBLISHED = 'published',
}

@Entity({ name: 'grades' })
@Unique(['student_id', 'course_id', 'component_id', 'academic_period_id'])
export class Grade {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  student_id!: string;

  @Column({ type: 'uuid', name: 'course_id' })
  course_id!: string;

  @Column({ type: 'uuid', name: 'academic_period_id' })
  academic_period_id!: string;

  @Column({ type: 'uuid', name: 'component_id' })
  component_id!: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  score!: number | null;

  
  @Column({
    type: 'varchar',
    length: 30,
    default: GradeStatus.DRAFT,
    enum: GradeStatus,
  })
  status!: GradeStatus;

  @Column({ type: 'text', nullable: true, name: 'moderation_note' })
  moderation_note!: string | null;

  @Column({ type: 'boolean', default: false, name: 'is_published' })
  is_published!: boolean;

  @Column({ type: 'timestamptz', nullable: true, name: 'published_at' })
  published_at!: Date | null;

  @ManyToOne(() => StudentProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: StudentProfile;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course!: Course;

  @ManyToOne(() => AcademicPeriod, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_period_id' })
  academicPeriod!: AcademicPeriod;

  @ManyToOne(() => AssessmentComponent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'component_id' })
  component!: AssessmentComponent;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at!: Date;
}

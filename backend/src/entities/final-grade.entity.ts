import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { StudentProfile } from './student-profile.entity';
import { Course } from './course.entity';
import { AcademicPeriod } from './academic-period.entity';

@Entity({ name: 'final_grades' })
@Unique(['student_id', 'course_id', 'academic_period_id'])
export class FinalGrade {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  student_id!: string;

  @Column({ type: 'uuid', name: 'course_id' })
  course_id!: string;

  @Column({ type: 'uuid', name: 'academic_period_id' })
  academic_period_id!: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'final_score' })
  final_score!: number;

  @Column({ type: 'varchar', length: 5, nullable: true, name: 'letter_grade' })
  letter_grade!: string | null;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true, name: 'grade_points' })
  grade_points!: number | null;

  @Column({ type: 'boolean', default: false, name: 'is_published' })
  is_published!: boolean;

  @ManyToOne(() => StudentProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: StudentProfile;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course!: Course;

  @ManyToOne(() => AcademicPeriod, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_period_id' })
  academicPeriod!: AcademicPeriod;
}

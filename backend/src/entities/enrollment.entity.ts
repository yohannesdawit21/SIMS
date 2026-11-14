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
import { Course } from './course.entity';
import { AcademicPeriod } from './academic-period.entity';

@Entity({ name: 'enrollments' })
@Unique(['student_id', 'course_id', 'academic_period_id'])
export class Enrollment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  student_id!: string;

  @Column({ type: 'uuid', name: 'course_id' })
  course_id!: string;

  @Column({ type: 'uuid', name: 'academic_period_id' })
  academic_period_id!: string;

  @ManyToOne(() => StudentProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: StudentProfile;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course!: Course;

  @ManyToOne(() => AcademicPeriod, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_period_id' })
  academicPeriod!: AcademicPeriod;

  @CreateDateColumn({ type: 'timestamptz', name: 'enrolled_at' })
  enrolled_at!: Date;
}

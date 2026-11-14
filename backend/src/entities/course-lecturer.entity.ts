import {
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
} from 'typeorm';
import { Course } from './course.entity';
import { User } from './user.entity';
import { AcademicPeriod } from './academic-period.entity';

@Entity({ name: 'course_lecturers' })
export class CourseLecturer {
  @PrimaryColumn({ type: 'uuid', name: 'course_id' })
  course_id!: string;

  @PrimaryColumn({ type: 'uuid', name: 'lecturer_id' })
  lecturer_id!: string;

  @PrimaryColumn({ type: 'uuid', name: 'academic_period_id' })
  academic_period_id!: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course!: Course;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lecturer_id' })
  lecturer!: User;

  @ManyToOne(() => AcademicPeriod, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'academic_period_id' })
  academicPeriod!: AcademicPeriod;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Course } from './course.entity';

@Entity({ name: 'assessment_components' })
export class AssessmentComponent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'course_id' })
  course_id!: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course!: Course;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  weight!: number;

  @Column({ type: 'boolean', default: true, name: 'is_mandatory' })
  is_mandatory!: boolean;
}

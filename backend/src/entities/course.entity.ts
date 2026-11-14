import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Department } from './department.entity';

@Entity({ name: 'courses' })
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'uuid', nullable: true, name: 'department_id' })
  department_id!: string | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department!: Department | null;

  @Column({ type: 'int', name: 'credit_hours' })
  credit_hours!: number;

  @Column({ type: 'int', nullable: true, name: 'year_level' })
  year_level!: number | null;

  @Column({ type: 'int', nullable: true, name: 'semester' })
  semester!: number | null;

  @Column({ type: 'int', default: 50, name: 'max_enrollment' })
  max_enrollment!: number;

  @Column({ type: 'int', default: 0, name: 'current_enrollment' })
  current_enrollment!: number;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'academic_periods' })
export class AcademicPeriod {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'date', name: 'start_date' })
  start_date!: Date;

  @Column({ type: 'date', name: 'end_date' })
  end_date!: Date;

  @Column({ type: 'boolean', default: false, name: 'is_locked' })
  is_locked!: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;
}

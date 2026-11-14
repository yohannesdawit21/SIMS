import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Department } from './department.entity';
import { StudentProfile } from './student-profile.entity';

@Entity({ name: 'programmes' })
export class Programme {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'uuid', nullable: true, name: 'department_id' })
  department_id!: string | null;

  @ManyToOne(() => Department, (dept) => dept.programmes, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'department_id' })
  department!: Department | null;

  @Column({ type: 'int', name: 'duration_years' })
  duration_years!: number;

  @OneToMany(() => StudentProfile, (profile) => profile.programme)
  studentProfiles!: StudentProfile[];
}

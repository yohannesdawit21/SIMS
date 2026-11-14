import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StudentProfile } from './student-profile.entity';

@Entity({ name: 'alumni' })
export class Alumni {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true, name: 'student_id' })
  student_id!: string;

  @Column({ type: 'date', name: 'graduation_date' })
  graduation_date!: Date;

  @Column({ type: 'decimal', precision: 4, scale: 3, nullable: true, name: 'final_gpa' })
  final_gpa!: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'current_email' })
  current_email!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true, name: 'current_phone' })
  current_phone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  employer!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'job_title' })
  job_title!: string | null;

  @OneToOne(() => StudentProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: StudentProfile;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at!: Date;
}

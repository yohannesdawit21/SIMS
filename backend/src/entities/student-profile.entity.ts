import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Programme } from './programme.entity';

export enum StudentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  GRADUATED = 'graduated',
  SUSPENDED = 'suspended',
}

@Entity({ name: 'student_profiles' })
export class StudentProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true, name: 'user_id' })
  user_id!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 20, unique: true, name: 'student_number' })
  student_number!: string;

  @Column({ type: 'varchar', length: 255, name: 'full_legal_name' })
  full_legal_name!: string;

  @Column({ type: 'date', name: 'date_of_birth' })
  date_of_birth!: Date;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender!: string | null;

  @Column({ type: 'varchar', length: 100, unique: true, name: 'national_id' })
  national_id!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'personal_email' })
  personal_email!: string | null;

  @Column({ type: 'text', nullable: true, name: 'home_address' })
  home_address!: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'programme_id' })
  programme_id!: string | null;

  @ManyToOne(() => Programme, (programme) => programme.studentProfiles, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'programme_id' })
  programme!: Programme | null;

  @Column({ type: 'int', name: 'year_of_entry' })
  year_of_entry!: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: StudentStatus.ACTIVE,
    enum: StudentStatus,
  })
  status!: StudentStatus;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'photo_url' })
  photo_url!: string | null;

  @Column({ type: 'boolean', default: false, name: 'has_active_discipline' })
  has_active_discipline!: boolean;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true, name: 'current_gpa' })
  current_gpa!: number | null;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true, name: 'cumulative_gpa' })
  cumulative_gpa!: number | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at!: Date;
}

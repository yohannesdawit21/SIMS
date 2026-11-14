import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { LibraryResource } from './library-resource.entity';
import { StudentProfile } from './student-profile.entity';

@Entity({ name: 'library_loans' })
export class LibraryLoan {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'resource_id' })
  resource_id!: string;

  @Column({ type: 'uuid', name: 'student_id' })
  student_id!: string;

  @Column({ type: 'date', name: 'loan_date' })
  loan_date!: Date;

  @Column({ type: 'date', name: 'due_date' })
  due_date!: Date;

  @Column({ type: 'date', nullable: true, name: 'returned_date' })
  returned_date!: Date | null;

  @Column({ type: 'boolean', default: false, name: 'is_returned' })
  is_returned!: boolean;

  @ManyToOne(() => LibraryResource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource!: LibraryResource;

  @ManyToOne(() => StudentProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: StudentProfile;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;
}

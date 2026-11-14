import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ParentGuardian } from './parent-guardian.entity';
import { StudentProfile } from './student-profile.entity';

@Entity({ name: 'guardian_student_links' })
export class GuardianStudentLink {
  @PrimaryColumn({ type: 'uuid', name: 'guardian_id' })
  guardian_id!: string;

  @PrimaryColumn({ type: 'uuid', name: 'student_id' })
  student_id!: string;

  @Column({ type: 'timestamptz', name: 'consent_recorded_at' })
  consent_recorded_at!: Date;

  @ManyToOne(() => ParentGuardian, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guardian_id' })
  guardian!: ParentGuardian;

  @ManyToOne(() => StudentProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student!: StudentProfile;
}

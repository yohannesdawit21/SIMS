import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  STUDENT = 'student',
  LECTURER = 'lecturer',
  ADMIN_STAFF = 'admin_staff',
  DEPARTMENT_HEAD = 'department_head',
  SUPER_ADMIN = 'super_admin',
  PARENT_GUARDIAN = 'parent_guardian',
}

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  username!: string;

  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  password_hash!: string;

  @Column({
    type: 'varchar',
    length: 50,
    enum: UserRole,
  })
  role!: UserRole;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  is_active!: boolean;

  @Column({
    type: 'int',
    default: 0,
    name: 'failed_login_attempts',
  })
  failed_login_attempts!: number;

  @Column({ type: 'timestamptz', nullable: true, name: 'locked_until' })
  locked_until!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updated_at!: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Programme } from './programme.entity';

@Entity({ name: 'departments' })
export class Department {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  name!: string;

  @Column({ type: 'uuid', nullable: true, name: 'head_id' })
  head_id!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'head_id' })
  head!: User | null;

  @OneToMany(() => Programme, (programme) => programme.department)
  programmes!: Programme[];

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum AuditOperation {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
}

@Entity({ name: 'audit_logs' })
export class AuditLog {
  // bigint auto-increment; TypeORM handles via PrimaryGeneratedColumn increment
  @PrimaryGeneratedColumn('increment')
  id!: number;

  @Column({ type: 'uuid', name: 'actor_id' })
  actor_id!: string;

  @Column({ type: 'varchar', length: 10 })
  operation!: AuditOperation;

  @Column({ type: 'varchar', length: 100, name: 'record_type' })
  record_type!: string;

  @Column({ type: 'uuid', name: 'record_id' })
  record_id!: string;

  @Column({ type: 'jsonb', nullable: true, name: 'previous_values' })
  previous_values!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true, name: 'new_values' })
  new_values!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;
}

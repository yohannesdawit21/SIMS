import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum NotificationChannel {
  EMAIL = 'email',
  SMS = 'sms',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
}

@Entity({ name: 'notification_logs' })
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'recipient_id' })
  recipient_id!: string;

  @Column({ type: 'varchar', length: 100, name: 'notification_type' })
  notification_type!: string;

  @Column({ type: 'varchar', length: 10 })
  channel!: NotificationChannel;

  @Column({ type: 'varchar', length: 100, name: 'trigger_event' })
  trigger_event!: string;

  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: NotificationStatus.PENDING,
  })
  status!: NotificationStatus;

  @Column({ type: 'int', default: 0, name: 'attempt_count' })
  attempt_count!: number;

  @Column({ type: 'timestamptz', nullable: true, name: 'dispatched_at' })
  dispatched_at!: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipient_id' })
  recipient!: User;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  created_at!: Date;
}

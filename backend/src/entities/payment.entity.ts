import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { FeeRecord } from './fee-record.entity';
import { User } from './user.entity';

@Entity({ name: 'payments' })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'fee_record_id' })
  fee_record_id!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'receipt_url' })
  receipt_url!: string | null;

  @Column({ type: 'uuid', name: 'recorded_by' })
  recorded_by!: string;

  @ManyToOne(() => FeeRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fee_record_id' })
  feeRecord!: FeeRecord;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'recorded_by' })
  recordedBy!: User;

  @CreateDateColumn({ type: 'timestamptz', name: 'payment_date' })
  payment_date!: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
} from 'typeorm';

@Entity({ name: 'hostels' })
@Unique(['block_name', 'room_number'])
export class Hostel {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, name: 'block_name' })
  block_name!: string;

  @Column({ type: 'varchar', length: 30, name: 'room_number' })
  room_number!: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'room_type' })
  room_type!: string | null;

  @Column({ type: 'int', default: 1, name: 'max_occupancy' })
  max_occupancy!: number;
}

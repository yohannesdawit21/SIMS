import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

@Entity({ name: 'library_resources' })
export class LibraryResource {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  authors!: string | null;

  @Column({ type: 'varchar', length: 100, unique: true, name: 'isbn_or_accession' })
  isbn_or_accession!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category!: string | null;

  @Column({ type: 'int', default: 1, name: 'total_copies' })
  total_copies!: number;

  @Column({ type: 'int', default: 1, name: 'available_copies' })
  available_copies!: number;
}

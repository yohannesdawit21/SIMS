import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

// Load .env only in local dev; Railway/Docker inject env vars directly
dotenv.config({ path: join(__dirname, '../../.env') });

const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL ||
  'postgresql://sims_app:secret@localhost:5432/sims';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: [join(__dirname, '../entities/*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations/*.{ts,js}')],
  synchronize: false,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

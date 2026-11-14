import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGradeStatusAndModerationNote1700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "grades" 
      ADD COLUMN IF NOT EXISTS "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS "moderation_note" TEXT;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "grades" 
      DROP COLUMN IF EXISTS "moderation_note",
      DROP COLUMN IF EXISTS "status";
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhase3And4TablesAndColumns1700000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add columns to timetable_entries
    await queryRunner.query(`
      ALTER TABLE "timetable_entries"
        ADD COLUMN IF NOT EXISTS "status" VARCHAR(30) DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS "created_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "approved_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "approval_date" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;
    `);

    // 2. Add columns to timetable_sessions
    await queryRunner.query(`
      ALTER TABLE "timetable_sessions"
        ADD COLUMN IF NOT EXISTS "status" VARCHAR(50) DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS "created_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "approved_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "approval_date" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;
    `);

    // 3. Add columns to courses
    await queryRunner.query(`
      ALTER TABLE "courses"
        ADD COLUMN IF NOT EXISTS "year_level" INT,
        ADD COLUMN IF NOT EXISTS "semester" INT,
        ADD COLUMN IF NOT EXISTS "year" INT DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "level" VARCHAR(20) DEFAULT 'Year 1',
        ADD COLUMN IF NOT EXISTS "prerequisite_course_ids" TEXT[] DEFAULT '{}';
    `);

    // 4. Add columns to student_profiles
    await queryRunner.query(`
      ALTER TABLE "student_profiles"
        ADD COLUMN IF NOT EXISTS "has_active_discipline" BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS "current_year" INT DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "current_level" VARCHAR(20) DEFAULT 'Year 1',
        ADD COLUMN IF NOT EXISTS "current_gpa" NUMERIC(4,2) DEFAULT 0.00,
        ADD COLUMN IF NOT EXISTS "cumulative_gpa" NUMERIC(4,2) DEFAULT 0.00,
        ADD COLUMN IF NOT EXISTS "cumulative_credits" INT DEFAULT 0;
    `);

    // 5. Create discipline_records table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "discipline_records" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "student_id" UUID NOT NULL REFERENCES "student_profiles"("id") ON DELETE CASCADE,
        "issue_type" VARCHAR(50) NOT NULL,
        "description" TEXT NOT NULL,
        "reported_by" UUID NOT NULL REFERENCES "users"("id"),
        "status" VARCHAR(30) NOT NULL DEFAULT 'active',
        "cleared_by" UUID REFERENCES "users"("id"),
        "cleared_at" TIMESTAMPTZ,
        "clearance_note" TEXT,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 6. Create semester_registrations table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "semester_registrations" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "student_id" UUID NOT NULL REFERENCES "student_profiles"("id") ON DELETE CASCADE,
        "academic_period_id" UUID NOT NULL REFERENCES "academic_periods"("id") ON DELETE CASCADE,
        "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
        "gpa_at_registration" NUMERIC(4,2),
        "has_discipline_block" BOOLEAN NOT NULL DEFAULT false,
        "gpa_warning" BOOLEAN NOT NULL DEFAULT false,
        "gpa_block" BOOLEAN NOT NULL DEFAULT false,
        "admin_override" BOOLEAN NOT NULL DEFAULT false,
        "overridden_by_id" UUID REFERENCES "users"("id"),
        "override_reason" TEXT,
        "block_reason" TEXT,
        "notes" TEXT,
        "registration_date" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "approved_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "uq_student_semester_reg" UNIQUE ("student_id", "academic_period_id")
      );
    `);

    // 7. Create student_applications table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "student_applications" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "full_legal_name" VARCHAR(255) NOT NULL,
        "date_of_birth" DATE NOT NULL,
        "gender" VARCHAR(20),
        "national_id" VARCHAR(100) NOT NULL UNIQUE,
        "phone" VARCHAR(30) NOT NULL,
        "email" VARCHAR(255) NOT NULL,
        "home_address" TEXT NOT NULL,
        "previous_school" VARCHAR(255) NOT NULL,
        "previous_school_graduation_year" VARCHAR(100) NOT NULL,
        "previous_grade_gpa" VARCHAR(50),
        "emergency_contact_name" VARCHAR(255) NOT NULL,
        "emergency_contact_phone" VARCHAR(30) NOT NULL,
        "parent_guardian_name" VARCHAR(255),
        "parent_guardian_phone" VARCHAR(30),
        "preferred_programme_id" UUID NOT NULL REFERENCES "programmes"("id"),
        "year_of_entry" INT NOT NULL,
        "transcript_url" VARCHAR(500),
        "national_id_copy_url" VARCHAR(500),
        "birth_certificate_url" VARCHAR(500),
        "payment_receipt_url" VARCHAR(500),
        "photo_url" VARCHAR(500),
        "entrance_document_url" VARCHAR(500),
        "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
        "reviewed_by" UUID REFERENCES "users"("id"),
        "reviewed_at" TIMESTAMPTZ,
        "review_notes" TEXT,
        "rejection_reason" TEXT,
        "created_student_id" UUID,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "student_applications";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "semester_registrations";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "discipline_records";`);
  }
}

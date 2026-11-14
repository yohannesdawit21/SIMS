-- SIMS Complete Schema for Supabase
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS "migrations" (
  "id" SERIAL PRIMARY KEY,
  "timestamp" BIGINT NOT NULL,
  "name" VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "username" VARCHAR(100) UNIQUE NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "role" VARCHAR(50) NOT NULL CHECK ("role" IN ('student','lecturer','admin_staff','department_head','super_admin','parent_guardian')),
  "email" VARCHAR(255) UNIQUE NOT NULL,
  "phone" VARCHAR(30),
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "failed_login_attempts" INT NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "departments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(150) UNIQUE NOT NULL,
  "head_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "academic_periods" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "is_locked" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "programmes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(200) NOT NULL,
  "department_id" UUID REFERENCES "departments"("id") ON DELETE SET NULL,
  "duration_years" INT NOT NULL
);

CREATE TABLE IF NOT EXISTS "courses" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" VARCHAR(30) UNIQUE NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "department_id" UUID REFERENCES "departments"("id") ON DELETE SET NULL,
  "credit_hours" INT NOT NULL,
  "max_enrollment" INT NOT NULL DEFAULT 50,
  "current_enrollment" INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "course_lecturers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "course_id" UUID NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "lecturer_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "academic_period_id" UUID NOT NULL REFERENCES "academic_periods"("id") ON DELETE CASCADE,
  UNIQUE ("course_id", "lecturer_id", "academic_period_id")
);

CREATE TABLE IF NOT EXISTS "student_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID UNIQUE NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "student_number" VARCHAR(20) UNIQUE NOT NULL,
  "full_legal_name" VARCHAR(255) NOT NULL,
  "date_of_birth" DATE NOT NULL,
  "gender" VARCHAR(20),
  "national_id" VARCHAR(100) UNIQUE NOT NULL,
  "phone" VARCHAR(30),
  "personal_email" VARCHAR(255),
  "home_address" TEXT,
  "programme_id" UUID REFERENCES "programmes"("id") ON DELETE SET NULL,
  "year_of_entry" INT NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','inactive','graduated','suspended')),
  "photo_url" VARCHAR(500),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "enrollments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL REFERENCES "student_profiles"("id") ON DELETE CASCADE,
  "course_id" UUID NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "academic_period_id" UUID NOT NULL REFERENCES "academic_periods"("id") ON DELETE CASCADE,
  "enrolled_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("student_id", "course_id", "academic_period_id")
);

CREATE TABLE IF NOT EXISTS "assessment_components" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "course_id" UUID NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "name" VARCHAR(150) NOT NULL,
  "weight" NUMERIC(5,2) NOT NULL CHECK ("weight" > 0 AND "weight" <= 100),
  "is_mandatory" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS "grades" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL REFERENCES "student_profiles"("id") ON DELETE CASCADE,
  "course_id" UUID NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "academic_period_id" UUID NOT NULL REFERENCES "academic_periods"("id") ON DELETE CASCADE,
  "component_id" UUID NOT NULL REFERENCES "assessment_components"("id") ON DELETE CASCADE,
  "score" NUMERIC(5,2),
  "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
  "is_published" BOOLEAN NOT NULL DEFAULT FALSE,
  "published_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("student_id", "course_id", "component_id", "academic_period_id")
);

CREATE TABLE IF NOT EXISTS "final_grades" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL REFERENCES "student_profiles"("id") ON DELETE CASCADE,
  "course_id" UUID NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "academic_period_id" UUID NOT NULL REFERENCES "academic_periods"("id") ON DELETE CASCADE,
  "final_score" NUMERIC(5,2) NOT NULL,
  "letter_grade" VARCHAR(5),
  "grade_points" NUMERIC(3,2),
  "is_published" BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE ("student_id", "course_id", "academic_period_id")
);

CREATE TABLE IF NOT EXISTS "timetable_entries" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "course_id" UUID NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "lecturer_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "academic_period_id" UUID NOT NULL REFERENCES "academic_periods"("id") ON DELETE CASCADE,
  "room" VARCHAR(100) NOT NULL,
  "day_of_week" INT NOT NULL CHECK ("day_of_week" BETWEEN 1 AND 7),
  "start_time" TIME NOT NULL,
  "end_time" TIME NOT NULL,
  "entry_type" VARCHAR(20) NOT NULL DEFAULT 'class' CHECK ("entry_type" IN ('class','exam','lab')),
  "status" VARCHAR(30) NOT NULL DEFAULT 'draft',
  "is_published" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "timetable_sessions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "course_id" UUID NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
  "lecturer_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "academic_period_id" UUID NOT NULL REFERENCES "academic_periods"("id") ON DELETE CASCADE,
  "session_date" DATE NOT NULL,
  "start_time" TIME NOT NULL,
  "end_time" TIME NOT NULL,
  "room" VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS "attendance_records" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL REFERENCES "student_profiles"("id") ON DELETE CASCADE,
  "session_id" UUID NOT NULL REFERENCES "timetable_sessions"("id") ON DELETE CASCADE,
  "status" VARCHAR(10) NOT NULL CHECK ("status" IN ('present','absent','late')),
  "recorded_by" UUID NOT NULL REFERENCES "users"("id"),
  "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "amended_by" UUID REFERENCES "users"("id"),
  "amended_at" TIMESTAMPTZ,
  UNIQUE ("student_id", "session_id")
);

CREATE TABLE IF NOT EXISTS "fee_categories" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) UNIQUE NOT NULL,
  "description" TEXT
);

CREATE TABLE IF NOT EXISTS "fee_records" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL REFERENCES "student_profiles"("id") ON DELETE CASCADE,
  "category_id" UUID NOT NULL REFERENCES "fee_categories"("id"),
  "academic_period_id" UUID NOT NULL REFERENCES "academic_periods"("id"),
  "amount_due" NUMERIC(12,2) NOT NULL,
  "amount_paid" NUMERIC(12,2) NOT NULL DEFAULT 0,
  "due_date" DATE NOT NULL,
  "waiver_amount" NUMERIC(12,2) DEFAULT 0,
  "waiver_reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "payments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "fee_record_id" UUID NOT NULL REFERENCES "fee_records"("id") ON DELETE CASCADE,
  "amount" NUMERIC(12,2) NOT NULL,
  "payment_date" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "receipt_url" VARCHAR(500),
  "recorded_by" UUID NOT NULL REFERENCES "users"("id")
);

CREATE TABLE IF NOT EXISTS "library_resources" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" VARCHAR(500) NOT NULL,
  "authors" TEXT,
  "isbn_or_accession" VARCHAR(100) UNIQUE NOT NULL,
  "category" VARCHAR(100),
  "total_copies" INT NOT NULL DEFAULT 1,
  "available_copies" INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS "library_loans" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "resource_id" UUID NOT NULL REFERENCES "library_resources"("id") ON DELETE CASCADE,
  "student_id" UUID NOT NULL REFERENCES "student_profiles"("id") ON DELETE CASCADE,
  "loan_date" DATE NOT NULL,
  "due_date" DATE NOT NULL,
  "returned_date" DATE,
  "is_returned" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "hostels" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "block_name" VARCHAR(100) NOT NULL,
  "room_number" VARCHAR(30) NOT NULL,
  "room_type" VARCHAR(50),
  "max_occupancy" INT NOT NULL DEFAULT 1,
  UNIQUE ("block_name", "room_number")
);

CREATE TABLE IF NOT EXISTS "hostel_allocations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL REFERENCES "student_profiles"("id") ON DELETE CASCADE,
  "hostel_id" UUID NOT NULL REFERENCES "hostels"("id") ON DELETE CASCADE,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "departure_date" DATE,
  "departure_reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "alumni" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "student_id" UUID UNIQUE NOT NULL REFERENCES "student_profiles"("id") ON DELETE CASCADE,
  "graduation_date" DATE NOT NULL,
  "final_gpa" NUMERIC(4,3),
  "current_email" VARCHAR(255),
  "current_phone" VARCHAR(30),
  "employer" VARCHAR(255),
  "job_title" VARCHAR(255),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "career_placements" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "alumni_id" UUID NOT NULL REFERENCES "alumni"("id") ON DELETE CASCADE,
  "employer_name" VARCHAR(255) NOT NULL,
  "position_title" VARCHAR(255) NOT NULL,
  "start_date" DATE NOT NULL,
  "sector" VARCHAR(150),
  "placement_type" VARCHAR(20) CHECK ("placement_type" IN ('job','internship')),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "job_listings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "employer_name" VARCHAR(255) NOT NULL,
  "position_title" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "deadline" DATE NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "job_listing_programmes" (
  "listing_id" UUID NOT NULL REFERENCES "job_listings"("id") ON DELETE CASCADE,
  "programme_id" UUID NOT NULL REFERENCES "programmes"("id") ON DELETE CASCADE,
  PRIMARY KEY ("listing_id", "programme_id")
);

CREATE TABLE IF NOT EXISTS "job_applications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "listing_id" UUID NOT NULL REFERENCES "job_listings"("id") ON DELETE CASCADE,
  "student_id" UUID NOT NULL REFERENCES "student_profiles"("id") ON DELETE CASCADE,
  "resume_url" VARCHAR(500) NOT NULL,
  "applied_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("listing_id", "student_id")
);

CREATE TABLE IF NOT EXISTS "parent_guardians" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID UNIQUE NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "guardian_student_links" (
  "guardian_id" UUID NOT NULL REFERENCES "parent_guardians"("id") ON DELETE CASCADE,
  "student_id" UUID NOT NULL REFERENCES "student_profiles"("id") ON DELETE CASCADE,
  "consent_recorded_at" TIMESTAMPTZ NOT NULL,
  PRIMARY KEY ("guardian_id", "student_id")
);

CREATE TABLE IF NOT EXISTS "notification_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "recipient_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "notification_type" VARCHAR(100) NOT NULL,
  "channel" VARCHAR(10) NOT NULL CHECK ("channel" IN ('email','sms')),
  "trigger_event" VARCHAR(100) NOT NULL,
  "payload" JSONB,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','sent','failed')),
  "attempt_count" INT NOT NULL DEFAULT 0,
  "dispatched_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" BIGSERIAL,
  "actor_id" UUID NOT NULL,
  "operation" VARCHAR(10) NOT NULL CHECK ("operation" IN ('create','update','delete')),
  "record_type" VARCHAR(100) NOT NULL,
  "record_id" UUID NOT NULL,
  "previous_values" JSONB,
  "new_values" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("id", "created_at")
) PARTITION BY RANGE ("created_at");

CREATE TABLE IF NOT EXISTS "audit_logs_y2024" PARTITION OF "audit_logs" FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE IF NOT EXISTS "audit_logs_y2025" PARTITION OF "audit_logs" FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE IF NOT EXISTS "audit_logs_y2026" PARTITION OF "audit_logs" FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS "audit_logs_y2027" PARTITION OF "audit_logs" FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');
CREATE TABLE IF NOT EXISTS "audit_logs_y2028" PARTITION OF "audit_logs" FOR VALUES FROM ('2028-01-01') TO ('2029-01-01');
CREATE TABLE IF NOT EXISTS "audit_logs_y2029" PARTITION OF "audit_logs" FOR VALUES FROM ('2029-01-01') TO ('2030-01-01');
CREATE TABLE IF NOT EXISTS "audit_logs_y2030" PARTITION OF "audit_logs" FOR VALUES FROM ('2030-01-01') TO ('2031-01-01');

CREATE INDEX IF NOT EXISTS "idx_audit_logs_actor_type_date"
  ON "audit_logs" ("actor_id", "record_type", "created_at");

INSERT INTO "migrations" ("timestamp", "name")
VALUES (1700000000000, 'InitialSchema1700000000000')
ON CONFLICT DO NOTHING;

SELECT 'Schema created successfully' AS result;

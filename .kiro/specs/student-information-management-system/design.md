# Design Document

## Student Information Management System (SIMS)

---

## Overview

SIMS is a greenfield, institutional-scale web application for a polytechnic college. It consolidates the full student lifecycle — enrollment, academic records, attendance, scheduling, fees, library, hostel, alumni, career placement, and parent/guardian access — into a single integrated platform, enforcing strict role-based access control across five user roles.

The design prioritises correctness and auditability (tamper-evident logs, 7-year retention), security (role-checked every request, immediate session invalidation on account deactivation), and operational scalability for a typical polytechnic enrollment of a few thousand to tens of thousands of students.

---

## Recommended Tech Stack

### Rationale

This is an institutional backend-heavy system with structured relational data, complex access control, multi-channel notifications, file handling, and strict audit requirements. The following stack optimises for:

- **Strong type safety** across the full codebase
- **Relational integrity** for complex, inter-related domain models
- **Mature ecosystem** for PDF/CSV generation, email/SMS, scheduling, and file storage
- **Minimal operational complexity** appropriate for a college IT team

| Layer | Technology | Rationale |
|---|---|---|
| **Backend API** | Node.js + TypeScript + NestJS | Typed, modular framework; excellent DI; built-in guards/interceptors for RBAC |
| **Database** | PostgreSQL 16 | ACID transactions, row-level security, JSONB for audit diffs, partitioning for 7-year log retention |
| **ORM** | TypeORM | TypeScript-native, supports migrations, complex relations, and query builder |
| **Frontend** | React 18 + TypeScript + Vite | Component-based UI, fast build tooling, role-scoped dashboards |
| **Frontend UI Library** | Ant Design | Rich data-grid, form, and table components; accessibility-compliant |
| **State Management** | React Query (TanStack Query) | Server-state synchronisation, optimistic updates |
| **Authentication** | Passport.js (local) + JWT (short-lived) + Redis session store | Stateless API tokens, fast session invalidation via Redis |
| **Background Jobs** | BullMQ + Redis | Notification dispatch, retry logic, report generation |
| **PDF Generation** | Puppeteer (HTML → PDF) | Report-quality PDFs from templates |
| **CSV Export** | csv-stringify | Streaming CSV for large datasets |
| **Email** | Nodemailer + configurable SMTP | Matches requirement for admin-configurable SMTP |
| **SMS** | Twilio SDK (configurable credentials) | Matches requirement for admin-configurable SMS gateway |
| **File Storage** | MinIO (S3-compatible) | Self-hosted object storage for profile photos, resumes, PDFs |
| **Caching** | Redis | Session store, job queues, threshold config cache |
| **Testing (Unit/PBT)** | Vitest + fast-check | Fast test runner; fast-check for property-based tests |
| **Testing (E2E)** | Playwright | Full browser test coverage |
| **Container** | Docker + Docker Compose | Reproducible local dev and deployment |
| **Reverse Proxy** | Nginx | SSL termination, static file serving |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Client Layer                                  │
│  Browser (React SPA)  ·  Alumni Self-Service  ·  Parent/Guardian Portal │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ HTTPS
┌───────────────────────────────▼─────────────────────────────────────────┐
│                           Nginx Reverse Proxy                            │
│             SSL termination · static assets · rate limiting              │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────────┐
│                        NestJS API Server                                 │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ Auth Module  │  │  RBAC Guard  │  │ Audit        │  │ Notification│ │
│  │ (Passport +  │  │ (per-route   │  │ Interceptor  │  │ Dispatcher  │ │
│  │  JWT + Redis)│  │  permission  │  │ (CUD ops)    │  │ (BullMQ)    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
│                                                                          │
│  Domain Modules:                                                         │
│  Users · Enrollment · Grades · Attendance · Timetable · Fees            │
│  Library · Hostel · Alumni · Placement · ParentGuardian · Reports       │
└───────────────┬───────────────────────────────────┬─────────────────────┘
                │                                   │
┌───────────────▼──────────┐         ┌──────────────▼───────────────────┐
│      PostgreSQL 16        │         │    Redis                          │
│  (Primary data store)    │         │  Session store · BullMQ queues    │
│  Row-level security      │         │  Config cache · Rate limit        │
│  Partitioned audit_logs  │         └──────────────────────────────────┘
└──────────────────────────┘
                                      ┌──────────────────────────────────┐
┌─────────────────────────┐           │    MinIO (Object Storage)         │
│   BullMQ Workers        │           │  Profile photos · Resumes        │
│  Notification dispatch  │           │  Generated PDFs · Exports        │
│  Report generation      │           └──────────────────────────────────┘
│  Retry logic            │
└─────────────────────────┘
```

### Key Architectural Decisions

**Per-request RBAC enforcement** — A NestJS `RbacGuard` intercepts every request, loads the user's current role from the Redis session (updated on role change), and evaluates permissions against a static permission matrix. This satisfies requirements 1.1, 1.5, 1.7.

**Audit Interceptor** — A global NestJS interceptor captures every mutating (POST/PUT/PATCH/DELETE) request, compares before/after states, and writes an immutable audit record to the `audit_logs` table. The audit table has no UPDATE or DELETE grants at the PostgreSQL level (enforced via row-level security), satisfying requirement 15.5.

**BullMQ for notifications** — All notification triggers enqueue a job into BullMQ. Workers process them asynchronously, retrying up to 3 times at 10-minute intervals (requirement 13.6), and logging every attempt to `notification_logs`.

**Partitioned audit_logs table** — PostgreSQL declarative partitioning by year on `created_at`. Partitions older than 7 years are archived rather than deleted, satisfying requirement 15.4.

---

## Permission Matrix

| Feature Area | Student | Lecturer | Admin Staff | Dept Head | Super Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| Own profile (read) | ✓ | ✓ | ✓ | ✓ | ✓ |
| All profiles (read) | — | — | ✓ | Dept only | ✓ |
| Profile create/update | — | — | ✓ | — | ✓ |
| Course enrollment | — | — | ✓ | — | ✓ |
| Grades (own, read) | Published | — | ✓ | Dept only | ✓ |
| Grades (enter/publish) | — | Own courses | ✓ | — | ✓ |
| Attendance (own, read) | ✓ | — | ✓ | Dept only | ✓ |
| Attendance (mark/amend) | — | Own courses | ✓ (>48h) | — | ✓ |
| Timetable (view) | Own | Own | ✓ | ✓ | ✓ |
| Timetable (manage) | — | — | ✓ | — | ✓ |
| Fees (own, read) | ✓ | — | ✓ | Dept only | ✓ |
| Fees (manage) | — | — | ✓ | — | ✓ |
| Library catalogue (search) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Loans (manage) | — | — | ✓ | — | ✓ |
| Hostel allocations | Own (read) | — | ✓ | — | ✓ |
| Alumni (manage) | — | — | ✓ | Dept only | ✓ |
| Placement listings (view) | ✓ | — | ✓ | ✓ | ✓ |
| Placement listings (manage)| — | — | ✓ | — | ✓ |
| Reports | — | — | ✓ | Dept only | ✓ |
| User management | — | — | — | — | ✓ |
| Notification config | — | — | — | — | ✓ |
| Audit log (view) | — | — | — | — | ✓ |
| Fee categories (config) | — | — | — | — | ✓ |

---

## Database Schema

All tables use UUID primary keys unless noted. Timestamps are UTC. Soft deletes via `deleted_at` nullable column where data must be preserved.

### Core Identity Tables

```sql
-- users: all system principals
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(50) NOT NULL CHECK (role IN ('student','lecturer','admin_staff','department_head','super_admin')),
  email         VARCHAR(255) UNIQUE NOT NULL,
  phone         VARCHAR(30),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- departments
CREATE TABLE departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(150) UNIQUE NOT NULL,
  head_id     UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- academic_periods
CREATE TABLE academic_periods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  is_locked     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Student Profile & Enrollment

```sql
CREATE TABLE student_profiles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID UNIQUE REFERENCES users(id) NOT NULL,
  student_number   VARCHAR(20) UNIQUE NOT NULL,  -- immutable, system-generated
  full_legal_name  VARCHAR(255) NOT NULL,
  date_of_birth    DATE NOT NULL,
  gender           VARCHAR(20),
  national_id      VARCHAR(100) UNIQUE NOT NULL,
  phone            VARCHAR(30),
  personal_email   VARCHAR(255),
  home_address     TEXT,
  programme_id     UUID REFERENCES programmes(id),
  year_of_entry    INT NOT NULL,
  status           VARCHAR(30) NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','inactive','graduated','suspended')),
  photo_url        VARCHAR(500),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE programmes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(200) NOT NULL,
  department_id  UUID REFERENCES departments(id),
  duration_years INT NOT NULL
);

CREATE TABLE courses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                VARCHAR(30) UNIQUE NOT NULL,
  name                VARCHAR(200) NOT NULL,
  department_id       UUID REFERENCES departments(id),
  credit_hours        INT NOT NULL,
  max_enrollment      INT NOT NULL DEFAULT 50,
  current_enrollment  INT NOT NULL DEFAULT 0
);

CREATE TABLE course_lecturers (
  course_id         UUID REFERENCES courses(id),
  lecturer_id       UUID REFERENCES users(id),
  academic_period_id UUID REFERENCES academic_periods(id),
  PRIMARY KEY (course_id, lecturer_id, academic_period_id)
);

CREATE TABLE enrollments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID REFERENCES student_profiles(id),
  course_id          UUID REFERENCES courses(id),
  academic_period_id UUID REFERENCES academic_periods(id),
  enrolled_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, course_id, academic_period_id)
);
```

### Grades

```sql
CREATE TABLE assessment_components (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID REFERENCES courses(id),
  name        VARCHAR(150) NOT NULL,
  weight      NUMERIC(5,2) NOT NULL CHECK (weight > 0 AND weight <= 100),
  is_mandatory BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE grades (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id             UUID REFERENCES student_profiles(id),
  course_id              UUID REFERENCES courses(id),
  academic_period_id     UUID REFERENCES academic_periods(id),
  component_id           UUID REFERENCES assessment_components(id),
  score                  NUMERIC(5,2),
  is_published           BOOLEAN NOT NULL DEFAULT FALSE,
  published_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, course_id, component_id, academic_period_id)
);

CREATE TABLE final_grades (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID REFERENCES student_profiles(id),
  course_id          UUID REFERENCES courses(id),
  academic_period_id UUID REFERENCES academic_periods(id),
  final_score        NUMERIC(5,2) NOT NULL,
  letter_grade       VARCHAR(5),
  grade_points       NUMERIC(3,2),
  is_published       BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (student_id, course_id, academic_period_id)
);
```

### Attendance

```sql
CREATE TABLE timetable_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id          UUID REFERENCES courses(id),
  lecturer_id        UUID REFERENCES users(id),
  academic_period_id UUID REFERENCES academic_periods(id),
  session_date       DATE NOT NULL,
  start_time         TIME NOT NULL,
  end_time           TIME NOT NULL,
  room               VARCHAR(100)
);

CREATE TABLE attendance_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID REFERENCES student_profiles(id),
  session_id    UUID REFERENCES timetable_sessions(id),
  status        VARCHAR(10) NOT NULL CHECK (status IN ('present','absent','late')),
  recorded_by   UUID REFERENCES users(id),
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amended_by    UUID REFERENCES users(id),
  amended_at    TIMESTAMPTZ,
  UNIQUE (student_id, session_id)
);
```

### Timetable

```sql
CREATE TABLE timetable_entries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id          UUID REFERENCES courses(id),
  lecturer_id        UUID REFERENCES users(id),
  academic_period_id UUID REFERENCES academic_periods(id),
  room               VARCHAR(100) NOT NULL,
  day_of_week        INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time         TIME NOT NULL,
  end_time           TIME NOT NULL,
  entry_type         VARCHAR(20) NOT NULL DEFAULT 'class'
                     CHECK (entry_type IN ('class','exam','lab')),
  is_published       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Fees & Billing

```sql
CREATE TABLE fee_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) UNIQUE NOT NULL,  -- tuition, hostel, library, other
  description TEXT
);

CREATE TABLE fee_records (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID REFERENCES student_profiles(id),
  category_id        UUID REFERENCES fee_categories(id),
  academic_period_id UUID REFERENCES academic_periods(id),
  amount_due         NUMERIC(12,2) NOT NULL,
  amount_paid        NUMERIC(12,2) NOT NULL DEFAULT 0,
  outstanding        NUMERIC(12,2) GENERATED ALWAYS AS (amount_due - amount_paid) STORED,
  due_date           DATE NOT NULL,
  waiver_amount      NUMERIC(12,2) DEFAULT 0,
  waiver_reason      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_record_id  UUID REFERENCES fee_records(id),
  amount         NUMERIC(12,2) NOT NULL,
  payment_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  receipt_url    VARCHAR(500),
  recorded_by    UUID REFERENCES users(id)
);
```

### Library

```sql
CREATE TABLE library_resources (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            VARCHAR(500) NOT NULL,
  authors          TEXT,
  isbn_or_accession VARCHAR(100) UNIQUE NOT NULL,
  category         VARCHAR(100),
  total_copies     INT NOT NULL DEFAULT 1,
  available_copies INT NOT NULL DEFAULT 1,
  CHECK (available_copies >= 0),
  CHECK (available_copies <= total_copies)
);

CREATE TABLE library_loans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id     UUID REFERENCES library_resources(id),
  student_id      UUID REFERENCES student_profiles(id),
  loan_date       DATE NOT NULL,
  due_date        DATE NOT NULL,
  returned_date   DATE,
  is_returned     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Hostel & Facilities

```sql
CREATE TABLE hostels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_name  VARCHAR(100) NOT NULL,
  room_number VARCHAR(30) NOT NULL,
  room_type   VARCHAR(50),
  max_occupancy INT NOT NULL DEFAULT 1,
  UNIQUE (block_name, room_number)
);

CREATE TABLE hostel_allocations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID REFERENCES student_profiles(id),
  hostel_id    UUID REFERENCES hostels(id),
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  departure_date DATE,
  departure_reason TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Alumni & Placement

```sql
CREATE TABLE alumni (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID REFERENCES student_profiles(id) UNIQUE,
  graduation_date DATE NOT NULL,
  final_gpa       NUMERIC(4,3),
  current_email   VARCHAR(255),
  current_phone   VARCHAR(30),
  employer        VARCHAR(255),
  job_title       VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE career_placements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumni_id      UUID REFERENCES alumni(id),
  employer_name  VARCHAR(255) NOT NULL,
  position_title VARCHAR(255) NOT NULL,
  start_date     DATE NOT NULL,
  sector         VARCHAR(150),
  placement_type VARCHAR(20) CHECK (placement_type IN ('job','internship')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE job_listings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_name    VARCHAR(255) NOT NULL,
  position_title   VARCHAR(255) NOT NULL,
  description      TEXT,
  deadline         DATE NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE job_listing_programmes (
  listing_id   UUID REFERENCES job_listings(id),
  programme_id UUID REFERENCES programmes(id),
  PRIMARY KEY (listing_id, programme_id)
);

CREATE TABLE job_applications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    UUID REFERENCES job_listings(id),
  student_id    UUID REFERENCES student_profiles(id),
  resume_url    VARCHAR(500) NOT NULL,
  applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, student_id)
);
```

### Parent/Guardian

```sql
CREATE TABLE parent_guardians (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID UNIQUE REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE guardian_student_links (
  guardian_id UUID REFERENCES parent_guardians(id),
  student_id  UUID REFERENCES student_profiles(id),
  consent_recorded_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (guardian_id, student_id)
);
```

### Notifications

```sql
CREATE TABLE notification_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    UUID REFERENCES users(id),
  notification_type VARCHAR(100) NOT NULL,
  channel         VARCHAR(10) NOT NULL CHECK (channel IN ('email','sms')),
  trigger_event   VARCHAR(100) NOT NULL,
  payload         JSONB,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','failed')),
  attempt_count   INT NOT NULL DEFAULT 0,
  dispatched_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Audit Log

```sql
-- Partitioned by year for 7-year retention
CREATE TABLE audit_logs (
  id              BIGSERIAL,
  actor_id        UUID NOT NULL,
  operation       VARCHAR(10) NOT NULL CHECK (operation IN ('create','update','delete')),
  record_type     VARCHAR(100) NOT NULL,
  record_id       UUID NOT NULL,
  previous_values JSONB,
  new_values      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Grant no UPDATE or DELETE on audit_logs to application role
REVOKE UPDATE, DELETE ON audit_logs FROM sims_app;
```

---

## API Design

The API follows REST conventions. All endpoints are prefixed with `/api/v1`. Authentication via `Authorization: Bearer <jwt>`. All responses follow a standard envelope:

```json
{
  "success": true,
  "data": {},
  "meta": { "timestamp": "2025-01-01T00:00:00Z" }
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "ACCESS_DENIED",
    "message": "You do not have permission to access this resource."
  }
}
```

### Authentication

```
POST   /api/v1/auth/login              – Login; returns JWT + sets session
POST   /api/v1/auth/logout             – Invalidate session
POST   /api/v1/auth/refresh            – Refresh JWT
POST   /api/v1/auth/forgot-password    – Request reset token
POST   /api/v1/auth/reset-password     – Submit new password with token
```

### Users & RBAC (Super Admin only)

```
GET    /api/v1/users                   – List users (filterable)
POST   /api/v1/users                   – Create user
GET    /api/v1/users/:id               – Get user
PATCH  /api/v1/users/:id               – Update user (including role)
PATCH  /api/v1/users/:id/deactivate    – Deactivate account
```

### Student Profiles

```
GET    /api/v1/students                – List students (role-scoped)
POST   /api/v1/students                – Create profile (Admin Staff)
GET    /api/v1/students/:id            – Get profile
PATCH  /api/v1/students/:id            – Update profile (Admin Staff)
POST   /api/v1/students/:id/photo      – Upload profile photo
PATCH  /api/v1/students/:id/deactivate – Deactivate profile
```

### Enrollment

```
GET    /api/v1/enrollments             – List enrollments (role-scoped)
POST   /api/v1/enrollments             – Enroll student in course
DELETE /api/v1/enrollments/:id         – Remove enrollment
```

### Grades

```
GET    /api/v1/grades                  – List grades (role-scoped)
PUT    /api/v1/grades/:studentId/:courseId/:componentId – Enter/update grade
POST   /api/v1/grades/publish          – Publish grades for course+period
GET    /api/v1/grades/gpa/:studentId   – Get cumulative GPA
GET    /api/v1/grades/transcript/:studentId – Get academic transcript
```

### Attendance

```
GET    /api/v1/attendance              – List records (role-scoped)
POST   /api/v1/attendance/mark         – Mark attendance for a session
PATCH  /api/v1/attendance/:id          – Amend attendance record
GET    /api/v1/attendance/summary/:studentId/:courseId – Attendance percentage
GET    /api/v1/attendance/config/threshold – Get current threshold
PUT    /api/v1/attendance/config/threshold – Set threshold (Admin Staff)
```

### Timetable

```
GET    /api/v1/timetable               – Get timetable (role-scoped)
POST   /api/v1/timetable               – Create entry (Admin Staff)
PATCH  /api/v1/timetable/:id           – Update entry
DELETE /api/v1/timetable/:id           – Delete entry
POST   /api/v1/timetable/publish/:periodId – Publish timetable
```

### Fees

```
GET    /api/v1/fees/:studentId         – Get fee records
POST   /api/v1/fees                    – Create fee record
POST   /api/v1/fees/:id/payment        – Record payment
PATCH  /api/v1/fees/:id/waiver         – Apply waiver
GET    /api/v1/fees/:id/receipt        – Download payment receipt (PDF)
```

### Library

```
GET    /api/v1/library/catalogue       – Search catalogue
POST   /api/v1/library/resources       – Add resource (Admin Staff)
PATCH  /api/v1/library/resources/:id   – Update resource
DELETE /api/v1/library/resources/:id   – Remove resource
POST   /api/v1/library/loans           – Record loan
PATCH  /api/v1/library/loans/:id/return – Mark returned
GET    /api/v1/library/loans/:studentId – Student's loans
```

### Hostel

```
GET    /api/v1/hostels                 – List hostels
POST   /api/v1/hostels                 – Create hostel record
PATCH  /api/v1/hostels/:id             – Update hostel
POST   /api/v1/hostels/allocations     – Create allocation
PATCH  /api/v1/hostels/allocations/:id/terminate – Early termination
GET    /api/v1/hostels/allocations/:studentId     – Student allocations
```

### Alumni & Placement

```
GET    /api/v1/alumni                  – List alumni (role-scoped)
PATCH  /api/v1/alumni/:id              – Update alumni record
POST   /api/v1/alumni/:id/placements   – Add career placement
GET    /api/v1/placements/listings     – List job/internship listings
POST   /api/v1/placements/listings     – Create listing
POST   /api/v1/placements/listings/:id/apply – Submit application
POST   /api/v1/placements/outcomes     – Record placement outcome
```

### Parent/Guardian

```
POST   /api/v1/guardians               – Create guardian account
POST   /api/v1/guardians/:id/link      – Link to student
GET    /api/v1/guardians/:id/students  – View linked students' data
PATCH  /api/v1/guardians/:id/contact   – Update own contact details
```

### Notifications

```
GET    /api/v1/notifications/logs      – View notification log (Super Admin)
POST   /api/v1/notifications/retry/:id – Retry failed notification
PUT    /api/v1/notifications/config    – Update gateway credentials (Super Admin)
PATCH  /api/v1/notifications/types/:type – Enable/disable notification type
```

### Reports

```
GET    /api/v1/reports/enrollment      – Enrollment report
GET    /api/v1/reports/grades          – Grade report
GET    /api/v1/reports/attendance      – Attendance report
GET    /api/v1/reports/fees            – Fee statement
GET    /api/v1/reports/loans           – Library loan report
GET    /api/v1/reports/hostel          – Hostel occupancy report
GET    /api/v1/reports/alumni          – Alumni report
GET    /api/v1/reports/placement       – Placement report
```

All report endpoints accept `?format=pdf|csv` and scope filters (departmentId, periodId, studentId).

### Audit Log

```
GET    /api/v1/audit                   – Search/filter audit log (Super Admin)
```

---

## Component Breakdown

### Backend (NestJS Modules)

```
src/
├── app.module.ts
├── common/
│   ├── guards/
│   │   ├── jwt-auth.guard.ts        – Validates JWT
│   │   └── rbac.guard.ts            – Checks role permissions
│   ├── interceptors/
│   │   └── audit.interceptor.ts     – Captures CUD operations
│   ├── decorators/
│   │   └── require-permission.decorator.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   └── pipes/
│       └── validation.pipe.ts
│
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts          – Login, lockout, session management
│   │   ├── auth.controller.ts
│   │   ├── password-reset.service.ts
│   │   └── strategies/
│   │       └── local.strategy.ts
│   │
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.service.ts
│   │   └── users.controller.ts
│   │
│   ├── students/
│   │   ├── students.module.ts
│   │   ├── students.service.ts
│   │   └── students.controller.ts
│   │
│   ├── enrollment/
│   ├── grades/
│   │   ├── grades.service.ts
│   │   └── gpa-calculator.service.ts – Pure grade computation
│   │
│   ├── attendance/
│   │   ├── attendance.service.ts
│   │   └── attendance-calculator.service.ts – Pure percentage computation
│   │
│   ├── timetable/
│   │   └── conflict-detector.service.ts – Pure conflict detection
│   │
│   ├── fees/
│   │   └── balance-calculator.service.ts – Pure balance computation
│   │
│   ├── library/
│   ├── hostel/
│   ├── alumni/
│   ├── placement/
│   ├── guardian/
│   ├── notifications/
│   │   ├── notification.module.ts
│   │   ├── notification.service.ts  – Enqueues jobs
│   │   ├── notification.processor.ts – BullMQ processor
│   │   ├── email.provider.ts
│   │   ├── sms.provider.ts
│   │   └── notification-log.repository.ts
│   │
│   ├── reports/
│   │   ├── reports.service.ts
│   │   ├── pdf-generator.service.ts – Puppeteer
│   │   └── csv-generator.service.ts
│   │
│   └── audit/
│       ├── audit.module.ts
│       ├── audit.service.ts
│       └── audit-log.repository.ts
```

### Frontend (React)

```
src/
├── pages/
│   ├── auth/           – Login, forgot-password
│   ├── dashboard/      – Role-specific landing pages
│   ├── students/
│   ├── grades/
│   ├── attendance/
│   ├── timetable/
│   ├── fees/
│   ├── library/
│   ├── hostel/
│   ├── alumni/
│   ├── placement/
│   ├── guardian/
│   ├── notifications/
│   ├── reports/
│   └── audit/
│
├── components/
│   ├── common/          – DataTable, ExportButton, RoleGate
│   └── domain/          – GradeEntry, AttendanceMarker, TimetableGrid
│
├── hooks/               – useAuth, useRbac, useReport
├── api/                 – Axios clients per module
└── contexts/            – AuthContext, NotificationContext
```

---

## Data Flow: Key Workflows

### Grade Publication Flow

```
Lecturer → POST /grades/publish
  → GradeService.validateAllComponentsEntered()
  → If missing: return warning list (requirement 4.6)
  → If confirmed: update grades.is_published = true
  → AuditInterceptor logs the change
  → NotificationService.enqueueBulkNotification(enrolledStudents, 'grade_published')
  → BullMQ dispatches email + SMS to each student within 5 minutes
```

### Attendance Threshold Check Flow

```
Lecturer → POST /attendance/mark (batch)
  → AttendanceCalculator.computePercentage(studentId, courseId)
  → If percentage < threshold:
      NotificationService.enqueue(student, 'low_attendance')
      NotificationService.enqueue(guardians, 'low_attendance')
```

### Timetable Conflict Detection Flow

```
Admin → POST /timetable
  → ConflictDetector.check(newEntry)
    → Query: overlapping (lecturer | room | student_group) in same period
    → Overlap condition: new.start_time < existing.end_time AND new.end_time > existing.start_time
    → AND same day_of_week AND same academic_period_id
  → If conflict: 400 with conflicting entry details
  → If clear: save entry
```

### Audit Log Flow

```
Any mutating request
  → AuditInterceptor.intercept()
    → loadBefore(recordType, recordId)
    → proceed(handler)
    → loadAfter(recordType, recordId)
    → AuditService.log({ actor, operation, recordType, recordId, previous, new })
    → INSERT INTO audit_logs (immutable — no UPDATE/DELETE grants)
```

---

## Error Handling Strategy

| Scenario | HTTP Status | Response Code |
|---|---|---|
| Unauthenticated request | 401 | `UNAUTHENTICATED` |
| Role permission denied | 403 | `ACCESS_DENIED` |
| Resource not found | 404 | `NOT_FOUND` |
| Validation failure | 422 | `VALIDATION_ERROR` |
| Enrollment over capacity | 409 | `ENROLLMENT_CAPACITY_EXCEEDED` |
| Timetable conflict | 409 | `TIMETABLE_CONFLICT` |
| Hostel capacity exceeded | 409 | `HOSTEL_CAPACITY_EXCEEDED` |
| Zero library copies | 409 | `LIBRARY_NO_COPIES` |
| Academic period locked | 423 | `PERIOD_LOCKED` |
| Account locked | 423 | `ACCOUNT_LOCKED` |
| Internal error | 500 | `INTERNAL_ERROR` |

All error responses omit sensitive data (no stack traces in production; no data from restricted resources).

---

## Security Design

- **Password hashing**: bcrypt with work factor 12
- **JWT**: short-lived (15 min) access tokens + Redis-backed session invalidation
- **Session re-evaluation**: RBAC guard reads role from Redis on every request — role changes take effect immediately without token reissue
- **Account deactivation**: triggers `DEL user:{id}:session` in Redis, invalidating all active tokens
- **Audit log immutability**: PostgreSQL-level REVOKE prevents application role from UPDATE/DELETE on `audit_logs`
- **File uploads**: validated MIME type + size server-side; stored in MinIO with presigned URLs (not directly accessible)
- **SQL injection prevention**: all queries via TypeORM parameterised query builder
- **CSRF protection**: SameSite=Strict cookie + custom header check for state-mutating requests
- **Rate limiting**: Nginx + per-route NestJS throttle guards

---


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

---

### Property 1: Role permission enforcement

*For any* (user, resource, action) triple, the RBAC guard SHALL grant access if and only if the user's current role has that action on that resource in the permission matrix. No request outside the role's permitted set shall return data from the restricted resource.

**Validates: Requirements 1.1, 1.2**

---

### Property 2: Role change takes effect on next request

*For any* user whose role is changed from role A to role B, the next request made by that user SHALL be evaluated under role B's permissions, not role A's, regardless of whether the user's session was established before or after the role change.

**Validates: Requirements 1.5, 1.7**

---

### Property 3: Account deactivation invalidates all sessions

*For any* user with one or more active sessions, deactivating that user's account SHALL cause every subsequent request from any of those sessions to be rejected with an authentication error.

**Validates: Requirements 1.8**

---

### Property 4: Role change produces an audit log entry

*For any* role assignment change, the audit log SHALL contain exactly one entry recording the actor, the affected user, the previous role, the new role, and a UTC timestamp.

**Validates: Requirements 1.6, 15.1, 15.2**

---

### Property 5: Account lockout after five consecutive failures

*For any* user account, submitting five consecutive invalid credential attempts SHALL lock the account, causing the sixth and all subsequent login attempts to be rejected until the lockout period expires.

**Validates: Requirements 2.3**

---

### Property 6: Password complexity validation

*For any* candidate password string, the validation function SHALL accept it if and only if it has length ≥ 8, contains at least one uppercase letter, at least one lowercase letter, at least one digit, and at least one special character. Any string missing one or more of these criteria SHALL be rejected.

**Validates: Requirements 2.4**

---

### Property 7: Password reset token expiry

*For any* password reset token, the token SHALL be accepted when used within 60 minutes of generation and rejected when used at or after the 60-minute mark.

**Validates: Requirements 2.6**

---

### Property 8: Login attempt audit completeness

*For any* login attempt — whether successful or failed — the audit log SHALL contain an entry capturing the username, IP address, and UTC timestamp.

**Validates: Requirements 2.7**

---

### Property 9: Student identification number uniqueness

*For any* set of student profiles created in SIMS, all generated student identification numbers SHALL be distinct. No two profiles SHALL share the same student number.

**Validates: Requirements 3.2**

---

### Property 10: Enrollment capacity enforcement

*For any* course that has reached its `max_enrollment` count, any further enrollment attempt SHALL be rejected with a capacity-exceeded error. The enrolled count SHALL never exceed `max_enrollment`.

**Validates: Requirements 3.4**

---

### Property 11: Grade notification on publication

*For any* grade publication event for a course in an academic period, every student enrolled in that course-period SHALL have a notification record created in `notification_logs` for the `grade_published` trigger event.

**Validates: Requirements 4.2**

---

### Property 12: Weighted grade calculation correctness

*For any* set of assessment components with weights summing to 100% and a corresponding set of student scores, the computed final grade SHALL equal the sum of (score × weight / 100) for each component, rounded to two decimal places.

**Validates: Requirements 4.3**

---

### Property 13: Grade publication blocked when mandatory components missing

*For any* course-period publication attempt where at least one enrolled student has no score recorded for at least one mandatory assessment component, the system SHALL reject the publication (or require explicit confirmation) and return the list of affected students.

**Validates: Requirements 4.6**

---

### Property 14: Locked academic period prevents grade modification

*For any* academic period whose `is_locked` flag is true, any attempt to create, update, or delete a grade record for that period SHALL be rejected with a period-locked error.

**Validates: Requirements 4.9**

---

### Property 15: GPA computation correctness

*For any* student and any set of published final grades, the computed cumulative GPA SHALL equal the sum of (grade_points × credit_hours) for all courses divided by the total credit_hours, using the college's defined grading scale.

**Validates: Requirements 4.10**

---

### Property 16: Attendance percentage formula correctness

*For any* student enrolled in a course, the computed attendance percentage SHALL equal ((sessions marked present + sessions marked late) / total sessions conducted) × 100, rounded to two decimal places. This SHALL hold for all values of present, late, and total sessions including zero total sessions (which shall yield 0.00%).

**Validates: Requirements 5.2**

---

### Property 17: Low-attendance notification threshold

*For any* student whose attendance percentage for a course falls strictly below the configured threshold, the system SHALL enqueue a notification for both the student and every linked parent/guardian. Students at or above the threshold SHALL NOT receive a low-attendance notification.

**Validates: Requirements 5.3, 12.4**

---

### Property 18: Attendance threshold validation bounds

*For any* candidate threshold value, the system SHALL accept values in the closed interval [50, 100] and reject all values outside that interval.

**Validates: Requirements 5.4**

---

### Property 19: Attendance amendment time-based authorisation

*For any* attendance record amendment, if the amendment is made within 48 hours of the session date it SHALL be permitted for the recording lecturer; if the amendment is made more than 48 hours after the session date it SHALL require Admin Staff authorisation. Any amendment outside these authorisation rules SHALL be rejected.

**Validates: Requirements 5.7**

---

### Property 20: Timetable conflict detection

*For any* two timetable entries in the same academic period sharing the same lecturer, room, or enrolled student group, the system SHALL detect a conflict if and only if their time intervals overlap on the same day (i.e., entry_a.start_time < entry_b.end_time AND entry_a.end_time > entry_b.start_time on the same day_of_week). Entries with non-overlapping times or on different days SHALL NOT be flagged as conflicts.

**Validates: Requirements 6.2, 6.3**

---

### Property 21: Fee balance invariant

*For any* student's fee account, the outstanding balance SHALL always equal the sum of all fee amounts due (minus waivers) minus the sum of all recorded payments. This invariant SHALL hold after every payment, waiver, or fee record creation.

**Validates: Requirements 7.2, 7.3**

---

### Property 22: Fee due-date reminder notification

*For any* fee record where the outstanding balance is greater than zero, the system SHALL send a reminder notification to the student and linked parent/guardian if and only if the current date is exactly 7 days before the due date. Fee records already paid in full SHALL NOT trigger a reminder.

**Validates: Requirements 7.4, 12.4**

---

### Property 23: Library available-copies invariant (round trip)

*For any* library resource, recording a loan SHALL decrement `available_copies` by exactly one, and marking that loan as returned SHALL increment `available_copies` by exactly one. The value of `available_copies` after N loans and M returns (M ≤ N) SHALL equal initial_copies − (N − M). `available_copies` SHALL never be negative or exceed `total_copies`.

**Validates: Requirements 8.3, 8.4**

---

### Property 24: Zero available copies blocks loan

*For any* library resource where `available_copies` equals zero, any attempt to create a new loan for that resource SHALL be rejected.

**Validates: Requirements 8.9**

---

### Property 25: Hostel occupancy capacity enforcement

*For any* hostel room, the number of active (non-terminated) allocations SHALL never exceed `max_occupancy`. Any allocation attempt that would cause the active count to exceed `max_occupancy` SHALL be rejected.

**Validates: Requirements 9.3**

---

### Property 26: Hostel allocation triggers fee record

*For any* hostel allocation that is successfully created, the system SHALL automatically create a corresponding fee record in the hostel fee category with the amount and due date determined by the configured hostel fee schedule. No allocation SHALL exist without a corresponding fee record.

**Validates: Requirements 9.7**

---

### Property 27: Student graduation creates alumni record

*For any* student profile whose status is changed to "Graduated", the system SHALL automatically create an alumni record capturing the student's identification number, programme of study, graduation date, and final GPA. The alumni record SHALL contain values that match the student profile at the time of graduation.

**Validates: Requirements 10.1**

---

### Property 28: Notification log completeness

*For any* triggered notification event, the system SHALL create at least one entry in `notification_logs` per (recipient, channel) pair, recording the recipient identifier, notification type, trigger event, dispatch timestamp, and status. No notification attempt SHALL be made without a corresponding log entry.

**Validates: Requirements 13.4**

---

### Property 29: Notification retry behaviour

*For any* notification whose initial dispatch fails, the system SHALL retry the dispatch up to 3 additional times. Each retry SHALL occur no sooner than 10 minutes after the previous attempt. After 3 failed retries the notification status SHALL be set to "failed" and no further retries SHALL occur.

**Validates: Requirements 13.6**

---

### Property 30: Audit log entry completeness

*For any* create, update, or delete operation performed on a student profile, grade, attendance record, fee record, hostel allocation, role assignment, or library loan, the system SHALL produce an audit log entry containing: actor UUID, operation type, record type name, affected record UUID, previous values (for updates/deletes), new values (for creates/updates), and UTC timestamp.

**Validates: Requirements 15.1, 15.2**

---

### Property 31: Audit log immutability

*For any* user of any role, including Super Admin, any attempt to modify or delete an existing audit log entry through the SIMS user interface or API SHALL be rejected. The audit log SHALL only grow — entries are never altered or removed.

**Validates: Requirements 15.5**

---

## Testing Strategy

### Dual Testing Approach

All test files live under `src/__tests__/` (unit/property) and `e2e/` (end-to-end).

**Unit tests** cover specific examples, edge cases, role-permission spot checks, and integration points between services.

**Property tests** (via [fast-check](https://github.com/dubzzz/fast-check)) cover all 31 properties above, each running a minimum of 100 iterations over randomly generated inputs.

### Property Test File Organisation

```
src/__tests__/
├── properties/
│   ├── rbac.property.test.ts          – Properties 1, 2, 3, 4
│   ├── auth.property.test.ts          – Properties 5, 6, 7, 8
│   ├── students.property.test.ts      – Properties 9, 10
│   ├── grades.property.test.ts        – Properties 11, 12, 13, 14, 15
│   ├── attendance.property.test.ts    – Properties 16, 17, 18, 19
│   ├── timetable.property.test.ts     – Property 20
│   ├── fees.property.test.ts          – Properties 21, 22
│   ├── library.property.test.ts       – Properties 23, 24
│   ├── hostel.property.test.ts        – Properties 25, 26
│   ├── alumni.property.test.ts        – Property 27
│   ├── notifications.property.test.ts – Properties 28, 29
│   └── audit.property.test.ts         – Properties 30, 31
```

### Sample Property Test (Weighted Grade Calculation)

```typescript
import * as fc from 'fast-check';
import { computeFinalGrade } from '../modules/grades/gpa-calculator.service';

describe('Property 12: Weighted grade calculation correctness', () => {
  it('For any set of components with weights summing to 100, final grade equals weighted sum', () => {
    fc.assert(
      fc.property(
        // Generate 1-5 components with weights summing to 100
        fc.array(fc.float({ min: 0, max: 100 }), { minLength: 1, maxLength: 5 }).chain(scores => {
          return fc.array(
            fc.float({ min: 1, max: 100 }), { minLength: scores.length, maxLength: scores.length }
          ).map(rawWeights => {
            const total = rawWeights.reduce((a, b) => a + b, 0);
            const weights = rawWeights.map(w => (w / total) * 100);
            return scores.map((score, i) => ({ score, weight: weights[i] }));
          });
        }),
        (components) => {
          const result = computeFinalGrade(components);
          const expected = components.reduce((sum, c) => sum + (c.score * c.weight / 100), 0);
          expect(result).toBeCloseTo(expected, 2);
        }
      ),
      // Feature: student-information-management-system, Property 12: weighted grade calculation correctness
      { numRuns: 1000 }
    );
  });
});
```

### Sample Property Test (Attendance Percentage Formula)

```typescript
import * as fc from 'fast-check';
import { computeAttendancePercentage } from '../modules/attendance/attendance-calculator.service';

describe('Property 16: Attendance percentage formula correctness', () => {
  it('For any attendance records, percentage = (present + late) / total * 100, rounded to 2dp', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200 }), // present
        fc.integer({ min: 0, max: 200 }), // late
        fc.integer({ min: 0, max: 200 }), // absent
        (present, late, absent) => {
          const total = present + late + absent;
          const result = computeAttendancePercentage({ present, late, absent });
          const expected = total === 0 ? 0 : Math.round(((present + late) / total) * 10000) / 100;
          expect(result).toBe(expected);
        }
      ),
      // Feature: student-information-management-system, Property 16: attendance percentage formula correctness
      { numRuns: 1000 }
    );
  });
});
```

### Sample Property Test (Timetable Conflict Detection)

```typescript
import * as fc from 'fast-check';
import { detectConflict } from '../modules/timetable/conflict-detector.service';

describe('Property 20: Timetable conflict detection', () => {
  it('For any two entries, conflict detected iff time intervals overlap on same day/lecturer/room', () => {
    fc.assert(
      fc.property(
        fc.record({
          start: fc.integer({ min: 480, max: 1380 }), // minutes from midnight
          duration: fc.integer({ min: 30, max: 180 }),
          day: fc.integer({ min: 1, max: 7 }),
          room: fc.constantFrom('A1', 'A2', 'B1'),
          lecturerId: fc.constantFrom('lec1', 'lec2', 'lec3'),
        }),
        fc.record({
          start: fc.integer({ min: 480, max: 1380 }),
          duration: fc.integer({ min: 30, max: 180 }),
          day: fc.integer({ min: 1, max: 7 }),
          room: fc.constantFrom('A1', 'A2', 'B1'),
          lecturerId: fc.constantFrom('lec1', 'lec2', 'lec3'),
        }),
        (a, b) => {
          const aEnd = a.start + a.duration;
          const bEnd = b.start + b.duration;
          const timesOverlap = a.start < bEnd && aEnd > b.start;
          const sharesResource = a.day === b.day && (a.room === b.room || a.lecturerId === b.lecturerId);
          const expectedConflict = timesOverlap && sharesResource;
          expect(detectConflict(a, b)).toBe(expectedConflict);
        }
      ),
      // Feature: student-information-management-system, Property 20: timetable conflict detection
      { numRuns: 1000 }
    );
  });
});
```

### Sample Property Test (Library Available Copies Round Trip)

```typescript
import * as fc from 'fast-check';
import { simulateLibraryOperations } from '../modules/library/library.service';

describe('Property 23: Library available-copies invariant', () => {
  it('For any sequence of loans and returns, available_copies stays consistent', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),  // initial copies
        fc.array(fc.constantFrom('loan', 'return'), { minLength: 1, maxLength: 50 }),
        (initialCopies, operations) => {
          const result = simulateLibraryOperations(initialCopies, operations);
          expect(result.availableCopies).toBeGreaterThanOrEqual(0);
          expect(result.availableCopies).toBeLessThanOrEqual(initialCopies);
          const netLoans = result.loans - result.returns;
          expect(result.availableCopies).toBe(initialCopies - netLoans);
        }
      ),
      // Feature: student-information-management-system, Property 23: library available-copies invariant
      { numRuns: 500 }
    );
  });
});
```

### Sample Property Test (Fee Balance Invariant)

```typescript
import * as fc from 'fast-check';
import { computeOutstandingBalance } from '../modules/fees/balance-calculator.service';

describe('Property 21: Fee balance invariant', () => {
  it('For any set of fee records and payments, outstanding = sum(fees - waivers) - sum(payments)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          amountDue: fc.float({ min: 1, max: 10000, noNaN: true }),
          waiver: fc.float({ min: 0, max: 500, noNaN: true }),
        }), { minLength: 0, maxLength: 20 }),
        fc.array(fc.float({ min: 1, max: 5000, noNaN: true }), { minLength: 0, maxLength: 30 }),
        (fees, payments) => {
          const totalCharged = fees.reduce((s, f) => s + Math.max(0, f.amountDue - f.waiver), 0);
          const totalPaid = payments.reduce((s, p) => s + p, 0);
          const expected = Math.max(0, totalCharged - totalPaid);
          const result = computeOutstandingBalance(fees, payments);
          expect(result).toBeCloseTo(expected, 2);
        }
      ),
      // Feature: student-information-management-system, Property 21: fee balance invariant
      { numRuns: 1000 }
    );
  });
});
```

---

## Infrastructure Notes

### Environment Configuration

```
DATABASE_URL=postgresql://sims_app:secret@postgres:5432/sims
REDIS_URL=redis://redis:6379
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
JWT_SECRET=...
JWT_EXPIRES_IN=15m
SESSION_TTL_SECONDS=1800   # 30-minute idle timeout
```

### Background Job Queues (BullMQ)

| Queue | Purpose | Concurrency |
|---|---|---|
| `notification:email` | Email dispatch with retry | 5 |
| `notification:sms` | SMS dispatch with retry | 5 |
| `report:generate` | PDF/CSV report generation | 3 |
| `audit:write` | Async audit log writes | 10 |

### File Upload Constraints

| Type | Allowed Formats | Max Size |
|---|---|---|
| Student photo | JPEG, PNG | 2 MB |
| Resume (job application) | PDF | 5 MB |
| Generated reports | PDF, CSV | Unlimited (streamed) |

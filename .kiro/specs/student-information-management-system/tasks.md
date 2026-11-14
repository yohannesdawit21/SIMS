# Implementation Plan: Student Information Management System (SIMS)

## Overview

Full-stack implementation of SIMS using NestJS + TypeScript (backend), React 18 + Ant Design (frontend), PostgreSQL 16, Redis, BullMQ, and MinIO. The plan is ordered to establish infrastructure first, then backend domain modules, then frontend, ensuring each step integrates cleanly into the previous. Property-based tests (Vitest + fast-check) are placed close to the logic they validate.

---

## Tasks

- [x] 1. Project Scaffolding and Infrastructure Setup
  - [x] 1.1 Initialise monorepo structure with NestJS backend and React+Vite frontend
    - Bootstrap NestJS project (`nest new backend`) with TypeScript strict mode
    - Bootstrap React 18 + Vite project (`npm create vite@latest frontend -- --template react-ts`)
    - Set up root `package.json` with workspaces and shared scripts
    - Configure `docker-compose.yml` with services: `postgres`, `redis`, `minio`, `backend`, `frontend`, `nginx`
    - Add `.env.example` with all required environment variables (DATABASE_URL, REDIS_URL, MINIO_*, JWT_*, SESSION_TTL_SECONDS)
    - _Requirements: Infrastructure prerequisite for all modules_

  - [x] 1.2 Configure backend core: TypeORM, Redis, BullMQ, MinIO clients
    - Install and configure TypeORM with PostgreSQL 16 driver; add `ormconfig` pointing to DATABASE_URL
    - Configure `@nestjs/bull` with BullMQ adapter connected to REDIS_URL
    - Set up MinIO SDK client as a NestJS provider with access/secret from env
    - Configure Redis client (`ioredis`) for session store and config cache
    - Add global `ValidationPipe`, `HttpExceptionFilter`, and standard response envelope interceptor
    - _Requirements: 2.1, 7.3, 8.1, 13.2_

  - [x] 1.3 Create all TypeORM entity files matching the database schema
    - Implement entities: `User`, `Department`, `AcademicPeriod`, `Programme`, `Course`, `CourseLecturer`, `StudentProfile`, `Enrollment`
    - Implement entities: `AssessmentComponent`, `Grade`, `FinalGrade`
    - Implement entities: `TimetableEntry`, `TimetableSession`, `AttendanceRecord`
    - Implement entities: `FeeCategory`, `FeeRecord`, `Payment`
    - Implement entities: `LibraryResource`, `LibraryLoan`
    - Implement entities: `Hostel`, `HostelAllocation`
    - Implement entities: `Alumni`, `CareerPlacement`, `JobListing`, `JobListingProgramme`, `JobApplication`
    - Implement entities: `ParentGuardian`, `GuardianStudentLink`
    - Implement entities: `NotificationLog`, `AuditLog` (partitioned)
    - _Requirements: 3.1, 4.1, 5.1, 6.1, 7.1, 8.1, 9.1, 10.1, 11.1, 12.1, 13.4, 15.1_

  - [x] 1.4 Write and run database migrations
    - Generate TypeORM migration for all entity tables including constraints, indexes, and CHECK constraints
    - Add `PARTITION BY RANGE (created_at)` DDL for `audit_logs` and create initial yearly partitions
    - Execute `REVOKE UPDATE, DELETE ON audit_logs FROM sims_app` in a migration
    - Add index on `audit_logs(actor_id, record_type, created_at)` for search performance
    - _Requirements: 15.4, 15.5_

- [x] 2. Common Infrastructure: Guards, Interceptors, and Decorators
  - [x] 2.1 Implement JWT authentication guard and Passport local strategy
    - Implement `LocalStrategy` (Passport) validating username + password via `AuthService`
    - Implement `JwtAuthGuard` validating Bearer token and loading session from Redis
    - Implement `@Public()` decorator to bypass auth on login/reset endpoints
    - _Requirements: 2.1, 2.2_

  - [x] 2.2 Implement RBAC guard and permission decorator
    - Define static `PERMISSION_MATRIX` TypeScript constant covering all 22 feature-action entries from the permission matrix in the design
    - Implement `RbacGuard` that reads the user's current role from Redis session on every request and evaluates against `PERMISSION_MATRIX`
    - Implement `@RequirePermission(feature, action)` decorator
    - _Requirements: 1.1, 1.2, 1.5, 1.7_

  - [x] 2.3 Write property tests for RBAC guard (Properties 1, 2, 3, 4)
    - **Property 1: Role permission enforcement** — for any (user, resource, action) triple, guard grants iff role has that permission
    - **Property 2: Role change takes effect on next request** — after role change, next request evaluated under new role
    - **Property 3: Account deactivation invalidates all sessions** — deactivated user's sessions all rejected
    - **Property 4: Role change produces an audit log entry** — exactly one audit entry per role change
    - File: `src/__tests__/properties/rbac.property.test.ts`
    - **Validates: Requirements 1.1, 1.2, 1.5, 1.6, 1.7, 1.8**

  - [x] 2.4 Implement Audit Interceptor
    - Implement global `AuditInterceptor` that intercepts POST/PUT/PATCH/DELETE requests
    - Load before-state via `AuditService.loadBefore(recordType, recordId)`
    - After handler resolves, load after-state and call `AuditService.log()`
    - Insert into `audit_logs` — must use a write path with no UPDATE/DELETE
    - _Requirements: 15.1, 15.2_

  - [ ]* 2.5 Write property tests for audit log (Properties 30, 31)
    - **Property 30: Audit log entry completeness** — every CUD operation on covered entities produces an entry with all required fields
    - **Property 31: Audit log immutability** — any attempt to modify or delete an audit entry is rejected for any role
    - File: `src/__tests__/properties/audit.property.test.ts`
    - **Validates: Requirements 15.1, 15.2, 15.5**

- [x] 3. Checkpoint — Core infrastructure ready
  - Ensure all migrations run cleanly, entities load without errors, guards compile, interceptor is globally applied. Run `vitest --run` to confirm no test failures.

- [x] 4. Auth Module
  - [x] 4.1 Implement AuthService: login, lockout, session management, logout
    - Implement `login()`: validate credentials, enforce 5-attempt lockout (lock for 30 min on 5th failure), write audit log for success/failure, issue JWT (15 min), store session in Redis with TTL = SESSION_TTL_SECONDS
    - Implement `logout()`: delete Redis session key `user:{id}:session`
    - Implement `refreshToken()`: validate existing JWT, issue new one
    - On account deactivation trigger: `DEL user:{id}:session` in Redis
    - _Requirements: 2.1, 2.2, 2.3, 2.7_

  - [ ]* 4.2 Write property tests for auth (Properties 5, 6, 7, 8)
    - **Property 5: Account lockout after five consecutive failures** — 5th failure locks; 6th+ rejected until lockout expires
    - **Property 6: Password complexity validation** — accepts iff length ≥ 8, has upper, lower, digit, special; rejects otherwise
    - **Property 7: Password reset token expiry** — accepted < 60 min; rejected ≥ 60 min
    - **Property 8: Login attempt audit completeness** — every login attempt has audit entry with username, IP, UTC timestamp
    - File: `src/__tests__/properties/auth.property.test.ts`
    - **Validates: Requirements 2.3, 2.4, 2.6, 2.7**

  - [x] 4.3 Implement password reset service
    - `requestReset()`: generate time-limited token (expires 60 min), send via Nodemailer, store hashed token in Redis
    - `resetPassword()`: validate token not expired, validate new password complexity, hash with bcrypt (work factor 12), update `users.password_hash`, invalidate token
    - _Requirements: 2.4, 2.6_

  - [x] 4.4 Implement AuthController: POST /auth/login, /auth/logout, /auth/refresh, /auth/forgot-password, /auth/reset-password
    - Wire all endpoints; apply `@Public()` on login and reset endpoints; all others require `JwtAuthGuard`
    - Return standard response envelope; return error codes from error handling table
    - _Requirements: 2.1, 2.5, 2.6_

- [x] 5. Users Module (Super Admin)
  - [x] 5.1 Implement UsersService: CRUD for user accounts and role assignments
    - Implement `create()`, `findAll()`, `findOne()`, `update()` (including role), `deactivate()`
    - On role change: update Redis session with new role, write audit log entry (actor, affected user, previous role, new role, timestamp)
    - On deactivation: `DEL user:{id}:session` in Redis, write audit log entry
    - _Requirements: 1.3, 1.5, 1.6, 1.8_

  - [x] 5.2 Implement UsersController: GET/POST/PATCH /users and /users/:id/deactivate
    - Apply `@RequirePermission('user_management', 'any')` — Super Admin only
    - _Requirements: 1.3_

- [ ] 6. Students Module
  - [ ] 6.1 Implement StudentsService: create profile, generate student number, update, deactivate
    - `create()`: validate all required fields, generate unique immutable student number (format: system-defined), create `StudentProfile` + linked `User`
    - `update()`: update all fields except `student_number`; write audit log
    - `deactivate()`: set `is_active = false` on linked `User`; write audit log
    - `uploadPhoto()`: validate MIME (JPEG/PNG) and size (≤ 2 MB), store in MinIO, update `photo_url`
    - Role-scoped `findAll()`: Admin Staff/Super Admin see all; Dept Head sees own dept; Student sees only own
    - _Requirements: 3.1, 3.2, 3.6, 3.8, 3.9, 3.10_

  - [ ]* 6.2 Write property tests for students (Properties 9, 10)
    - **Property 9: Student identification number uniqueness** — for any set of created profiles, all student numbers are distinct
    - **Property 10: Enrollment capacity enforcement** — enrolled count never exceeds `max_enrollment`; further attempts rejected
    - File: `src/__tests__/properties/students.property.test.ts`
    - **Validates: Requirements 3.2, 3.4**

  - [ ] 6.3 Implement EnrollmentService: enroll student in course, remove enrollment, capacity check
    - `enroll()`: check `student.status === 'active'`, check `course.current_enrollment < course.max_enrollment`, insert enrollment, increment `current_enrollment`
    - `remove()`: delete enrollment, decrement `current_enrollment`
    - Return 409 `ENROLLMENT_CAPACITY_EXCEEDED` when at capacity
    - _Requirements: 3.3, 3.4_

  - [x] 6.4 Implement StudentsController and EnrollmentController
    - Wire all endpoints from API design section; apply role-scoped guards
    - POST /students/:id/photo: multipart upload
    - _Requirements: 3.1–3.10_

- [ ] 7. Grades Module
  - [ ] 7.1 Implement pure `GpaCalculatorService` with `computeFinalGrade()` and `computeGpa()`
    - `computeFinalGrade(components: {score, weight}[])`: return `round(Σ(score × weight / 100), 2)`
    - `computeGpa(finalGrades: {grade_points, credit_hours}[])`: return `Σ(grade_points × credit_hours) / Σ(credit_hours)` using college grading scale
    - Both functions must be pure (no DB calls) to enable property testing
    - _Requirements: 4.3, 4.10_

  - [ ]* 7.2 Write property tests for grades (Properties 12, 15)
    - **Property 12: Weighted grade calculation correctness** — final grade = Σ(score × weight/100), rounded to 2 dp, for any weights summing to 100
    - **Property 15: GPA computation correctness** — cumulative GPA = Σ(grade_points × credit_hours) / Σ(credit_hours) for any set of published final grades
    - File: `src/__tests__/properties/grades.property.test.ts`
    - **Validates: Requirements 4.3, 4.10**

  - [x] 7.3 Implement GradesService: enter/edit grade, validate mandatory components, publish grades
    - `enterGrade()`: only the assigned lecturer can enter; check period not locked (423 if locked); upsert `grades` row
    - `publishGrades(courseId, periodId)`: query enrolled students; if any have missing mandatory component scores, return list (requirement 4.6) — proceed only on explicit `?force=true` confirmation; set `is_published = true`; enqueue `grade_published` notification for each enrolled student
    - `lockPeriod()`: set `academic_periods.is_locked = true`; after this, reject all grade CUD with 423
    - Role-scoped `findAll()`: Student sees only own published grades; Lecturer sees own courses; Dept Head sees dept; Admin/SuperAdmin see all
    - Write audit log on all grade CUD operations
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 4.8, 4.9_

  - [ ]* 7.4 Write property tests for grades (Properties 11, 13, 14)
    - **Property 11: Grade notification on publication** — every enrolled student in a published course-period has a `notification_logs` entry for `grade_published`
    - **Property 13: Grade publication blocked when mandatory components missing** — publication rejected/warned when any enrolled student has no score for a mandatory component
    - **Property 14: Locked academic period prevents grade modification** — any CUD on grades for a locked period is rejected with period-locked error
    - File: `src/__tests__/properties/grades.property.test.ts` (add to same file)
    - **Validates: Requirements 4.2, 4.6, 4.9**

  - [ ] 7.5 Implement GradesController: PUT /grades, POST /grades/publish, GET /grades/gpa/:studentId, GET /grades/transcript/:studentId
    - _Requirements: 4.1–4.10_

- [ ] 8. Attendance Module
  - [ ] 8.1 Implement pure `AttendanceCalculatorService` with `computeAttendancePercentage()`
    - `computeAttendancePercentage({present, late, absent})`: if total = 0 return 0.00; else return `round((present + late) / total * 100, 2)`
    - Pure function, no DB calls
    - _Requirements: 5.2_

  - [ ]* 8.2 Write property tests for attendance (Properties 16, 17, 18, 19)
    - **Property 16: Attendance percentage formula correctness** — formula holds for all values including zero total sessions
    - **Property 17: Low-attendance notification threshold** — students below threshold get notification; at/above do not
    - **Property 18: Attendance threshold validation bounds** — accepts [50, 100]; rejects outside
    - **Property 19: Attendance amendment time-based authorisation** — ≤48h: lecturer permitted; >48h: requires Admin Staff; others rejected
    - File: `src/__tests__/properties/attendance.property.test.ts`
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.7, 12.4**

  - [ ] 8.3 Implement AttendanceService: mark attendance, amend, threshold check, config
    - `markAttendance(sessionId, records[])`: only assigned lecturer for that course; insert/upsert `attendance_records`; after batch, compute percentage for each student, enqueue low-attendance notification if below threshold (also notify linked guardians)
    - `amendRecord(id, status)`: check amendment time — if ≤ 48h allow lecturer; if > 48h require role = admin_staff or super_admin; write audit log
    - `setThreshold(value)`: validate value ∈ [50, 100]; store in Redis config cache and DB config table
    - `getThreshold()`: read from Redis cache (fallback to DB)
    - _Requirements: 5.1, 5.3, 5.4, 5.7, 5.8_

  - [ ] 8.4 Implement AttendanceController: POST /attendance/mark, PATCH /attendance/:id, GET /attendance/summary, GET/PUT /attendance/config/threshold
    - _Requirements: 5.1–5.9_

- [ ] 9. Checkpoint — Academic core complete
  - Ensure `vitest --run` passes all property tests in Epics 2, 4, 7, and 8. Fix any failures before proceeding.

- [ ] 10. Timetable Module
  - [ ] 10.1 Implement pure `ConflictDetectorService` with `detectConflict()`
    - `detectConflict(a, b)`: returns true iff same `academic_period_id`, same `day_of_week`, and `a.start_time < b.end_time AND a.end_time > b.start_time`, and share lecturer, room, or enrolled student group
    - Pure function
    - _Requirements: 6.2, 6.3_

  - [ ]* 10.2 Write property tests for timetable (Property 20)
    - **Property 20: Timetable conflict detection** — conflict detected iff time intervals overlap on same day and shared resource; non-overlapping or different-day entries not flagged
    - File: `src/__tests__/properties/timetable.property.test.ts`
    - **Validates: Requirements 6.2, 6.3**

  - [ ] 10.3 Implement TimetableService: create entry with conflict check, publish, delete
    - `create()`: run `ConflictDetectorService.check()` against all existing entries for same period; if conflict detected return 409 with conflicting entry details; else save
    - `publish(periodId)`: set `is_published = true` for all entries in period; enqueue email notifications to all affected students and lecturers
    - `getForUser(userId, role)`: Student sees only enrolled courses; Lecturer sees own; Admin/DeptHead/SuperAdmin see all
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ] 10.4 Implement TimetableController: CRUD /timetable, POST /timetable/publish/:periodId
    - When exam entry added/updated, enqueue SMS+email notification to affected students (req 6.9)
    - _Requirements: 6.1–6.9_

- [ ] 11. Fees Module
  - [ ] 11.1 Implement pure `BalanceCalculatorService` with `computeOutstandingBalance()`
    - `computeOutstandingBalance(fees: {amountDue, waiver}[], payments: number[])`: return `max(0, Σ(amountDue - waiver) - Σ(payments))`
    - Pure function
    - _Requirements: 7.2_

  - [ ]* 11.2 Write property tests for fees (Properties 21, 22)
    - **Property 21: Fee balance invariant** — outstanding = Σ(fees - waivers) - Σ(payments), holds after every operation
    - **Property 22: Fee due-date reminder notification** — reminder sent iff outstanding > 0 and current date is exactly 7 days before due date; fully paid records do not trigger
    - File: `src/__tests__/properties/fees.property.test.ts`
    - **Validates: Requirements 7.2, 7.3, 7.4, 12.4**

  - [ ] 11.3 Implement FeesService: create fee record, record payment, apply waiver, auto-fee on hostel allocation
    - `createFeeRecord()`: Admin Staff only; create `fee_records` row
    - `recordPayment()`: insert `payments` row; `outstanding` is a generated column so no manual update needed; generate receipt PDF via `PdfGeneratorService` and store in MinIO; write audit log
    - `applyWaiver(feeId, amount, reason)`: validate amount ≤ `amount_due`; update `waiver_amount` and `waiver_reason`; write audit log
    - Due-date reminder job: BullMQ scheduled job checks daily for fee records where `outstanding > 0` and `due_date = NOW() + 7 days`; enqueues notifications to student + guardians
    - Overdue notification job: same pattern for `due_date < NOW()` and `outstanding > 0`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7_

  - [ ] 11.4 Implement FeesController: GET/POST /fees, POST /fees/:id/payment, PATCH /fees/:id/waiver, GET /fees/:id/receipt
    - _Requirements: 7.1–7.10_

- [ ] 12. Library Module
  - [ ] 12.1 Implement LibraryService: CRUD for resources, create loan, return loan, availability check
    - `createLoan()`: check `available_copies > 0`; if zero return 409 `LIBRARY_NO_COPIES`; insert loan, decrement `available_copies`; write audit log
    - `returnLoan()`: set `is_returned = true`, `returned_date = NOW()`; increment `available_copies`; write audit log
    - Overdue loan job: BullMQ daily job finds loans where `due_date < NOW()` and `is_returned = false`; enqueues SMS+email to student + guardians
    - `searchCatalogue(query)`: search by title, author, or category with ILIKE
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9_

  - [ ]* 12.2 Write property tests for library (Properties 23, 24)
    - **Property 23: Library available-copies invariant (round trip)** — N loans and M returns → `available_copies = initial - (N - M)`; never negative or above total
    - **Property 24: Zero available copies blocks loan** — loan attempt on resource with `available_copies = 0` is rejected
    - File: `src/__tests__/properties/library.property.test.ts`
    - **Validates: Requirements 8.3, 8.4, 8.9**

  - [ ] 12.3 Implement LibraryController: /library/catalogue, /library/resources, /library/loans
    - _Requirements: 8.1–8.9_

- [ ] 13. Hostel Module
  - [ ] 13.1 Implement HostelService: CRUD for hostels, create/terminate allocation, capacity check, auto-fee trigger
    - `createAllocation()`: check active allocation count < `max_occupancy`; if exceeded return 409 `HOSTEL_CAPACITY_EXCEEDED`; insert allocation; auto-create `fee_records` row in hostel category via `FeesService.createFeeRecord()` using configured schedule; write audit log
    - `terminateAllocation(id, departureDate, reason)`: set `departure_date` and `departure_reason`; write audit log
    - `getOccupancyCount(hostelId, date)`: count active (non-terminated, date in range) allocations
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.7_

  - [ ]* 13.2 Write property tests for hostel (Properties 25, 26)
    - **Property 25: Hostel occupancy capacity enforcement** — active allocation count never exceeds `max_occupancy`; excess attempt rejected
    - **Property 26: Hostel allocation triggers fee record** — every successful allocation has a corresponding hostel fee record; no allocation exists without one
    - File: `src/__tests__/properties/hostel.property.test.ts`
    - **Validates: Requirements 9.3, 9.7**

  - [ ] 13.3 Implement HostelController: CRUD /hostels, /hostels/allocations
    - _Requirements: 9.1–9.7_

- [ ] 14. Alumni and Placement Modules
  - [ ] 14.1 Implement AlumniService: auto-create alumni record on graduation, update contact, record placement
    - `onStudentGraduated(studentId)`: subscribe to student status change event; create `alumni` row with student number, programme, graduation date, final GPA; write audit log
    - `updateContactDetails()`: Alumni role can update own `current_email`, `current_phone`, `employer`, `job_title`
    - `addCareerPlacement()`: Admin Staff creates `career_placements` row
    - _Requirements: 10.1, 10.2, 10.3, 10.6_

  - [ ]* 14.2 Write property test for alumni (Property 27)
    - **Property 27: Student graduation creates alumni record** — for any student status changed to "Graduated", alumni record created with values matching student profile at graduation time
    - File: `src/__tests__/properties/alumni.property.test.ts`
    - **Validates: Requirements 10.1**

  - [ ] 14.3 Implement PlacementService: create/manage job listings, handle applications, record outcomes
    - `createListing()`: Admin Staff creates listing with eligible programmes; after creation enqueue email notifications to all enrolled students in eligible programmes
    - `applyToListing()`: Student submits PDF resume (validate MIME + ≤ 5 MB); upload to MinIO; insert `job_applications` (unique per listing+student)
    - `recordOutcome()`: Admin Staff creates `career_placements` row
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ] 14.4 Implement AlumniController and PlacementController
    - Wire all endpoints from API design; apply role guards
    - Alumni self-service endpoint for contact update: Alumni role only, no current student data access
    - _Requirements: 10.1–10.6, 11.1–11.6_

- [ ] 15. Parent/Guardian Module
  - [ ] 15.1 Implement GuardianService: create account, link to student (with consent audit), read linked student data
    - `createGuardian()`: Admin Staff creates a `parent_guardians` row + linked `User`
    - `linkToStudent(guardianId, studentId)`: Admin Staff links; record `consent_recorded_at`; write audit log entry for consent
    - `getLinkedStudentData(guardianId)`: return read-only view of: student profile, current enrollment, published grades, attendance percentages, outstanding fee balance — no other data
    - `updateContact()`: Guardian updates own email/phone only
    - _Requirements: 12.1, 12.2, 12.3, 12.5_

  - [ ] 15.2 Implement GuardianController: POST /guardians, POST /guardians/:id/link, GET /guardians/:id/students, PATCH /guardians/:id/contact
    - _Requirements: 12.1–12.5_

- [ ] 16. Notifications Module
  - [ ] 16.1 Implement NotificationService: enqueue jobs, log every attempt
    - `enqueue(recipient, type, channel, triggerEvent, payload)`: insert `notification_logs` row with status `pending`; push job to BullMQ queue (`notification:email` or `notification:sms`)
    - `enqueueBulk(recipients[], ...)`: loop and call `enqueue()` for each recipient
    - _Requirements: 13.1, 13.2, 13.4_

  - [ ] 16.2 Implement NotificationProcessor (BullMQ worker): dispatch email/SMS with retry
    - `processEmailJob()`: call `EmailProvider.send()` via Nodemailer; on success update log status to `sent`; on failure BullMQ retries up to 3 times at 10-min intervals; after 3 failures set status `failed`
    - `processSmsJob()`: same pattern via `SmsProvider` (Twilio SDK)
    - Respect per-type enable/disable config stored in Redis
    - _Requirements: 13.2, 13.6, 13.7_

  - [ ]* 16.3 Write property tests for notifications (Properties 28, 29)
    - **Property 28: Notification log completeness** — every triggered notification event creates at least one `notification_logs` entry per (recipient, channel) with all required fields
    - **Property 29: Notification retry behaviour** — initial failure triggers up to 3 retries at ≥10 min intervals; after 3 failures status = "failed"; no further retries
    - File: `src/__tests__/properties/notifications.property.test.ts`
    - **Validates: Requirements 13.4, 13.6**

  - [ ] 16.4 Implement NotificationsController: GET /notifications/logs, POST /notifications/retry/:id, PUT /notifications/config, PATCH /notifications/types/:type
    - Super Admin only for all endpoints
    - _Requirements: 13.3, 13.4, 13.5, 13.7_

- [ ] 17. Reports Module
  - [ ] 17.1 Implement ReportsService: query builders for all 8 standard reports
    - Implement query logic for: Enrollment, Grade, Attendance, Fee Statement, Library Loan, Hostel Occupancy, Alumni, Placement reports
    - Each query accepts scope filters: `departmentId`, `periodId`, `studentId`, `graduationYear`, `programme`
    - Department Head scope: auto-filter to own department
    - Super Admin scope: no filter restriction
    - _Requirements: 14.1, 14.2, 14.5_

  - [ ] 17.2 Implement PdfGeneratorService and CsvGeneratorService
    - `PdfGeneratorService.generate(template, data)`: Puppeteer renders HTML template to PDF; store result in MinIO; return presigned URL
    - `CsvGeneratorService.generate(data, headers)`: streaming `csv-stringify` output
    - Both must handle up to 10,000 records within 30 seconds
    - _Requirements: 14.3, 14.4_

  - [ ] 17.3 Implement ReportsController: GET /reports/* with ?format=pdf|csv
    - Apply role guards: Admin Staff sees all; Dept Head sees own dept
    - _Requirements: 14.1–14.5_

- [ ] 18. Audit Module
  - [x] 18.1 Implement AuditService: write log, search/filter log
    - `log(entry)`: INSERT into partitioned `audit_logs` (no update/delete path)
    - `search({actor, recordType, operation, dateFrom, dateTo, page, limit})`: SELECT with filters; Super Admin only
    - _Requirements: 15.1, 15.2, 15.3_

  - [ ] 18.2 Implement AuditController: GET /audit
    - Super Admin only; apply `@RequirePermission('audit_log', 'view')`
    - _Requirements: 15.3_

- [ ] 19. Checkpoint — Backend complete
  - Run `vitest --run` — all property tests must pass. Run `nest build` — must compile without errors. Verify all 31 properties are covered by test files.

- [ ] 20. Frontend: Project Setup and Auth Pages
  - [ ] 20.1 Configure React 18 frontend: routing, Ant Design, React Query, AuthContext
    - Install and configure: `antd`, `@tanstack/react-query`, `react-router-dom`, `axios`
    - Create `AuthContext` with `useAuth()` hook providing `user`, `role`, `login()`, `logout()`
    - Create `useRbac()` hook returning `can(feature, action)` based on current role
    - Create `RoleGate` component that conditionally renders children based on `useRbac()`
    - Create Axios instance with `Authorization: Bearer` header injected from `AuthContext`
    - _Requirements: 1.1, 2.1_

  - [ ] 20.2 Implement Login page, Forgot Password page, and Reset Password page
    - Login: Ant Design `Form` with username/password; on success redirect to role-appropriate dashboard; display lockout error message on 423 response
    - Forgot Password: email input form; show confirmation message
    - Reset Password: token from URL param; password + confirm fields with complexity hint
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6_

  - [ ] 20.3 Implement role-specific Dashboard pages (Student, Lecturer, Admin Staff, Dept Head, Super Admin)
    - Each dashboard shows relevant summary widgets (e.g., Student: upcoming timetable, attendance warnings, fee balance; Admin: enrollment count, pending fees, notification failures)
    - Redirect from `/` to correct dashboard using role from `AuthContext`
    - _Requirements: 2.2, 1.4_

- [ ] 21. Frontend: Students and Enrollment Pages
  - [ ] 21.1 Implement Student List page (Admin Staff, Dept Head, Super Admin) and Student Profile detail page
    - `StudentListPage`: Ant Design `Table` with filters (name, programme, status), pagination, search
    - `StudentProfilePage`: tabbed view — Personal Info, Enrollment, Grades, Attendance, Fees; read-only for Student role; editable for Admin Staff
    - Profile photo upload with client-side size/type validation (≤ 2 MB, JPEG/PNG)
    - _Requirements: 3.1, 3.5, 3.6, 3.7, 3.10_

  - [ ] 21.2 Implement Enrollment management UI (Admin Staff)
    - Course enrollment table with add/remove; show current vs max enrollment count
    - Display 409 capacity error inline
    - _Requirements: 3.3, 3.4_

- [ ] 22. Frontend: Grades Pages
  - [ ] 22.1 Implement Grade Entry page (Lecturer) and Grade View pages (Student, Admin Staff, Dept Head)
    - `GradeEntryPage`: editable table per course/period listing enrolled students × assessment components; save individual grades; "Publish" button with confirmation modal showing missing-component warnings
    - `TranscriptPage`: read-only table of final grades per period with letter grade, GPA, cumulative GPA
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 4.7, 4.10_

- [ ] 23. Frontend: Attendance Pages
  - [ ] 23.1 Implement Attendance Marking page (Lecturer) and Attendance View page (Student, Dept Head)
    - `AttendanceMark`: session selector + student list with Present/Absent/Late radio per row; submit batch; show attendance percentage per student after submission
    - `AttendanceView`: per-course table showing session dates and statuses with percentage summary; highlight rows below threshold in amber
    - Threshold config form for Admin Staff (validated between 50–100)
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6_

- [ ] 24. Frontend: Timetable Pages
  - [ ] 24.1 Implement Timetable Grid page (all roles) and Timetable Management page (Admin Staff)
    - `TimetableGrid`: weekly grid view filtered by role (Student sees enrolled courses, Lecturer sees own)
    - `TimetableManage`: form to add/edit entries; show conflict error inline with conflicting entry details
    - "Publish" button with confirmation for Admin Staff
    - _Requirements: 6.1, 6.4, 6.6, 6.7, 6.8_

- [ ] 25. Frontend: Fees, Library, Hostel Pages
  - [ ] 25.1 Implement Fee Records page (Admin Staff, Student, Dept Head)
    - `FeeRecords`: table of fee records with outstanding balance prominently displayed; "Record Payment" modal; "Apply Waiver" modal with mandatory justification note field; receipt download button
    - Student view: read-only own fees, payment history, outstanding balance
    - _Requirements: 7.1, 7.2, 7.3, 7.6, 7.7_

  - [ ] 25.2 Implement Library Catalogue and Loans pages
    - `LibraryCatalogue`: search bar (title/author/category); results table with availability badge; available/unavailable states
    - `LibraryLoans` (Admin Staff): create loan modal; return button; overdue indicator
    - Student loans: view own active and historical loans
    - _Requirements: 8.1, 8.2, 8.6, 8.7_

  - [ ] 25.3 Implement Hostel Management page (Admin Staff) and Hostel View (Student)
    - `HostelManage`: room list with occupancy counts; "Allocate" modal; "Terminate" modal with departure date + reason
    - Student view: own current/historical allocations read-only
    - Display 409 capacity error inline
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 26. Frontend: Alumni, Placement, Guardian, Notifications, Reports, Audit Pages
  - [ ] 26.1 Implement Alumni and Placement pages
    - `AlumniList` (Admin Staff, Dept Head): table with filters; edit contact details and career placements inline
    - `AlumniSelfService`: dedicated route for Alumni role — update own contact/employment only
    - `PlacementListings` (Student, Admin Staff): card view of active listings filtered by programme; "Apply" modal for resume PDF upload (≤ 5 MB)
    - `PlacementManage` (Admin Staff): create/edit listings; record outcomes
    - _Requirements: 10.1–10.6, 11.1–11.6_

  - [ ] 26.2 Implement Guardian Portal and Parent/Guardian management pages
    - `GuardianPortal`: read-only tabs for linked student(s) showing profile, enrollment, grades, attendance, fee balance
    - `GuardianManage` (Admin Staff): create guardian account; link to student with consent confirmation
    - _Requirements: 12.1–12.5_

  - [ ] 26.3 Implement Notification Log page and Reports page
    - `NotificationLog` (Super Admin): paginated table with filters (type, status, date); "Retry" button on failed rows; gateway config form
    - `ReportsPage` (Admin Staff, Dept Head): report type selector; scope filters; "Generate PDF" and "Export CSV" buttons; loading state with progress indicator
    - _Requirements: 13.3–13.7, 14.1–14.5_

  - [ ] 26.4 Implement Audit Log page (Super Admin)
    - Paginated, filterable table: filter by actor, record type, operation type, date range
    - Read-only — no edit/delete controls rendered
    - _Requirements: 15.3, 15.5_

- [ ] 27. Final Checkpoint — Full system integration
  - Run `vitest --run` — all tests must pass, all 31 properties covered
  - Run `nest build` and `vite build` — both must compile without errors
  - Verify Docker Compose stack starts cleanly; all migrations run; MinIO buckets created; BullMQ queues registered
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation before adding complexity
- Property tests validate the 31 universal correctness properties from the design; unit tests cover specific examples and edge cases
- Pure calculator services (`GpaCalculatorService`, `AttendanceCalculatorService`, `ConflictDetectorService`, `BalanceCalculatorService`) are the primary fast-check targets — they have no I/O and are trivially testable
- All file uploads (photos, resumes, generated reports) are stored in MinIO with presigned URL delivery — never served directly from the API
- The audit log's immutability is enforced at the PostgreSQL grant level; the NestJS layer provides no update/delete endpoint as a second line of defence

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["2.1", "2.2", "2.4"] },
    { "id": 4, "tasks": ["2.3", "2.5", "4.1", "4.3", "5.1", "18.1"] },
    { "id": 5, "tasks": ["4.2", "4.4", "5.2", "6.1", "7.1", "8.1", "10.1", "11.1", "12.1", "13.1", "14.1", "15.1", "16.1", "18.2"] },
    { "id": 6, "tasks": ["4.2", "6.2", "6.3", "7.2", "7.3", "8.2", "8.3", "10.2", "10.3", "11.2", "11.3", "12.2", "12.3", "13.2", "14.2", "14.3", "15.2", "16.2", "17.1"] },
    { "id": 7, "tasks": ["6.4", "7.4", "7.5", "8.4", "10.4", "11.4", "13.3", "14.4", "16.3", "16.4", "17.2"] },
    { "id": 8, "tasks": ["17.3", "20.1"] },
    { "id": 9, "tasks": ["20.2", "20.3", "21.1", "21.2", "22.1", "23.1", "24.1", "25.1", "25.2", "25.3"] },
    { "id": 10, "tasks": ["26.1", "26.2", "26.3", "26.4"] }
  ]
}
```

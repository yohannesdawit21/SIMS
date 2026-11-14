# Requirements Document

## Introduction

The Student Information Management System (SIMS) is a comprehensive, greenfield web-based platform for a polytechnic college. It consolidates all student lifecycle functions into a single integrated system, covering enrollment, academic records, attendance, scheduling, fees, library, hostel, alumni, career placement, and a parent/guardian portal. Five distinct user roles — Student, Lecturer, Admin Staff, Department Head, and Super Admin — interact with the system under strict role-based access control. Automated SMS and email notifications keep all stakeholders informed about key events including grade publication, attendance alerts, fee reminders, and exam schedules.

---

## Glossary

- **SIMS**: Student Information Management System — the platform described in this document.
- **Student**: An enrolled individual undertaking courses at the polytechnic college.
- **Lecturer**: A teaching staff member responsible for delivering courses, recording grades, and marking attendance.
- **Admin Staff**: A college administrative employee responsible for enrollment, fee processing, scheduling, and records management.
- **Department Head**: A senior academic staff member with oversight of a specific academic department.
- **Super Admin**: A system administrator with full configuration and access-control authority over SIMS.
- **Role**: A named set of permissions assigned to a user that governs which SIMS features and data the user may access.
- **Enrollment**: The formal process of registering a Student for a course or academic programme.
- **Student Profile**: A persistent record containing a Student's personal, academic, and contact information.
- **Course**: A unit of study with a defined syllabus, credit hours, and assigned Lecturer(s).
- **Grade**: A numerical or letter score assigned to a Student for an assessment or course.
- **Attendance Record**: A per-session record indicating whether a Student was present, absent, or late.
- **Timetable**: A schedule that maps Courses to time slots, rooms, and Lecturers for a given academic period.
- **Academic Period**: A defined semester or term within the college calendar.
- **Fee**: A monetary charge levied on a Student for tuition, hostel, library, or other college services.
- **Payment**: A recorded financial transaction settling a Fee or part thereof.
- **Library Resource**: A book, journal, digital material, or equipment managed by the college library.
- **Loan**: A time-limited borrowing record associating a Student with a Library Resource.
- **Hostel**: On-campus residential accommodation managed by the college.
- **Hostel Allocation**: An assignment linking a Student to a specific Hostel room for a defined period.
- **Alumni**: A Student who has completed and graduated from a college programme.
- **Career Placement Record**: A record capturing a graduate's employment or further-study outcome.
- **Notification**: An automated SMS or email message dispatched by SIMS to one or more recipients upon a defined trigger event.
- **Threshold**: A configurable percentage value below which an Attendance Record triggers a warning Notification.
- **Parent/Guardian**: A person registered in SIMS as the legal guardian or parent of a Student, with read-only access to selected Student data.
- **Audit Log**: A tamper-evident, time-stamped record of create, update, and delete operations performed within SIMS.

---

## Requirements

### Requirement 1: Role-Based Access Control

**User Story:** As a Super Admin, I want every user to access only the features and data permitted by their assigned Role, so that sensitive information is protected and regulatory obligations are met.

#### Acceptance Criteria

1. THE SIMS SHALL enforce Role-based access control for every request, evaluating the requesting user's Role before granting or denying access to any feature or data record.
2. WHEN a user attempts to access a feature or data record not permitted by the user's Role, THE SIMS SHALL deny the request and return an "Access Denied" response without exposing restricted data.
3. THE Super Admin SHALL be able to create, modify, and deactivate user accounts and Role assignments for all Roles within SIMS.
4. THE SIMS SHALL support exactly five Roles: Student, Lecturer, Admin Staff, Department Head, and Super Admin.
5. WHEN a user's Role assignment is changed, THE SIMS SHALL apply the new Role permissions on the user's next authenticated request without requiring a system restart.
6. THE SIMS SHALL record every Role assignment change in the Audit Log, capturing the actor, the affected user, the previous Role, the new Role, and the timestamp.
7. WHILE a user session is active, THE SIMS SHALL re-evaluate Role permissions on each request to reflect any Role changes made since the session began.
8. IF a user account is deactivated, THEN THE SIMS SHALL immediately invalidate all active sessions for that account and deny further login attempts.

---

### Requirement 2: User Authentication and Session Management

**User Story:** As any user, I want to securely log in to SIMS and have my session managed safely, so that my account and data are protected from unauthorised access.

#### Acceptance Criteria

1. THE SIMS SHALL authenticate users using a unique username and password credential pair.
2. WHEN a user submits valid credentials, THE SIMS SHALL establish an authenticated session and redirect the user to the Role-appropriate dashboard within 3 seconds.
3. IF a user submits invalid credentials five consecutive times, THEN THE SIMS SHALL lock the account for 30 minutes and send a Notification to the registered email address of the account owner.
4. THE SIMS SHALL enforce a minimum password length of 8 characters containing at least one uppercase letter, one lowercase letter, one digit, and one special character.
5. WHEN a user session has been idle for 30 consecutive minutes, THE SIMS SHALL automatically terminate the session and redirect the user to the login page.
6. THE SIMS SHALL support password reset via a time-limited token delivered to the user's registered email address, with the token expiring after 60 minutes.
7. THE SIMS SHALL record every successful and failed login attempt in the Audit Log, capturing the username, IP address, and timestamp.

---

### Requirement 3: Enrollment and Student Profile Management

**User Story:** As an Admin Staff member, I want to enroll new Students and maintain Student Profiles, so that accurate academic records are available throughout each Student's lifecycle at the college.

#### Acceptance Criteria

1. THE Admin Staff SHALL be able to create a new Student Profile containing: full legal name, date of birth, gender, national identification number, contact phone number, personal email address, home address, programme of study, and year of entry.
2. WHEN a new Student Profile is created, THE SIMS SHALL generate a unique, immutable Student identification number and associate it with the profile.
3. THE Admin Staff SHALL be able to enroll a Student in one or more Courses for a specified Academic Period, provided the Student's profile is in an active status.
4. IF a Course has reached its maximum enrolment capacity, THEN THE SIMS SHALL prevent additional Students from being enrolled in that Course and display the current enrolment count to Admin Staff.
5. THE Student SHALL be able to view the Student's own Student Profile and current Enrollment records in read-only mode.
6. THE Admin Staff SHALL be able to update all fields of an existing Student Profile except the Student identification number.
7. THE Department Head SHALL be able to view all Student Profiles and Enrollment records within the Department Head's assigned department.
8. WHEN a Student Profile is updated, THE SIMS SHALL record the change in the Audit Log, capturing the actor, the changed fields, the previous values, the new values, and the timestamp.
9. THE Admin Staff SHALL be able to deactivate a Student Profile, which prevents the Student from logging in but preserves all historical records.
10. THE SIMS SHALL allow Admin Staff to upload a Student's profile photograph in JPEG or PNG format with a maximum file size of 2 MB.

---

### Requirement 4: Grade Management

**User Story:** As a Lecturer, I want to record and publish grades for Students in my Courses, so that academic performance is tracked accurately and Students are informed promptly.

#### Acceptance Criteria

1. THE Lecturer SHALL be able to enter, edit, and save grades for each Student enrolled in a Course assigned to that Lecturer, for each assessment component defined in the Course.
2. WHEN a Lecturer publishes grades for a Course, THE SIMS SHALL send a Notification via email and SMS to every enrolled Student informing the Student that grades are available.
3. THE SIMS SHALL calculate a final Grade for each Student per Course based on the weighted assessment components defined for that Course.
4. WHEN grades are published, THE SIMS SHALL make the final Grade visible to the Student in the Student's academic transcript view.
5. THE Department Head SHALL be able to view all published and unpublished grades for all Courses within the Department Head's department.
6. IF a Lecturer attempts to publish grades while one or more enrolled Students have no grade entered for a mandatory assessment component, THEN THE SIMS SHALL display a list of the affected Students and require the Lecturer to confirm before proceeding.
7. THE Admin Staff SHALL be able to generate a Grade Report for a specified Student, Course, or Academic Period in PDF and CSV formats.
8. WHEN a published grade is modified by Admin Staff, THE SIMS SHALL record the change in the Audit Log and send a Notification to the affected Student.
9. THE SIMS SHALL prevent a Student or Lecturer from modifying a grade once Admin Staff has locked the Academic Period for grade amendments.
10. THE SIMS SHALL compute and display a Student's cumulative Grade Point Average (GPA) using the college's defined grading scale after each Academic Period.

---

### Requirement 5: Attendance Tracking

**User Story:** As a Lecturer, I want to record Student attendance for each class session, so that attendance compliance is monitored and low-attendance Students are alerted promptly.

#### Acceptance Criteria

1. THE Lecturer SHALL be able to mark each enrolled Student as Present, Absent, or Late for each scheduled class session of a Course assigned to that Lecturer.
2. THE SIMS SHALL calculate the attendance percentage for each Student per Course as the ratio of sessions marked Present or Late to the total number of sessions conducted, expressed as a percentage rounded to two decimal places.
3. WHEN a Student's attendance percentage for a Course falls below the configured Threshold, THE SIMS SHALL send a Notification via email and SMS to the Student and to the registered Parent/Guardian of the Student.
4. THE Admin Staff SHALL be able to configure the attendance warning Threshold as a percentage value between 50 and 100.
5. THE Student SHALL be able to view the Student's own attendance percentage and session-level Attendance Records for all enrolled Courses in read-only mode.
6. THE Department Head SHALL be able to view attendance summaries and session-level records for all Courses within the Department Head's department.
7. THE Lecturer SHALL be able to amend an Attendance Record within 48 hours of the session date; amendments beyond 48 hours require approval from Admin Staff.
8. WHEN an Attendance Record is amended, THE SIMS SHALL record the change in the Audit Log, capturing the actor, the original value, the amended value, and the timestamp.
9. THE SIMS SHALL generate an Attendance Report for a specified Course or Academic Period, exportable in PDF and CSV formats, accessible to Admin Staff and Department Head.

---

### Requirement 6: Timetable and Scheduling

**User Story:** As an Admin Staff member, I want to create and publish timetables for all Courses in an Academic Period, so that Students, Lecturers, and rooms are scheduled without conflicts.

#### Acceptance Criteria

1. THE Admin Staff SHALL be able to create a Timetable entry specifying the Course, Lecturer, room, day of week, start time, end time, and Academic Period.
2. WHEN a Timetable entry is saved, THE SIMS SHALL check for conflicts where the same Lecturer, room, or enrolled Student group is assigned to an overlapping time slot within the same Academic Period.
3. IF a scheduling conflict is detected, THEN THE SIMS SHALL reject the Timetable entry, identify the conflicting entry by Course name, room, and time slot, and require Admin Staff to resolve the conflict before saving.
4. THE Admin Staff SHALL be able to publish the Timetable for a specified Academic Period, making it visible to Students, Lecturers, and Department Heads.
5. WHEN a Timetable is published or updated, THE SIMS SHALL send a Notification via email to all affected Students and Lecturers.
6. THE Student SHALL be able to view the Student's personalised Timetable showing only the Courses in which the Student is enrolled.
7. THE Lecturer SHALL be able to view the Lecturer's personalised Timetable showing only the Courses assigned to that Lecturer.
8. THE SIMS SHALL allow Admin Staff to export the full institutional Timetable in PDF and CSV formats.
9. WHEN an exam schedule is added or updated in the Timetable, THE SIMS SHALL send a Notification via email and SMS to all affected Students listing the exam Course, date, time, and venue.

---

### Requirement 7: Fee and Billing Management

**User Story:** As an Admin Staff member, I want to manage Student fee records and process payments, so that the college's financial obligations are tracked and Students are reminded of outstanding balances.

#### Acceptance Criteria

1. THE Admin Staff SHALL be able to create a Fee record for a Student specifying the fee category (tuition, hostel, library, or other), the amount due, and the due date.
2. THE SIMS SHALL maintain a running balance for each Student showing total fees levied, total payments received, and the outstanding balance.
3. WHEN a payment is recorded against a Student's account, THE SIMS SHALL update the outstanding balance in real time and generate a payment receipt available for download in PDF format.
4. WHEN a Fee due date is 7 days away and the outstanding balance is greater than zero, THE SIMS SHALL send a Notification via email and SMS to the Student and to the registered Parent/Guardian reminding them of the due date and outstanding amount.
5. WHEN a Fee due date passes and the outstanding balance is greater than zero, THE SIMS SHALL send a Notification via email and SMS to the Student and to the registered Parent/Guardian indicating the overdue balance.
6. THE Student SHALL be able to view the Student's own Fee records, payment history, and current outstanding balance in read-only mode.
7. THE Admin Staff SHALL be able to apply fee waivers or discounts to a Student's Fee record with a mandatory justification note, which THE SIMS SHALL record in the Audit Log.
8. THE Admin Staff SHALL be able to generate a Fee Statement for a specified Student or Academic Period in PDF and CSV formats.
9. THE Department Head SHALL be able to view aggregate fee collection and outstanding balance summaries for all Students within the Department Head's department.
10. THE Super Admin SHALL be able to configure fee categories and default fee amounts for each Academic Period.

---

### Requirement 8: Library Management

**User Story:** As an Admin Staff member, I want to manage the college library's catalogue and Student loans, so that Library Resources are tracked and overdue items are identified promptly.

#### Acceptance Criteria

1. THE Admin Staff SHALL be able to add, update, and remove Library Resource records containing: title, author(s), ISBN or accession number, category, total copies, and available copies.
2. THE Admin Staff SHALL be able to record a Loan by associating a Library Resource with a Student, specifying the loan date and the return due date.
3. WHEN a Loan is recorded, THE SIMS SHALL decrement the available copies count for the Library Resource by one.
4. WHEN a Loan is returned and marked as returned by Admin Staff, THE SIMS SHALL increment the available copies count for the Library Resource by one.
5. IF a Loan's return due date passes without the Loan being marked as returned, THEN THE SIMS SHALL send a Notification via email and SMS to the Student listing the overdue Library Resource and the number of days overdue.
6. THE Student SHALL be able to search the library catalogue by title, author, or category and view the availability status of each Library Resource.
7. THE Student SHALL be able to view the Student's own active and historical Loan records.
8. THE Admin Staff SHALL be able to generate a Loan Report for a specified date range, exportable in PDF and CSV formats, listing all active and overdue Loans.
9. THE SIMS SHALL prevent a Loan from being created for a Library Resource with zero available copies.

---

### Requirement 9: Hostel and Facilities Management

**User Story:** As an Admin Staff member, I want to manage hostel room allocations and facility records, so that residential assignments are tracked accurately and capacity is not exceeded.

#### Acceptance Criteria

1. THE Admin Staff SHALL be able to create and update Hostel records containing: block name, room number, room type, and maximum occupancy.
2. THE Admin Staff SHALL be able to create a Hostel Allocation associating a Student with a specific Hostel room for a defined start date and end date.
3. IF a Hostel room has reached its maximum occupancy, THEN THE SIMS SHALL prevent Admin Staff from creating an additional Hostel Allocation for that room and display the current occupancy count.
4. THE Admin Staff SHALL be able to terminate a Hostel Allocation before the end date by recording a departure date and an optional reason.
5. THE Student SHALL be able to view the Student's own current and historical Hostel Allocation records in read-only mode.
6. THE Admin Staff SHALL be able to generate a Hostel Occupancy Report for a specified date, exportable in PDF and CSV formats, listing all current Hostel Allocations and vacant rooms.
7. THE SIMS SHALL automatically create a Fee record for the hostel fee category when a Hostel Allocation is created, with the amount and due date determined by the college's configured hostel fee schedule.

---

### Requirement 10: Alumni Tracking

**User Story:** As an Admin Staff member, I want to maintain records of graduates and their post-graduation outcomes, so that the college can report on alumni engagement and programme effectiveness.

#### Acceptance Criteria

1. THE SIMS SHALL automatically create an Alumni record when a Student's profile status is changed to "Graduated", capturing the Student's identification number, programme of study, graduation date, and final GPA.
2. THE Admin Staff SHALL be able to update an Alumni record to include post-graduation contact details: current email address, phone number, employer, and job title.
3. THE Admin Staff SHALL be able to record a Career Placement Record for an Alumni, specifying the employer name, job title, employment start date, and employment sector.
4. THE Department Head SHALL be able to view Alumni records and aggregate Career Placement statistics for graduates of the Department Head's department.
5. THE Admin Staff SHALL be able to generate an Alumni Report for a specified graduation year or programme, exportable in PDF and CSV formats.
6. THE SIMS SHALL allow Alumni to update their own post-graduation contact details and employment information via a dedicated self-service interface, without granting Alumni access to any current Student data.

---

### Requirement 11: Career Placement Management

**User Story:** As an Admin Staff member, I want to manage job and internship listings and track Student placement outcomes, so that the college can support Students in securing employment and measure placement success.

#### Acceptance Criteria

1. THE Admin Staff SHALL be able to create a job or internship listing containing: employer name, position title, description, application deadline, and eligible programmes.
2. THE Student SHALL be able to view active job and internship listings filtered by the Student's enrolled programme and apply by submitting a resume file in PDF format with a maximum file size of 5 MB.
3. THE SIMS SHALL send a Notification via email to eligible Students when a new job or internship listing is published that matches the Student's enrolled programme.
4. THE Admin Staff SHALL be able to record a placement outcome for a Student, specifying the employer name, position title, employment start date, and placement type (job or internship).
5. THE Department Head SHALL be able to view placement outcome summaries and individual placement records for Students within the Department Head's department.
6. THE Admin Staff SHALL be able to generate a Placement Report for a specified Academic Period or department, exportable in PDF and CSV formats.

---

### Requirement 12: Parent/Guardian Portal

**User Story:** As a Parent/Guardian, I want read-only access to my registered Student's academic and financial information, so that I can monitor the Student's progress and act on important notices.

#### Acceptance Criteria

1. THE Admin Staff SHALL be able to create a Parent/Guardian account in SIMS and link it to one or more Student profiles, with explicit consent from the Student recorded in the Audit Log.
2. THE Parent/Guardian SHALL be able to log in to SIMS and view the following Student data in read-only mode: Student Profile, current Enrollment, published grades, attendance percentage per Course, and current outstanding Fee balance.
3. THE SIMS SHALL restrict the Parent/Guardian from viewing any data other than the data items listed in Acceptance Criterion 2 above, including data of other Students not linked to the Parent/Guardian's account.
4. WHEN a Notification is triggered for a Student due to low attendance, an overdue Fee, or an overdue Library Resource, THE SIMS SHALL also dispatch the same Notification to the registered Parent/Guardian linked to that Student.
5. THE Parent/Guardian SHALL be able to update the Parent/Guardian's own contact details (email address and phone number) within the Parent/Guardian's account.

---

### Requirement 13: Notification Management

**User Story:** As a Super Admin, I want to configure and monitor automated notifications, so that all stakeholders receive timely, accurate communications via email and SMS.

#### Acceptance Criteria

1. THE SIMS SHALL deliver automated Notifications via email and SMS for the following trigger events: grade publication, Student attendance falling below Threshold, Fee due date approaching (7 days prior), Fee overdue, exam schedule creation or update, new job/internship listing matching a Student's programme, overdue Library Resource, and account lockout.
2. THE SIMS SHALL dispatch each triggered Notification within 5 minutes of the triggering event being recorded in the system.
3. THE Super Admin SHALL be able to configure the SMS gateway credentials, the sender email address, and the email SMTP server settings used by SIMS for Notification dispatch.
4. THE SIMS SHALL maintain a Notification Log recording the recipient identifier, notification type, trigger event, dispatch timestamp, and delivery status (sent, failed) for every Notification attempt.
5. THE Super Admin SHALL be able to view the Notification Log and manually retry any Notification with a "failed" delivery status.
6. IF a Notification dispatch attempt fails, THEN THE SIMS SHALL retry the dispatch up to 3 times at 10-minute intervals before marking the Notification status as "failed" in the Notification Log.
7. THE Super Admin SHALL be able to enable or disable individual Notification types without modifying any other system configuration.

---

### Requirement 14: Reporting and Data Export

**User Story:** As an Admin Staff member or Department Head, I want to generate standardised reports and export data, so that institutional decision-making is supported by accurate, current records.

#### Acceptance Criteria

1. THE SIMS SHALL provide the following standard reports accessible to Admin Staff: Student Enrollment Report, Grade Report, Attendance Report, Fee Statement, Library Loan Report, Hostel Occupancy Report, Alumni Report, and Placement Report.
2. THE Department Head SHALL be able to generate the same standard reports scoped to the Department Head's department only.
3. THE SIMS SHALL make every standard report exportable in both PDF and CSV formats.
4. WHEN a report is generated, THE SIMS SHALL produce the report file within 30 seconds for datasets of up to 10,000 records.
5. THE Super Admin SHALL be able to generate any report across all departments without scope restriction.

---

### Requirement 15: Audit and Data Integrity

**User Story:** As a Super Admin, I want a tamper-evident audit trail of all significant data changes, so that accountability is maintained and regulatory audits can be supported.

#### Acceptance Criteria

1. THE SIMS SHALL record an Audit Log entry for every create, update, and delete operation performed on Student Profile, Grade, Attendance Record, Fee, Hostel Allocation, Role assignment, and Library Loan records.
2. EACH Audit Log entry SHALL capture: the unique identifier of the actor performing the operation, the operation type (create, update, or delete), the name of the affected record type, the affected record identifier, the field-level previous and new values for update operations, and the UTC timestamp of the operation.
3. THE Super Admin SHALL be able to search and filter the Audit Log by actor, record type, operation type, and date range.
4. THE SIMS SHALL retain Audit Log entries for a minimum of 7 years from the date of the entry.
5. THE SIMS SHALL prevent any user, including Super Admin, from modifying or deleting Audit Log entries through the SIMS user interface.

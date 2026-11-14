export type Role =
  | 'student'
  | 'lecturer'
  | 'admin_staff'
  | 'department_head'
  | 'super_admin'
  | 'parent_guardian';

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  email?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: { timestamp: string; total?: number; page?: number; limit?: number };
}

export interface StudentProfile {
  id: string;
  user_id: string;
  student_number: string;
  full_legal_name: string;
  date_of_birth: string;
  gender: string | null;
  national_id: string;
  phone: string | null;
  personal_email: string | null;
  home_address: string | null;
  programme_id: string | null;
  programme?: { id: string; name: string; department_id: string };
  year_of_entry: number;
  status: 'active' | 'inactive' | 'graduated' | 'suspended';
  photo_url: string | null;
  created_at: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  department_id: string;
  credit_hours: number;
  max_enrollment: number;
  current_enrollment: number;
}

export interface Enrollment {
  id: string;
  student_id: string;
  course_id: string;
  academic_period_id: string;
  enrolled_at: string;
  course?: Course;
  academicPeriod?: AcademicPeriod;
}

export interface AcademicPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_locked: boolean;
}

export interface Grade {
  id: string;
  student_id: string;
  course_id: string;
  academic_period_id: string;
  component_id: string;
  score: number | null;
  is_published: boolean;
  status?: 'draft' | 'pending_approval' | 'revision_requested' | 'published';
  moderation_note?: string | null;
}

export interface CourseGradingSheet {
  course: {
    id: string;
    code: string;
    name: string;
    creditHours: number;
    departmentId: string | null;
    departmentName: string | null;
  };
  period: {
    id: string;
    name: string;
    isLocked: boolean;
  };
  components: Array<{
    id: string;
    name: string;
    weight: number;
    isMandatory: boolean;
  }>;
  status: 'draft' | 'pending_approval' | 'revision_requested' | 'published';
  moderationNote: string | null;
  roster: Array<{
    studentId: string;
    studentNumber: string;
    studentName: string;
    scores: Record<string, number | null>;
    componentDetails: Array<{
      componentId: string;
      name: string;
      weight: number;
      isMandatory: boolean;
      score: number | null;
      gradeId: string | null;
    }>;
    totalScore: number | null;
    letterGrade: string | null;
    gradePoints: number | null;
  }>;
}

export interface LecturerAssignedCourse {
  courseId: string;
  courseCode: string;
  courseName: string;
  creditHours: number;
  departmentName: string | null;
  academicPeriodId: string;
  academicPeriodName: string;
  isPeriodLocked: boolean;
  lecturerName: string | null;
  enrolledCount: number;
  gradingStatus: 'draft' | 'pending_approval' | 'revision_requested' | 'published';
  moderationNote: string | null;
}

export interface PendingGradeSubmission {
  courseId: string;
  courseCode: string;
  courseName: string;
  creditHours: number;
  departmentName: string | null;
  academicPeriodId: string;
  academicPeriodName: string;
  enrolledCount: number;
  lecturerName: string;
  submittedAt: string;
  status: 'pending_approval';
}

export interface FinalGrade {
  id: string;
  student_id: string;
  course_id: string;
  academic_period_id: string;
  final_score: number;
  letter_grade: string;
  grade_points: number;
  is_published: boolean;
  course?: Course;
  academicPeriod?: AcademicPeriod;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  session_id: string;
  status: 'present' | 'absent' | 'late';
  recorded_at: string;
}

export interface TimetableEntry {
  id: string;
  course_id: string;
  lecturer_id: string;
  academic_period_id: string;
  room: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  entry_type: 'class' | 'exam' | 'lab';
  status?: 'draft' | 'pending_approval' | 'published';
  is_published: boolean;
  course?: Course;
  lecturer?: { id: string; username: string };
  academicPeriod?: AcademicPeriod;
}

export interface FeeRecord {
  id: string;
  student_id: string;
  category_id: string;
  academic_period_id: string;
  amount_due: number;
  amount_paid: number;
  due_date: string;
  waiver_amount: number;
  waiver_reason: string | null;
  category?: { id: string; name: string };
  created_at: string;
}

export interface Payment {
  id: string;
  fee_record_id: string;
  amount: number;
  receipt_url: string | null;
  payment_date: string;
}

export interface LibraryResource {
  id: string;
  title: string;
  authors: string | null;
  isbn_or_accession: string;
  category: string | null;
  total_copies: number;
  available_copies: number;
}

export interface LibraryLoan {
  id: string;
  resource_id: string;
  student_id: string;
  loan_date: string;
  due_date: string;
  returned_date: string | null;
  is_returned: boolean;
  resource?: LibraryResource;
}

export interface Hostel {
  id: string;
  block_name: string;
  room_number: string;
  room_type: string | null;
  max_occupancy: number;
}

export interface HostelAllocation {
  id: string;
  student_id: string;
  hostel_id: string;
  start_date: string;
  end_date: string;
  departure_date: string | null;
  departure_reason: string | null;
  hostel?: Hostel;
  created_at: string;
}

export interface Alumni {
  id: string;
  student_id: string;
  graduation_date: string;
  final_gpa: number | null;
  current_email: string | null;
  current_phone: string | null;
  employer: string | null;
  job_title: string | null;
  student?: StudentProfile;
}

export interface JobListing {
  id: string;
  employer_name: string;
  position_title: string;
  description: string | null;
  deadline: string;
  is_active: boolean;
  created_at: string;
}

export interface NotificationLog {
  id: string;
  recipient_id: string;
  notification_type: string;
  channel: 'email' | 'sms';
  trigger_event: string;
  status: 'pending' | 'sent' | 'failed';
  attempt_count: number;
  dispatched_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  operation: 'create' | 'update' | 'delete';
  record_type: string;
  record_id: string;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  head_id: string | null;
}

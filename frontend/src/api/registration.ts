import { api } from './axios';

export interface SemesterRegistration {
  id: string;
  student_id: string;
  academic_period_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'blocked';
  gpa_at_registration: number | null;
  has_discipline_block: boolean;
  gpa_warning: boolean;
  gpa_block: boolean;
  admin_override: boolean;
  overridden_by_id: string | null;
  override_reason: string | null;
  block_reason: string | null;
  notes: string | null;
  registered_at: string;
  approved_at: string | null;
  student?: any;
  academicPeriod?: any;
  overriddenBy?: any;
}

export interface RegisterSemesterDto {
  student_id: string;
  academic_period_id: string;
  notes?: string;
}

export interface OverrideBlockDto {
  override_reason: string;
}

export interface EligibilityResponse {
  eligible: boolean;
  warnings: string[];
  blocks: string[];
  gpa: number | null;
  has_active_discipline: boolean;
}

/**
 * Register student for semester
 */
export const registerForSemester = async (data: RegisterSemesterDto): Promise<SemesterRegistration> => {
  const response = await api.post('/registration/semester', data);
  return response.data;
};

/**
 * Override registration block (super admin only)
 */
export const overrideBlock = async (
  registrationId: string,
  data: OverrideBlockDto
): Promise<SemesterRegistration> => {
  const response = await api.post(`/registration/${registrationId}/override`, data);
  return response.data;
};

/**
 * Get all registrations (admin)
 */
export const getRegistrations = async (
  status?: string,
  academicPeriodId?: string
): Promise<SemesterRegistration[]> => {
  const params: any = {};
  if (status) params.status = status;
  if (academicPeriodId) params.academicPeriodId = academicPeriodId;
  
  const response = await api.get('/registration', { params });
  return response.data;
};

/**
 * Get single registration
 */
export const getRegistration = async (id: string): Promise<SemesterRegistration> => {
  const response = await api.get(`/registration/${id}`);
  return response.data;
};

/**
 * Get student's registration history
 */
export const getStudentRegistrations = async (studentId: string): Promise<SemesterRegistration[]> => {
  const response = await api.get(`/registration/student/${studentId}`);
  return response.data;
};

/**
 * Check student eligibility to register
 */
export const checkEligibility = async (studentId: string): Promise<EligibilityResponse> => {
  const response = await api.get(`/registration/student/${studentId}/eligibility`);
  return response.data;
};

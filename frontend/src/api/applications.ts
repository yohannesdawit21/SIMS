import { api } from './axios';
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export interface StudentApplication {
  id: string;
  full_name: string;
  national_id: string;
  date_of_birth: string;
  gender: string;
  phone_number: string;
  email_address: string;
  previous_school: string;
  education_level: string;
  graduation_year: number;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  parent_guardian_name: string;
  parent_guardian_phone: string;
  parent_guardian_occupation: string;
  first_choice_program_id: string;
  second_choice_program_id: string;
  photo_url?: string;
  id_document_url?: string;
  transcript_url?: string;
  payment_receipt_url?: string;
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  review_notes?: string;
  rejection_reason?: string;
  submission_date: string;
  review_date?: string;
}

export interface CreateApplicationDto {
  full_name: string;
  national_id: string;
  date_of_birth: string;
  gender: string;
  phone_number: string;
  email_address: string;
  previous_school: string;
  education_level: string;
  graduation_year: number;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  parent_guardian_name: string;
  parent_guardian_phone: string;
  parent_guardian_occupation: string;
  first_choice_program_id: string;
  second_choice_program_id: string;
}

export interface ReviewApplicationDto {
  status: 'approved' | 'rejected';
  review_notes?: string;
  rejection_reason?: string;
}

/**
 * Submit a new application (public - no auth)
 */
export const submitApplication = async (data: CreateApplicationDto): Promise<StudentApplication> => {
  // Use plain axios without auth interceptor for public endpoint
  const response = await axios.post(`${BASE_URL}/applications`, data);
  return response.data;
};

/**
 * Upload document for application (public - no auth)
 */
export const uploadDocument = async (
  applicationId: string,
  docType: 'photo' | 'id_document' | 'transcript' | 'payment_receipt',
  file: File
): Promise<{ url: string }> => {
  const formData = new FormData();
  formData.append('file', file);

  // Use plain axios without auth interceptor for public endpoint
  const response = await axios.post(
    `${BASE_URL}/applications/${applicationId}/upload/${docType}`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data;
};

/**
 * Get all applications (admin only - with auth)
 */
export const getApplications = async (status?: string): Promise<StudentApplication[]> => {
  const params = status ? { status } : {};
  const response = await api.get('/applications', { params });
  return response.data;
};

/**
 * Get single application (admin only - with auth)
 */
export const getApplication = async (id: string): Promise<StudentApplication> => {
  const response = await api.get(`/applications/${id}`);
  return response.data;
};

/**
 * Review application (super admin only - with auth)
 */
export const reviewApplication = async (
  id: string,
  data: ReviewApplicationDto
): Promise<{ message: string; student_profile?: any; credentials?: any }> => {
  const response = await api.patch(`/applications/${id}/review`, data);
  return response.data;
};

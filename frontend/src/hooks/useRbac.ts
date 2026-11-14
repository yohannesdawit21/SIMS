import { useAuth } from '../context/AuthContext';
import type { Role } from '../types';

/** Static permission matrix mirroring the backend PERMISSION_MATRIX */
const PERMISSIONS: Record<string, Record<string, Role[]>> = {
  own_profile:          { read: ['student', 'lecturer', 'admin_staff', 'department_head', 'super_admin', 'parent_guardian'] },
  all_profiles:         { read: ['lecturer', 'admin_staff', 'department_head', 'super_admin'] },
  profile:              { create: ['admin_staff', 'super_admin'], update: ['admin_staff', 'super_admin'] },
  course_enrollment:    { manage: ['admin_staff', 'department_head', 'super_admin'] },
  grades_own:           { read: ['student', 'admin_staff', 'department_head', 'super_admin'] },
  grades:               { enter: ['lecturer', 'admin_staff', 'super_admin'], publish: ['admin_staff', 'department_head', 'super_admin'], read: ['lecturer', 'admin_staff', 'department_head', 'super_admin'] },
  attendance_own:       { read: ['student', 'admin_staff', 'department_head', 'super_admin'] },
  attendance:           { mark: ['lecturer', 'admin_staff', 'super_admin'], amend: ['lecturer', 'admin_staff', 'super_admin'], read: ['lecturer', 'admin_staff', 'department_head', 'super_admin'] },
  timetable:            { view: ['student', 'lecturer', 'admin_staff', 'department_head', 'super_admin'], manage: ['admin_staff', 'super_admin'] },
  fees_own:             { read: ['student', 'admin_staff', 'department_head', 'super_admin'] },
  fees:                 { manage: ['admin_staff', 'super_admin'], read: ['admin_staff', 'department_head', 'super_admin'] },
  library_catalogue:    { search: ['student', 'lecturer', 'admin_staff', 'department_head', 'super_admin'] },
  loans:                { manage: ['admin_staff', 'super_admin'], read: ['student', 'admin_staff', 'super_admin'] },
  hostel_allocations:   { read: ['student', 'admin_staff', 'super_admin'], manage: ['admin_staff', 'super_admin'] },
  alumni:               { manage: ['admin_staff', 'department_head', 'super_admin'], update_own: ['admin_staff', 'super_admin'] },
  placement_listings:   { view: ['student', 'admin_staff', 'department_head', 'super_admin'], manage: ['admin_staff', 'super_admin'] },
  reports:              { generate: ['admin_staff', 'department_head', 'super_admin'] },
  user_management:      { any: ['admin_staff', 'super_admin'] },
  notification_config:  { manage: ['super_admin'] },
  audit_log:            { view: ['super_admin'] },
};

export function useRbac() {
  const { user } = useAuth();

  const can = (feature: string, action: string): boolean => {
    if (!user) return false;
    const allowed = PERMISSIONS[feature]?.[action];
    if (!allowed) return false;
    return allowed.includes(user.role);
  };

  return { can };
}

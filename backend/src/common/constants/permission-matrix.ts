/**
 * Role type — the five roles supported by SIMS.
 * Must match the CHECK constraint on users.role in the DB schema.
 */
export type Role =
  | 'student'
  | 'lecturer'
  | 'admin_staff'
  | 'department_head'
  | 'super_admin'
  | 'parent_guardian';

/** All valid roles, used for iteration. */
export const ALL_ROLES: Role[] = [
  'student',
  'lecturer',
  'admin_staff',
  'department_head',
  'super_admin',
  'parent_guardian',
];

/** A permission check descriptor attached via @RequirePermission(). */
export interface Permission {
  feature: string;
  action: string;
}

/**
 * Scope qualifiers — used by guards/services to apply additional row-level
 * filtering on top of simple role allow/deny decisions.
 */
export type PermissionScope =
  | 'all'
  | 'own'
  | 'dept_only'
  | 'own_courses'
  | 'published_only';

export interface RolePermission {
  allowed: boolean;
  scope: PermissionScope;
}

/**
 * Static permission matrix for all 22 feature-action pairs in SIMS.
 *
 * Structure: PERMISSION_MATRIX[feature][action][role] = { allowed, scope }
 *
 * Consumers:
 *  - RbacGuard: checks `allowed` flag.
 *  - Service layer: checks `scope` to apply data filtering.
 */
export const PERMISSION_MATRIX: Record<
  string,
  Record<string, Partial<Record<Role, RolePermission>>>
> = {
  // 1. Own profile (read)
  own_profile: {
    read: {
      student:          { allowed: true,  scope: 'own' },
      lecturer:         { allowed: true,  scope: 'own' },
      admin_staff:      { allowed: true,  scope: 'all' },
      department_head:  { allowed: true,  scope: 'all' },
      super_admin:      { allowed: true,  scope: 'all' },
      parent_guardian:  { allowed: true,  scope: 'own' },
    },
  },

  // 2. All profiles (read)
  all_profiles: {
    read: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: true,  scope: 'own_courses' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 3. Profile create / update
  profile: {
    create: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: false, scope: 'own' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
    update: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: false, scope: 'own' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 4. Course enrollment
  course_enrollment: {
    manage: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 5. Grades — own read
  grades_own: {
    read: {
      student:         { allowed: true,  scope: 'published_only' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 6. Grades — enter / publish
  grades: {
    enter: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: true,  scope: 'own_courses' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: false, scope: 'own' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
    publish: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own_courses' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
    read: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: true,  scope: 'own_courses' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 7. Attendance — own read
  attendance_own: {
    read: {
      student:         { allowed: true,  scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 8. Attendance — mark / amend
  attendance: {
    mark: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: true,  scope: 'own_courses' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: false, scope: 'own' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
    amend: {
      // Time-window enforcement (≤48h vs >48h) is handled in AttendanceService
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: true,  scope: 'own_courses' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: false, scope: 'own' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
    read: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: true,  scope: 'own_courses' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 9. Timetable — view
  timetable: {
    view: {
      student:         { allowed: true,  scope: 'own' },
      lecturer:        { allowed: true,  scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'all' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
    // 10. Timetable — manage
    manage: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 11. Fees — own read
  fees_own: {
    read: {
      student:         { allowed: true,  scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 12. Fees — manage
  fees: {
    manage: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
    read: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 13. Library catalogue — search
  library_catalogue: {
    search: {
      student:         { allowed: true,  scope: 'all' },
      lecturer:        { allowed: true,  scope: 'all' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'all' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 14. Loans — manage
  loans: {
    manage: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
    read: {
      student:         { allowed: true,  scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: false, scope: 'own' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 15. Hostel allocations
  hostel_allocations: {
    read: {
      student:         { allowed: true,  scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: false, scope: 'own' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
    manage: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 16. Alumni — manage
  alumni: {
    manage: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
    update_own: {
      // Alumni can update their own contact details
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 17. Placement listings — view
  placement_listings: {
    view: {
      student:         { allowed: true,  scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'all' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
    // 18. Placement listings — manage
    manage: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 19. Reports
  reports: {
    generate: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 20. User management (Super Admin and Admin Staff)
  user_management: {
    any: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: false, scope: 'own' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 21. Notification config (Super Admin only)
  notification_config: {
    manage: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: false, scope: 'own' },
      department_head: { allowed: true,  scope: 'dept_only' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 22. Audit log — view (Super Admin only)
  audit_log: {
    view: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: false, scope: 'own' },
      department_head: { allowed: false, scope: 'own' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 23. Applications — manage (Phase 3)
  applications: {
    manage: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: false, scope: 'own' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },

  // 24. Registration — manage (Phase 4)
  registration: {
    manage: {
      student:         { allowed: false, scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: false, scope: 'own' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
    view: {
      student:         { allowed: true,  scope: 'own' },
      lecturer:        { allowed: false, scope: 'own' },
      admin_staff:     { allowed: true,  scope: 'all' },
      department_head: { allowed: false, scope: 'own' },
      super_admin:     { allowed: true,  scope: 'all' },
    },
  },
};

/**
 * Helper: check if a role is permitted for a feature+action pair.
 * Returns the RolePermission (allowed + scope) or null if not found.
 */
export function checkPermission(
  role: Role,
  feature: string,
  action: string,
): RolePermission | null {
  return PERMISSION_MATRIX[feature]?.[action]?.[role] ?? null;
}

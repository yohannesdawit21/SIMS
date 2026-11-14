import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, App as AntApp } from 'antd';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RequireAuth } from './components/RequireAuth';
import { AppLayout } from './components/AppLayout';
import type { Role } from './types';

// Auth pages
import LoginPage from './pages/auth/LoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';

// Dashboard pages
import StudentDashboard from './pages/dashboard/StudentDashboard';
import LecturerDashboard from './pages/dashboard/LecturerDashboard';
import AdminDashboard from './pages/dashboard/AdminDashboard';
import DeptHeadDashboard from './pages/dashboard/DeptHeadDashboard';
import SuperAdminDashboard from './pages/dashboard/SuperAdminDashboard';
import GuardianDashboard from './pages/dashboard/GuardianDashboard';

// Domain pages
import StudentsPage from './pages/students/StudentsPage';
import StudentProfilePage from './pages/students/StudentProfilePage';
import GradesPage from './pages/grades/GradesPage';
import AttendancePage from './pages/attendance/AttendancePage';
import TimetablePage from './pages/timetable/TimetablePage';
import FeesPage from './pages/fees/FeesPage';
import LibraryPage from './pages/library/LibraryPage';
import HostelPage from './pages/hostel/HostelPage';
import AlumniPage from './pages/alumni/AlumniPage';
import PlacementPage from './pages/placement/PlacementPage';
import GuardianPage from './pages/guardian/GuardianPage';
import NotificationsPage from './pages/notifications/NotificationsPage';
import ReportsPage from './pages/reports/ReportsPage';
import AuditPage from './pages/audit/AuditPage';

// Application pages (Phase 3)
import ApplyPage from './pages/applications/ApplyPage';
import ApplicationsPage from './pages/applications/ApplicationsPage';

// Registration pages (Phase 4)
import SemesterRegistrationPage from './pages/registration/SemesterRegistrationPage';
import RegistrationManagementPage from './pages/registration/RegistrationManagementPage';
import ScheduleApprovalPage from './pages/timetable/ScheduleApprovalPage';

// Users management (Priority 3)
import UsersManagementPage from './pages/users/UsersManagementPage';
import DisciplineManagementPage from './pages/discipline/DisciplineManagementPage';

// ── QueryClient created once at module level, never recreated ────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      // Keep data in cache when navigating away — fixes blank-on-back issue
      gcTime: 5 * 60 * 1000,
    },
  },
});

const ROLE_DASHBOARD: Record<Role, string> = {
  student:          '/dashboard/student',
  lecturer:         '/dashboard/lecturer',
  admin_staff:      '/dashboard/admin',
  department_head:  '/dashboard/dept-head',
  super_admin:      '/dashboard/super-admin',
  parent_guardian:  '/dashboard/guardian',
};

// ── Defined at module level so React never sees it as a new component ────────
function RootRedirect() {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const dest = user ? (ROLE_DASHBOARD[user.role] ?? '/dashboard/student') : '/login';
  return <Navigate to={dest} replace />;
}

// ── All authenticated routes — defined OUTSIDE App() so identity is stable ──
function AuthenticatedRoutes() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/dashboard/student"     element={<StudentDashboard />} />
        <Route path="/dashboard/lecturer"    element={<LecturerDashboard />} />
        <Route path="/dashboard/admin"       element={<AdminDashboard />} />
        <Route path="/dashboard/dept-head"   element={<DeptHeadDashboard />} />
        <Route path="/dashboard/super-admin" element={<SuperAdminDashboard />} />
        <Route path="/dashboard/guardian"    element={<GuardianDashboard />} />
        <Route path="/students"              element={<StudentsPage />} />
        <Route path="/students/:id"          element={<StudentProfilePage />} />
        <Route path="/grades"                element={<GradesPage />} />
        <Route path="/attendance"            element={<AttendancePage />} />
        <Route path="/timetable"             element={<TimetablePage />} />
        <Route path="/fees"                  element={<FeesPage />} />
        <Route path="/library"              element={<LibraryPage />} />
        <Route path="/hostel"               element={<HostelPage />} />
        <Route path="/alumni"               element={<AlumniPage />} />
        <Route path="/placement"            element={<PlacementPage />} />
        <Route path="/guardian"             element={<GuardianPage />} />
        <Route path="/notifications"        element={<NotificationsPage />} />
        <Route path="/reports"              element={<ReportsPage />} />
        <Route path="/audit"                element={<AuditPage />} />
        <Route path="/applications"         element={<ApplicationsPage />} />
        <Route path="/register-semester"    element={<SemesterRegistrationPage />} />
        <Route path="/registrations"        element={<RegistrationManagementPage />} />
        <Route path="/schedules/approve"    element={<ScheduleApprovalPage />} />
        <Route path="/users"                element={<UsersManagementPage />} />
        <Route path="/discipline"           element={<DisciplineManagementPage />} />
        <Route path="*"                     element={<RootRedirect />} />
      </Routes>
    </AppLayout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={{
          token: {
            colorPrimary: '#1677ff',
            borderRadius: 8,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
          },
          components: {
            Menu: { darkItemSelectedBg: '#1677ff' },
            Card: { borderRadiusLG: 12 },
            Button: { borderRadius: 8 },
          },
        }}>
        <AntApp>
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                {/* Public routes */}
                <Route path="/login"           element={<LoginPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password"  element={<ResetPasswordPage />} />
                <Route path="/apply"           element={<ApplyPage />} />
                <Route path="/"                element={<RootRedirect />} />

                {/* All authenticated routes rendered inside AppLayout */}
                <Route
                  path="/*"
                  element={
                    <RequireAuth>
                      <AuthenticatedRoutes />
                    </RequireAuth>
                  }
                />
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

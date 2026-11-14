import React, { useState, useCallback } from 'react';
import { Layout, Menu, Avatar, Dropdown, Space, Typography, Badge, Tag, Button } from 'antd';
import {
  DashboardOutlined, TeamOutlined, BookOutlined, CalendarOutlined,
  DollarOutlined, ReadOutlined, HomeOutlined, TrophyOutlined,
  CarryOutOutlined, UsergroupAddOutlined, BellOutlined,
  BarChartOutlined, AuditOutlined, UserOutlined, LogoutOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, SettingOutlined,
  FileTextOutlined, FormOutlined, CheckSquareOutlined, SafetyOutlined,
  UsergroupDeleteOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRbac } from '../hooks/useRbac';
import { Logo } from './Logo';
import type { Role } from '../types';

const { Header, Sider, Content } = Layout;

interface NavItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  feature: string;
  action: string;
  group?: string;
  roles?: Role[];
}

const ROLE_DASHBOARD: Record<Role, string> = {
  student:          '/dashboard/student',
  lecturer:         '/dashboard/lecturer',
  admin_staff:      '/dashboard/admin',
  department_head:  '/dashboard/dept-head',
  super_admin:      '/dashboard/super-admin',
  parent_guardian:  '/dashboard/guardian',
};

const ROLE_COLOR: Record<Role, string> = {
  student:          'blue',
  lecturer:         'purple',
  admin_staff:      'green',
  department_head:  'orange',
  super_admin:      'red',
  parent_guardian:  'cyan',
};

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard',           icon: <DashboardOutlined />,       label: 'Dashboard',           feature: 'own_profile',        action: 'read',    group: 'main' },
  { key: '/students',           icon: <TeamOutlined />,            label: 'Students',            feature: 'all_profiles',       action: 'read',    group: 'academic' },
  { key: '/applications',       icon: <FileTextOutlined />,        label: 'Applications',        feature: 'applications',       action: 'manage',  group: 'academic' },
  { key: '/register-semester',  icon: <FormOutlined />,            label: 'Register Semester',   feature: 'registration',       action: 'view',    group: 'academic' },
  { key: '/registrations',      icon: <CheckSquareOutlined />,     label: 'Registrations',       feature: 'registration',       action: 'manage',  group: 'academic' },
  { key: '/schedules/approve',  icon: <CalendarOutlined />,        label: 'Approve Schedules',   feature: 'timetable',          action: 'manage',  group: 'academic' },
  { key: '/grades',             icon: <BookOutlined />,            label: 'Grades',              feature: 'grades_own',         action: 'read',    group: 'academic', roles: ['student'] },
  { key: '/grades',             icon: <BookOutlined />,            label: 'Grades',              feature: 'grades',             action: 'read',    group: 'academic', roles: ['lecturer', 'admin_staff', 'department_head', 'super_admin'] },
  { key: '/attendance',         icon: <CalendarOutlined />,        label: 'Attendance',          feature: 'attendance',         action: 'read',    group: 'academic' },
  { key: '/timetable',          icon: <CalendarOutlined />,        label: 'Timetable',           feature: 'timetable',          action: 'view',    group: 'academic' },
  { key: '/users',              icon: <UsergroupDeleteOutlined />, label: 'User Management',     feature: 'user_management',    action: 'any',     group: 'admin' },
  { key: '/discipline',         icon: <SafetyOutlined />,          label: 'Discipline',          feature: 'user_management',    action: 'any',     group: 'admin' },
  { key: '/fees',               icon: <DollarOutlined />,          label: 'Fees',                feature: 'fees_own',           action: 'read',    group: 'services' },
  { key: '/library',            icon: <ReadOutlined />,            label: 'Library',             feature: 'library_catalogue',  action: 'search',  group: 'services' },
  { key: '/hostel',             icon: <HomeOutlined />,            label: 'Hostel',              feature: 'hostel_allocations', action: 'read',    group: 'services' },
  { key: '/placement',          icon: <CarryOutOutlined />,        label: 'Placement',           feature: 'placement_listings', action: 'view',    group: 'services' },
  { key: '/alumni',             icon: <TrophyOutlined />,          label: 'Alumni',              feature: 'alumni',             action: 'manage',  group: 'admin' },
  { key: '/guardian',           icon: <UsergroupAddOutlined />,    label: 'Guardians',           feature: 'profile',            action: 'create',  group: 'admin' },
  { key: '/reports',            icon: <BarChartOutlined />,        label: 'Reports',             feature: 'reports',            action: 'generate',group: 'admin' },
  { key: '/notifications',      icon: <BellOutlined />,            label: 'Notifications',       feature: 'notification_config',action: 'manage',  group: 'system' },
  { key: '/audit',              icon: <AuditOutlined />,           label: 'Audit Log',           feature: 'audit_log',          action: 'view',    group: 'system' },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { can } = useRbac();

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } finally {
      navigate('/login', { replace: true });
    }
  }, [logout, navigate]);

  const selectedKey = location.pathname.startsWith('/dashboard')
    ? 'dashboard'
    : location.pathname;

  const handleNavClick = (key: string) => {
    if (key === 'dashboard') {
      navigate(user ? (ROLE_DASHBOARD[user.role] ?? '/dashboard/student') : '/login');
    } else {
      navigate(key);
    }
  };

  const visibleItems = NAV_ITEMS
    .filter(item => (!item.roles || (user?.role ? item.roles.includes(user.role) : false)) && can(item.feature, item.action))
    .map(item => ({ key: item.key, icon: item.icon, label: item.label }));

  const userMenu = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Sign Out',
      danger: true,
      onClick: handleLogout,
    },
  ];

  const roleLabel = user?.role?.replace(/_/g, ' ') ?? '';

  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      {/* ── Sidebar ── */}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={230}
        style={{
          background: '#001529',
          boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
        }}
      >
        {/* Logo area */}
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? 0 : '0 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(135deg, #001529 0%, #002766 100%)',
          overflow: 'hidden',
        }}>
          <Logo collapsed={collapsed} size={collapsed ? 34 : 38} variant="sidebar" />
        </div>

        {/* Nav menu */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={visibleItems}
          onClick={({ key }: { key: string }) => handleNavClick(key)}
          style={{ borderRight: 0, marginTop: 8, paddingBottom: 72 }}
        />

        {/* Bottom sidebar Sign Out button */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: collapsed ? '12px 6px' : '12px 16px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            background: 'linear-gradient(135deg, #001529 0%, #002766 100%)',
          }}
        >
          <Button
            type="text"
            danger
            icon={<LogoutOutlined style={{ fontSize: 16 }} />}
            onClick={handleLogout}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              color: '#ff7875',
              padding: collapsed ? '4px' : '6px 12px',
              borderRadius: 6,
              background: 'rgba(255, 77, 79, 0.08)',
            }}
          >
            {!collapsed && <span style={{ marginLeft: 8, fontWeight: 500 }}>Sign Out</span>}
          </Button>
        </div>
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 230, transition: 'margin-left 0.2s' }}>
        {/* ── Header ── */}
        <Header style={{
          padding: '0 24px',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          position: 'sticky',
          top: 0,
          zIndex: 99,
        }}>
          {/* Collapse toggle */}
          <span
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 18, cursor: 'pointer', color: '#595959', padding: '4px 8px', borderRadius: 6, transition: 'background 0.2s' }}
            onMouseEnter={(e: React.MouseEvent<any>) => (e.currentTarget.style.background = '#f5f5f5')}
            onMouseLeave={(e: React.MouseEvent<any>) => (e.currentTarget.style.background = 'transparent')}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </span>

          {/* Right side — user info and explicit Sign Out button */}
          <Space align="center" size="middle">
            <Dropdown
              menu={{
                items: userMenu,
                onClick: ({ key }: { key: string }) => {
                  if (key === 'logout') {
                    void handleLogout();
                  }
                },
              }}
              placement="bottomRight"
              trigger={['click']}
            >
              <Space
                style={{
                  cursor: 'pointer',
                  padding: '4px 12px',
                  borderRadius: 8,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e: React.MouseEvent<any>) => (e.currentTarget.style.background = '#f5f5f5')}
                onMouseLeave={(e: React.MouseEvent<any>) => (e.currentTarget.style.background = 'transparent')}
              >
                <Avatar
                  size={36}
                  style={{
                    background: 'linear-gradient(135deg, #1677ff, #69b1ff)',
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  {user?.username?.[0]?.toUpperCase()}
                </Avatar>
                <div style={{ lineHeight: 1.3 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#262626' }}>
                    {user?.username}
                  </div>
                  <Tag
                    color={ROLE_COLOR[user?.role as Role] ?? 'default'}
                    style={{
                      fontSize: 10,
                      padding: '0 6px',
                      lineHeight: '16px',
                      textTransform: 'capitalize',
                      margin: 0,
                    }}
                  >
                    {roleLabel}
                  </Tag>
                </div>
              </Space>
            </Dropdown>

            {/* Prominent Header Sign Out Button */}
            <Button
              type="default"
              danger
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              style={{
                borderRadius: 6,
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              Sign Out
            </Button>
          </Space>
        </Header>

        {/* ── Content ── */}
        <Content style={{ margin: '20px 24px', minHeight: 280 }}>
          {children}
        </Content>

        {/* ── Footer ── */}
        <div style={{
          textAlign: 'center',
          padding: '12px 24px',
          color: '#ffffff',
          fontSize: 12,
          borderTop: '1px solid rgba(255,255,255,0.1)',
          background: '#001529',
        }}>
          © 2026 Aletta Chuko TVET College — Student Information Management System
        </div>
      </Layout>
    </Layout>
  );
}

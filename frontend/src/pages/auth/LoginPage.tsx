import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Divider } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Logo } from '../../components/Logo';
import type { Role } from '../../types';

const DASHBOARD_BY_ROLE: Record<Role, string> = {
  student:          '/dashboard/student',
  lecturer:         '/dashboard/lecturer',
  admin_staff:      '/dashboard/admin',
  department_head:  '/dashboard/dept-head',
  super_admin:      '/dashboard/super-admin',
  parent_guardian:  '/dashboard/guardian',
};

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { username: string; password: string }) => {
    setError(null);
    setLoading(true);
    try {
      await login(values.username, values.password);
      const stored = localStorage.getItem('sims_user');
      const u = stored ? (JSON.parse(stored) as { role: Role }) : null;
      const dest = u?.role ? (DASHBOARD_BY_ROLE[u.role] ?? '/dashboard/student') : '/dashboard/student';
      navigate(dest, { replace: true });
    } catch (err: unknown) {
      const resp = (err as { response?: { status?: number; data?: { error?: { message?: string }; message?: string } } })?.response;
      const status = resp?.status;
      const serverMsg = resp?.data?.error?.message || resp?.data?.message;

      if (status === 423) {
        setError('Account locked after too many failed attempts. Try again in 30 minutes.');
      } else if (status === 401) {
        setError('Invalid username or password. Please verify your credentials.');
      } else if (serverMsg) {
        setError(serverMsg);
      } else if ((err as { code?: string })?.code === 'ECONNABORTED' || (err as { message?: string })?.message?.includes('timeout')) {
        setError('The server is waking up from sleep mode (Render cold start). Please wait 30 seconds and click Sign In again.');
      } else {
        setError('Unable to reach the backend server. Please verify your internet connection or wait a moment for the server to wake up.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #001529 0%, #003a8c 50%, #001529 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      {/* Background decoration */}
      <div style={{
        position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none',
      }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.03)',
            width: `${150 + i * 80}px`,
            height: `${150 + i * 80}px`,
            top: `${10 + i * 12}%`,
            left: `${-5 + i * 15}%`,
          }} />
        ))}
      </div>

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        {/* Logo above card */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, padding: '12px 24px', background: 'rgba(255,255,255,0.06)', borderRadius: 16, backdropFilter: 'blur(10px)' }}>
            <Logo size={50} variant="sidebar" />
          </div>
          <Typography.Title level={4} style={{ color: '#fff', marginTop: 16, marginBottom: 4 }}>
            Aletta Chuko TVET College
          </Typography.Title>
          <Typography.Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
            Student Information Management System
          </Typography.Text>
        </div>

        <Card
          style={{
            borderRadius: 16,
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            border: 'none',
          }}
          bodyStyle={{ padding: '36px 40px' }}
        >
          <Typography.Title level={4} style={{ textAlign: 'center', marginBottom: 6, color: '#001529' }}>
            Welcome back
          </Typography.Title>
          <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 28, fontSize: 13 }}>
            Sign in to your account to continue
          </Typography.Text>

          {error && (
            <Alert message={error} type="error" showIcon style={{ marginBottom: 20, borderRadius: 8 }} />
          )}

          <Form layout="vertical" onFinish={onFinish} autoComplete="off" size="large">
            <Form.Item name="username" rules={[{ required: true, message: 'Username is required' }]}>
              <Input
                prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="Username"
                style={{ borderRadius: 8 }}
              />
            </Form.Item>

            <Form.Item name="password" rules={[{ required: true, message: 'Password is required' }]} style={{ marginBottom: 8 }}>
              <Input.Password
                prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="Password"
                style={{ borderRadius: 8 }}
              />
            </Form.Item>

            <div style={{ textAlign: 'right', marginBottom: 20 }}>
              <Link to="/forgot-password" style={{ fontSize: 13 }}>Forgot password?</Link>
            </div>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                style={{
                  height: 44,
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 15,
                  background: 'linear-gradient(135deg, #1677ff, #003a8c)',
                  border: 'none',
                }}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </Button>
            </Form.Item>
          </Form>
        </Card>

        <Typography.Text style={{ display: 'block', textAlign: 'center', marginTop: 20, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
          © 2026 Polytechnic SIMS. All rights reserved.
        </Typography.Text>
      </div>
    </div>
  );
}

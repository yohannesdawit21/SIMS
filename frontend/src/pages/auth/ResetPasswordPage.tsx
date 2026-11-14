import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Result } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/axios';

const COMPLEXITY_HINT = 'At least 8 characters with uppercase, lowercase, digit, and special character.';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: { password: string; confirm: string }) => {
    setError(null);
    if (!token) { setError('Reset token is missing.'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: values.password });
      setDone(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <Card style={{ width: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.1)' }}>
        {done ? (
          <Result
            status="success"
            title="Password reset successfully"
            extra={<Link to="/login"><Button type="primary">Back to Login</Button></Link>}
          />
        ) : (
          <>
            <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>
              Reset Password
            </Typography.Title>
            <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>
              {COMPLEXITY_HINT}
            </Typography.Text>

            {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}

            <Form layout="vertical" onFinish={onFinish}>
              <Form.Item
                name="password"
                label="New Password"
                rules={[
                  { required: true, message: 'Please enter a new password' },
                  { min: 8, message: 'At least 8 characters' },
                  {
                    validator: (_, value) => {
                      if (!value) return Promise.resolve();
                      const ok = /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
                      return ok ? Promise.resolve() : Promise.reject(new Error('Must include upper, lower, digit, and special character'));
                    },
                  },
                ]}
              >
                <Input.Password prefix={<LockOutlined />} size="large" />
              </Form.Item>

              <Form.Item
                name="confirm"
                label="Confirm Password"
                dependencies={['password']}
                rules={[
                  { required: true, message: 'Please confirm your password' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) return Promise.resolve();
                      return Promise.reject(new Error('Passwords do not match'));
                    },
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined />} size="large" />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block size="large">
                  Reset Password
                </Button>
              </Form.Item>
            </Form>
          </>
        )}
      </Card>
    </div>
  );
}

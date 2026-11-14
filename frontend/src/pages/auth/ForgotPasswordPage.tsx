import React, { useState } from 'react';
import { Form, Input, Button, Card, Typography, Alert, Result } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { api } from '../../api/axios';

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: { email: string }) => {
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: values.email });
      setSubmitted(true);
    } catch {
      setError('Failed to send reset email. Please check the address and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <Card style={{ width: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.1)' }}>
        {submitted ? (
          <Result
            status="success"
            title="Check your email"
            subTitle="If an account with that email exists, a reset link has been sent. The link expires in 60 minutes."
            extra={<Link to="/login"><Button type="primary">Back to Login</Button></Link>}
          />
        ) : (
          <>
            <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>
              Forgot Password
            </Typography.Title>
            <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>
              Enter your registered email address and we'll send you a reset link.
            </Typography.Text>

            {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}

            <Form layout="vertical" onFinish={onFinish}>
              <Form.Item name="email" rules={[{ required: true, type: 'email', message: 'Please enter a valid email' }]}>
                <Input prefix={<MailOutlined />} placeholder="Email address" size="large" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block size="large">
                  Send Reset Link
                </Button>
              </Form.Item>
            </Form>
            <Typography.Text style={{ display: 'block', textAlign: 'center' }}>
              <Link to="/login">Back to Login</Link>
            </Typography.Text>
          </>
        )}
      </Card>
    </div>
  );
}

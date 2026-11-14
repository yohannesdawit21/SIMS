import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Alert,
  Button,
  Select,
  Form,
  Input,
  Space,
  Table,
  Tag,
  Spin,
  message,
  Modal,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/axios';
import {
  checkEligibility,
  registerForSemester,
  getStudentRegistrations,
} from '../../api/registration';
import type { EligibilityResponse, SemesterRegistration } from '../../api/registration';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface AcademicPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export default function SemesterRegistrationPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [studentId, setStudentId] = useState<string>('');

  // Fetch student profile to get student_id
  useEffect(() => {
    const fetchStudentProfile = async () => {
      if (user?.role === 'student') {
        try {
          const response = await api.get('/students/profile');
          setStudentId(response.data.id || response.data.data?.id);
        } catch (error) {
          console.error('Failed to fetch student profile:', error);
        }
      }
    };
    fetchStudentProfile();
  }, [user]);

  // Check eligibility
  const { data: eligibility, isLoading: eligibilityLoading } = useQuery<EligibilityResponse>({
    queryKey: ['eligibility', studentId],
    queryFn: () => checkEligibility(studentId),
    enabled: !!studentId,
  });

  // Fetch academic periods
  const { data: periods = [] } = useQuery<AcademicPeriod[]>({
    queryKey: ['academic-periods'],
    queryFn: async () => {
      const response = await api.get('/timetable/periods');
      return response.data?.data || response.data || [];
    },
  });

  // Fetch registration history
  const { data: registrations = [], isLoading: historyLoading } = useQuery<SemesterRegistration[]>({
    queryKey: ['student-registrations', studentId],
    queryFn: () => getStudentRegistrations(studentId),
    enabled: !!studentId,
  });

  // Register mutation
  const registerMutation = useMutation({
    mutationFn: registerForSemester,
    onSuccess: (data) => {
      if (data.status === 'blocked') {
        message.warning('Registration blocked. Please see details below.');
      } else if (data.gpa_warning) {
        message.warning('Registration approved with warning. Monitor your academic performance.');
      } else {
        message.success('Successfully registered for semester!');
      }
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['student-registrations', studentId] });
      qc.invalidateQueries({ queryKey: ['eligibility', studentId] });
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to register for semester';
      message.error(msg);
    },
  });

  const handleRegister = (values: any) => {
    registerMutation.mutate({
      student_id: studentId,
      academic_period_id: values.academic_period_id,
      notes: values.notes,
    });
  };

  const columns: ColumnsType<SemesterRegistration> = [
    {
      title: 'Semester',
      dataIndex: ['academicPeriod', 'name'],
      key: 'semester',
      render: (name) => name || 'N/A',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colors: Record<string, string> = {
          approved: 'green',
          blocked: 'red',
          pending: 'gold',
          rejected: 'red',
        };
        return <Tag color={colors[status] || 'default'}>{status.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'GPA at Registration',
      dataIndex: 'gpa_at_registration',
      key: 'gpa',
      render: (gpa: number | null) => (gpa ? gpa.toFixed(2) : 'N/A'),
    },
    {
      title: 'Warnings/Blocks',
      key: 'warnings',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          {record.gpa_warning && (
            <Tag icon={<WarningOutlined />} color="warning">
              GPA Warning
            </Tag>
          )}
          {record.gpa_block && (
            <Tag icon={<CloseCircleOutlined />} color="error">
              GPA Block
            </Tag>
          )}
          {record.has_discipline_block && (
            <Tag icon={<CloseCircleOutlined />} color="error">
              Discipline Block
            </Tag>
          )}
          {record.admin_override && (
            <Tag icon={<CheckCircleOutlined />} color="blue">
              Admin Override
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Registration Date',
      dataIndex: 'registered_at',
      key: 'registered_at',
      render: (date: string) => dayjs(date).format('MMM DD, YYYY HH:mm'),
    },
    {
      title: 'Block Reason',
      dataIndex: 'block_reason',
      key: 'block_reason',
      render: (reason: string | null) => reason || '-',
    },
  ];

  if (eligibilityLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <Paragraph style={{ marginTop: '16px' }}>Checking eligibility...</Paragraph>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Title level={2}>Semester Registration</Title>
      <Paragraph>Register for the upcoming semester based on your academic standing.</Paragraph>

      {/* Eligibility Status */}
      <Card style={{ marginBottom: '24px' }}>
        <Title level={4}>Eligibility Status</Title>

        {eligibility?.eligible && (
          <Alert
            message="✅ You are eligible to register for the semester"
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            style={{ marginBottom: '16px' }}
          />
        )}

        {!eligibility?.eligible && (
          <Alert
            message="🚫 Registration Blocked"
            description={
              <div>
                <Paragraph>You are currently blocked from registering due to:</Paragraph>
                <ul>
                  {eligibility?.blocks.map((block, index) => (
                    <li key={index}>{block}</li>
                  ))}
                </ul>
                <Paragraph>
                  <strong>Please contact the registrar's office for assistance.</strong>
                </Paragraph>
              </div>
            }
            type="error"
            showIcon
            icon={<CloseCircleOutlined />}
            style={{ marginBottom: '16px' }}
          />
        )}

        {eligibility?.warnings && eligibility.warnings.length > 0 && (
          <Alert
            message="⚠️ Academic Warning"
            description={
              <div>
                <ul>
                  {eligibility.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
                <Paragraph>
                  You can still register, but please focus on improving your academic performance.
                </Paragraph>
              </div>
            }
            type="warning"
            showIcon
            icon={<WarningOutlined />}
            style={{ marginBottom: '16px' }}
          />
        )}

        <Card size="small" style={{ background: '#fafafa' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>
              <strong>Current GPA:</strong> {eligibility?.gpa ? eligibility.gpa.toFixed(2) : 'N/A'}
            </Text>
            <Text>
              <strong>Minimum Required:</strong> 1.80
            </Text>
            <Text>
              <strong>Active Discipline Issues:</strong>{' '}
              {eligibility?.has_active_discipline ? (
                <Tag color="red">Yes</Tag>
              ) : (
                <Tag color="green">No</Tag>
              )}
            </Text>
          </Space>
        </Card>
      </Card>

      {/* Registration Form */}
      {eligibility?.eligible && (
        <Card style={{ marginBottom: '24px' }}>
          <Title level={4}>Register for Semester</Title>
          <Form form={form} layout="vertical" onFinish={handleRegister}>
            <Form.Item
              name="academic_period_id"
              label="Select Semester"
              rules={[{ required: true, message: 'Please select a semester' }]}
            >
              <Select placeholder="Select semester to register for" size="large">
                {periods
                  .filter((p) => {
                    // Filter out periods already registered for
                    const alreadyRegistered = registrations.some(
                      (r) => r.academic_period_id === p.id && r.status !== 'rejected'
                    );
                    return !alreadyRegistered;
                  })
                  .map((period) => (
                    <Select.Option key={period.id} value={period.id}>
                      {period.name} {period.is_current && '(Current)'}
                    </Select.Option>
                  ))}
              </Select>
            </Form.Item>

            <Form.Item name="notes" label="Notes (Optional)">
              <TextArea rows={3} placeholder="Add any notes or comments" />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                loading={registerMutation.isPending}
                block
              >
                Register for Semester
              </Button>
            </Form.Item>
          </Form>
        </Card>
      )}

      {/* Registration History */}
      <Card>
        <Title level={4}>
          <HistoryOutlined /> Registration History
        </Title>
        <Table
          columns={columns}
          dataSource={registrations}
          rowKey="id"
          loading={historyLoading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </div>
  );
}

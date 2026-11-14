import React, { useState } from 'react';
import {
  Table, Button, Input, Space, Tag, Typography, Modal, Form,
  Select, DatePicker, message, InputNumber, Row, Col,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, UserDeleteOutlined, TeamOutlined, AuditOutlined,
  UserAddOutlined, BookOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/axios';
import { RoleGate } from '../../components/RoleGate';
import type { StudentProfile } from '../../types';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';

interface CreateStudentFormValues {
  full_legal_name: string;
  date_of_birth: Dayjs;
  gender?: string;
  national_id: string;
  email: string;
  phone?: string;
  home_address?: string;
  year_of_entry: number;
}

export default function StudentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [batchEnrollOpen, setBatchEnrollOpen] = useState(false);
  const [batchForm] = Form.useForm();
  const [batchGradOpen, setBatchGradOpen] = useState(false);
  const [batchGradForm] = Form.useForm();
  const [form] = Form.useForm<CreateStudentFormValues>();

  const { data, isLoading } = useQuery({
    queryKey: ['students'],
    queryFn: () =>
      api.get<{ success: boolean; data: StudentProfile[] }>('/students')
        .then(r => r.data.data),
  });

  const { data: courses } = useQuery<any[]>({
    queryKey: ['available-courses-students'],
    queryFn: () =>
      api.get('/timetable/courses').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
  });

  const { data: periods } = useQuery<any[]>({
    queryKey: ['available-periods-students'],
    queryFn: () =>
      api.get('/timetable/periods').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
  });

  const [directEnrollOpen, setDirectEnrollOpen] = useState(false);
  const [directEnrollForm] = Form.useForm();
  const directEnrollMutation = useMutation({
    mutationFn: (values: { course_id: string; academic_period_id: string; student_ids: string[] }) =>
      api.post('/enrollments/students', values).then((r: any) => r.data),
    onSuccess: (res: any) => {
      void message.success(res?.message || 'Students successfully enrolled into the course!');
      setDirectEnrollOpen(false);
      directEnrollForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['students'] });
      void qc.invalidateQueries({ queryKey: ['my-assigned-courses'] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Failed to enroll students';
      void message.error(msg);
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post<{
        success: boolean;
        data: {
          user: { username: string };
          student_number: string;
          temporary_password: string;
        };
      }>(
        '/students', values,
      ).then(r => r.data),
    onSuccess: (res) => {
      const username = res.data?.user?.username ?? '—';
      const studentNo = res.data?.student_number ?? '—';
      const temporaryPassword = res.data?.temporary_password ?? '—';
      Modal.success({
        title: 'Student Created Successfully',
        content: (
          <div style={{ marginTop: 8 }}>
            <p><strong>Student Number:</strong> {studentNo}</p>
            <p><strong>Login Username:</strong> <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{username}</code></p>
            <p><strong>Temporary Password:</strong> <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{temporaryPassword}</code></p>
            <p style={{ color: '#8c8c8c', fontSize: 12, marginTop: 8 }}>
              Share these credentials with the student. They can reset their password using "Forgot Password" on the login page.
            </p>
          </div>
        ),
        width: 420,
      });
      setCreateOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      void message.error(msg ?? 'Failed to create student. Check all required fields.');
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/students/${id}/deactivate`).then(r => r.data),
    onSuccess: () => {
      void message.success('Student deactivated');
      void qc.invalidateQueries({ queryKey: ['students'] });
    },
    onError: () => void message.error('Failed to deactivate student'),
  });

  
  const batchEnrollMutation = useMutation({
    mutationFn: (values: { programme_id: string; year_of_entry?: number; academic_period_id: string; course_ids: string[] }) =>
      api.post('/enrollments/batch', values).then(r => r.data),
    onSuccess: (res: any) => {
      const respData = res.data ?? res;
      Modal.success({
        title: 'Batch Enrollment Complete',
        content: (
          <div style={{ marginTop: 8 }}>
            <p><strong>Students Enrolled:</strong> {respData.enrolledStudentsCount}</p>
            <p><strong>Total Course Enrollments Created:</strong> {respData.totalEnrollmentsCreated}</p>
            <p><strong>Skipped (Already Enrolled):</strong> {respData.skippedAlreadyEnrolled}</p>
            {respData.capacityExceededCourses?.length > 0 && (
              <p style={{ color: '#ff4d4f' }}>
                <strong>Capacity Exceeded on Courses:</strong> {respData.capacityExceededCourses.join(', ')}
              </p>
            )}
          </div>
        ),
      });
      setBatchEnrollOpen(false);
      batchForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (e: any) => {
      const msg = e.response?.data?.message || 'Failed to complete batch enrollment';
      void message.error(msg);
    },
  });

  
  const batchGradMutation = useMutation({
    mutationFn: (values: { programme_id: string; year_of_entry?: number; graduation_date?: string }) =>
      api.post('/students/batch-graduate', values).then(r => r.data),
    onSuccess: (res: any) => {
      const respData = res.data ?? res;
      Modal.success({
        title: 'Batch Graduation Complete',
        content: (
          <div style={{ marginTop: 8 }}>
            <p><strong>Students Graduated:</strong> {respData.graduatedCount}</p>
            <p>Their status has been updated to <strong>Graduated</strong> and corresponding <strong>Alumni</strong> records have been generated.</p>
          </div>
        ),
      });
      setBatchGradOpen(false);
      batchGradForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (e: any) => {
      const msg = e.response?.data?.message || 'Failed to complete batch graduation';
      void message.error(msg);
    },
  });

  const handleCreate = (values: CreateStudentFormValues) => {
    // Convert dayjs object → ISO date string (YYYY-MM-DD)
    const payload = {
      ...values,
      date_of_birth: values.date_of_birth
        ? (values.date_of_birth as Dayjs).format('YYYY-MM-DD')
        : undefined,
      year_of_entry: Number(values.year_of_entry),
    };
    createMutation.mutate(payload as Record<string, unknown>);
  };

  const filtered = (data ?? []).filter(s =>
    s.full_legal_name.toLowerCase().includes(search.toLowerCase()) ||
    s.student_number.toLowerCase().includes(search.toLowerCase()),
  );

  const columns: ColumnsType<StudentProfile> = [
    {
      title: 'Student No.',
      dataIndex: 'student_number',
      key: 'no',
      width: 140,
      render: (v: string) => <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{v}</code>,
    },
    {
      title: 'Name',
      dataIndex: 'full_legal_name',
      key: 'name',
      render: (name: string, r) => (
        <Button type="link" style={{ padding: 0, fontWeight: 500 }} onClick={() => navigate(`/students/${r.id}`)}>
          {name}
        </Button>
      ),
    },
    {
      title: 'Programme',
      dataIndex: ['programme', 'name'],
      key: 'prog',
      render: (v: unknown) => v ?? <span style={{ color: '#bfbfbf' }}>—</span>,
    },
    { title: 'Year', dataIndex: 'year_of_entry', key: 'year', width: 80 },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: string) => (
        <Tag color={s === 'active' ? 'green' : s === 'graduated' ? 'blue' : 'red'}>
          {s}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_: unknown, r: StudentProfile) => (
        <RoleGate feature="profile" action="update">
          <Button
            danger
            size="small"
            icon={<UserDeleteOutlined />}
            onClick={() => Modal.confirm({
              title: `Deactivate ${r.full_legal_name}?`,
              content: 'The student will no longer be able to log in.',
              okText: 'Deactivate',
              okButtonProps: { danger: true },
              onOk: () => { deactivateMutation.mutate(r.id); },
            })}
          >
            Deactivate
          </Button>
        </RoleGate>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Students
          <Tag style={{ marginLeft: 12, fontWeight: 400, fontSize: 13 }} color="blue">
            {filtered.length} total
          </Tag>
        </Typography.Title>
        <Space>
          <Input
            placeholder="Search by name or student number"
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />
          
          <RoleGate feature="course_enrollment" action="manage">
            <Button
              type="primary"
              icon={<UserAddOutlined />}
              onClick={() => setDirectEnrollOpen(true)}
            >
              Enroll Students to Course
            </Button>
            <Button
              icon={<TeamOutlined />}
              onClick={() => setBatchEnrollOpen(true)}
            >
              Batch Cohort Enrollment
            </Button>
          </RoleGate>
          
          <RoleGate feature="profile" action="update">
            <Button
              icon={<AuditOutlined />}
              onClick={() => setBatchGradOpen(true)}
            >
              Batch Graduation
            </Button>
          </RoleGate>
          <RoleGate feature="profile" action="create">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
              style={{ fontWeight: 500 }}
            >
              New Student
            </Button>
          </RoleGate>
        </Space>
      </Space>

      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        style={{ background: '#fff', borderRadius: 12 }}
        onRow={(r) => ({
          style: { cursor: 'pointer' },
          onClick: () => navigate(`/students/${r.id}`),
        })}
      />

      {/* Create Student Modal */}
      <Modal
        title={
          <Space>
            <PlusOutlined style={{ color: '#1677ff' }} />
            Create New Student Profile
          </Space>
        }
        open={createOpen}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText="Create Student"
        confirmLoading={createMutation.isPending}
        width={640}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          style={{ marginTop: 16 }}
        >
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="full_legal_name"
                label="Full Legal Name"
                rules={[{ required: true, message: 'Full name is required' }]}
              >
                <Input placeholder="e.g. Yohannes Tesfaye" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="date_of_birth"
                label="Date of Birth"
                rules={[{ required: true, message: 'Date of birth is required' }]}
              >
                <DatePicker
                  style={{ width: '100%' }}
                  placeholder="Select date"
                  format="YYYY-MM-DD"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="gender" label="Gender">
                <Select
                  placeholder="Select gender"
                  options={[
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                    { value: 'other', label: 'Other' },
                  ]}
                  allowClear
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="national_id"
                label="National ID"
                rules={[{ required: true, message: 'National ID is required' }]}
              >
                <Input placeholder="e.g. ETH-123456" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="year_of_entry"
                label="Year of Entry"
                rules={[{ required: true, message: 'Year of entry is required' }]}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={2000}
                  max={2100}
                  placeholder={String(new Date().getFullYear())}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="email"
                label="Email Address (Login)"
                rules={[
                  { required: true, message: 'Email is required' },
                  { type: 'email', message: 'Enter a valid email' },
                ]}
                tooltip="This becomes the student's login email"
              >
                <Input placeholder="student@example.com" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="Phone Number">
                <Input placeholder="+251 91 234 5678" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="home_address" label="Home Address">
            <Input.TextArea rows={2} placeholder="Street, City, Region" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Direct Course Enrollment Modal */}
      <Modal
        title={
          <Space>
            <UserAddOutlined style={{ color: '#1677ff' }} />
            <span>Enroll Students into Course</span>
          </Space>
        }
        open={directEnrollOpen}
        onCancel={() => {
          setDirectEnrollOpen(false);
          directEnrollForm.resetFields();
        }}
        onOk={() => directEnrollForm.submit()}
        confirmLoading={directEnrollMutation.isPending}
        okText="Enroll Students"
        width={600}
        destroyOnClose
      >
        <Form
          form={directEnrollForm}
          layout="vertical"
          onFinish={(values: any) => directEnrollMutation.mutate(values)}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="academic_period_id"
            label="Academic Period"
            rules={[{ required: true, message: 'Please select an academic period' }]}
          >
            <Select
              placeholder="Select academic period"
              options={(periods ?? []).map((p: any) => ({
                value: p.id,
                label: `${p.name}${p.is_locked ? ' (Locked)' : ''}`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="course_id"
            label="Target Course"
            rules={[{ required: true, message: 'Please select a course' }]}
          >
            <Select
              showSearch
              placeholder="Select course to enroll students into"
              optionFilterProp="label"
              options={(courses ?? []).map((c: any) => ({
                value: c.id,
                label: `${c.code} — ${c.name} (${c.credit_hours || 3} credits)`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="student_ids"
            label={
              <Space>
                <span>Select Students</span>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    const allIds = (data ?? []).map((s: any) => s.id);
                    directEnrollForm.setFieldsValue({ student_ids: allIds });
                  }}
                >
                  Select All Active Students
                </Button>
              </Space>
            }
            rules={[{ required: true, message: 'Please select at least one student' }]}
          >
            <Select
              mode="multiple"
              showSearch
              placeholder="Select students to enroll"
              optionFilterProp="label"
              options={(data ?? []).map((s: any) => ({
                value: s.id,
                label: `${s.student_number} — ${s.full_legal_name}`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Batch Cohort Enrollment Modal */}
      <Modal
        title={
          <Space>
            <TeamOutlined style={{ color: '#1677ff' }} />
            <span>Batch Auto-Enroll Cohort into Courses</span>
          </Space>
        }
        open={batchEnrollOpen}
        onCancel={() => {
          setBatchEnrollOpen(false);
          batchForm.resetFields();
        }}
        onOk={() => batchForm.submit()}
        confirmLoading={batchEnrollMutation.isPending}
        okText="Auto-Enroll Cohort"
        width={600}
        destroyOnClose
      >
        <Form
          form={batchForm}
          layout="vertical"
          onFinish={(values: any) => batchEnrollMutation.mutate(values)}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="academic_period_id"
            label="Academic Period"
            rules={[{ required: true, message: 'Select academic period' }]}
          >
            <Select
              placeholder="Select academic period"
              options={(periods ?? []).map((p: any) => ({
                value: p.id,
                label: `${p.name}${p.is_locked ? ' (Locked)' : ''}`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="course_ids"
            label="Courses to Enroll"
            rules={[{ required: true, message: 'Select at least one course' }]}
          >
            <Select
              mode="multiple"
              showSearch
              placeholder="Select courses"
              optionFilterProp="label"
              options={(courses ?? []).map((c: any) => ({
                value: c.id,
                label: `${c.code} — ${c.name}`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="year_of_entry"
            label="Year of Entry (Optional Filter)"
          >
            <InputNumber min={2000} max={2100} placeholder="e.g. 2026 (Leave empty for all active)" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

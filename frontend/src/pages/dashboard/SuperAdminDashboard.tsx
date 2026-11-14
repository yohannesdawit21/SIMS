import React, { useEffect, useState } from 'react';
import {
  Row, Col, Card, Statistic, Typography, Table, Tag, Button,
  Space, Modal, Form, Select, Input, Radio, message, Alert
} from 'antd';
import {
  BellOutlined, AuditOutlined, UserOutlined, BookOutlined,
  TeamOutlined, CalendarOutlined, CheckCircleOutlined, PlusOutlined,
  ApartmentOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/axios';
import type { ColumnsType } from 'antd/es/table';

interface PaginatedResponse {
  data: unknown[];
  total: number;
  page: number;
  limit: number;
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [registerHodOpen, setRegisterHodOpen] = useState(false);
  const [registerLecturerOpen, setRegisterLecturerOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [lecturerCredentialsOpen, setLecturerCredentialsOpen] = useState(false);
  const [createdHodInfo, setCreatedHodInfo] = useState<any>(null);
  const [createdLecturerInfo, setCreatedLecturerInfo] = useState<any>(null);
  const [deptMode, setDeptMode] = useState<'existing' | 'new'>('existing');
  const [selectedDeptId, setSelectedDeptId] = useState<string | undefined>();

  const [assignForm] = Form.useForm();
  const [enrollForm] = Form.useForm();
  const [hodForm] = Form.useForm();
  const [lecturerForm] = Form.useForm();

  // Queries
  const { data: users } = useQuery({
    queryKey: ['users-count'],
    queryFn: () =>
      api.get<{ success: boolean; data: unknown[] }>('/users').then(r => r.data.data),
  });

  const { data: notifTotal } = useQuery({
    queryKey: ['notif-total'],
    queryFn: () =>
      api.get<{ success: boolean; data: PaginatedResponse }>(
        '/notifications/logs?limit=1',
      ).then(r => r.data.data?.total ?? 0),
  });

  const { data: auditTotal } = useQuery({
    queryKey: ['audit-count'],
    queryFn: () =>
      api.get<{ success: boolean; data: PaginatedResponse }>('/audit?limit=1')
        .then(r => r.data.data?.total ?? 0),
  });

  const { data: departments, isLoading: deptsLoading } = useQuery({
    queryKey: ['admin-departments'],
    queryFn: () =>
      api.get('/timetable/departments').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
  });

  const { data: courses, isLoading: coursesLoading } = useQuery({
    queryKey: ['admin-all-courses'],
    queryFn: () =>
      api.get('/timetable/courses').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
  });

  const { data: lecturers } = useQuery({
    queryKey: ['admin-available-lecturers'],
    queryFn: () =>
      api.get('/timetable/lecturers').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
  });

  const { data: periods } = useQuery({
    queryKey: ['admin-available-periods'],
    queryFn: () =>
      api.get('/timetable/periods').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
  });

  const { data: students } = useQuery({
    queryKey: ['admin-students'],
    queryFn: () =>
      api.get('/students').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
  });

  const { data: enrollments } = useQuery({
    queryKey: ['admin-enrollments'],
    queryFn: () =>
      api.get('/enrollments').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
  });

  // Mutations
  const registerHodMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post('/users/register-hod', values).then((r: any) => r.data?.data ?? r.data),
    onSuccess: (data: any) => {
      void message.success('Head of Department registered and appointed successfully!');
      setRegisterHodOpen(false);
      setCreatedHodInfo(data);
      setCredentialsOpen(true);
      hodForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['admin-departments'] });
      void qc.invalidateQueries({ queryKey: ['users-count'] });
    },
    onError: (e: any) => {
      void message.error(e?.response?.data?.message || 'Failed to register Head of Department');
    },
  });

  const registerLecturerMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post('/users', { ...values, role: 'lecturer' }).then((r: any) => r.data?.data ?? r.data),
    onSuccess: (data: any) => {
      void message.success('Lecturer registered successfully!');
      setRegisterLecturerOpen(false);
      setCreatedLecturerInfo(data);
      setLecturerCredentialsOpen(true);
      lecturerForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['users-count'] });
      void qc.invalidateQueries({ queryKey: ['admin-available-lecturers'] });
    },
    onError: (e: any) => {
      void message.error(e?.response?.data?.message || 'Failed to register lecturer');
    },
  });

  const assignMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post('/timetable/courses/assign', values).then((r: any) => r.data),
    onSuccess: () => {
      void message.success('Teacher assigned to course successfully');
      setAssignModalOpen(false);
      assignForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['admin-all-courses'] });
      void qc.invalidateQueries({ queryKey: ['available-lecturers'] });
    },
    onError: (e: any) => {
      void message.error(e?.response?.data?.message || 'Failed to assign teacher to course');
    },
  });

  const enrollMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post('/enrollments/students', values).then((r: any) => r.data),
    onSuccess: (data: any) => {
      void message.success(data?.message || 'Students enrolled successfully');
      setEnrollModalOpen(false);
      enrollForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['admin-enrollments'] });
      void qc.invalidateQueries({ queryKey: ['admin-all-courses'] });
    },
    onError: (e: any) => {
      void message.error(e?.response?.data?.message || 'Failed to enroll students');
    },
  });

  const handleOpenRegisterHod = (preselectedDeptId?: string) => {
    const hasDepts = Boolean(departments && departments.length > 0);
    const mode = preselectedDeptId ? 'existing' : (hasDepts ? 'existing' : 'new');
    const departmentId = preselectedDeptId || (hasDepts ? departments[0]?.id : undefined);

    // Reset before opening so a previous/destroyed modal cannot retain stale values.
    hodForm.resetFields();
    setDeptMode(mode);
    setSelectedDeptId(departmentId);
    setRegisterHodOpen(true);
  };

  // Apply defaults after the modal/form has mounted. This is reliable even when
  // the departments request finishes while the modal is being opened.
  useEffect(() => {
    if (!registerHodOpen) return;
    hodForm.setFieldsValue({
      password: 'DeptHead@2016!',
      department_id: selectedDeptId,
    });
  }, [registerHodOpen, selectedDeptId, hodForm]);

  const handleOpenAssign = (courseId?: string) => {
    setAssignModalOpen(true);
    setTimeout(() => {
      try {
        assignForm.setFieldsValue({
          course_id: courseId || courses?.[0]?.id,
          academic_period_id: periods?.[0]?.id,
        });
      } catch {
        // ignore
      }
    }, 50);
  };

  const handleOpenEnroll = (courseId?: string) => {
    setEnrollModalOpen(true);
    setTimeout(() => {
      try {
        enrollForm.setFieldsValue({
          course_id: courseId || courses?.[0]?.id,
          academic_period_id: periods?.[0]?.id,
        });
      } catch {
        // ignore
      }
    }, 50);
  };

  const courseColumns: ColumnsType<any> = [
    {
      title: 'Course Code',
      dataIndex: 'code',
      key: 'code',
      width: 130,
      render: (c: string) => (
        <Typography.Text strong style={{ fontFamily: 'monospace', color: '#1677ff' }}>
          {c}
        </Typography.Text>
      ),
    },
    {
      title: 'Course Title',
      dataIndex: 'name',
      key: 'name',
      render: (n: string, record: any) => (
        <div>
          <Typography.Text strong>{n}</Typography.Text>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {record.department?.name || 'General Academic'}
          </div>
        </div>
      ),
    },
    {
      title: 'Credits',
      dataIndex: 'credit_hours',
      key: 'credit_hours',
      width: 90,
      align: 'center',
      render: (cr: number) => <Tag color="blue">{cr ?? 3} Cr</Tag>,
    },
    {
      title: 'Assigned Lecturer(s)',
      key: 'assigned_lecturers',
      width: 230,
      render: (_: unknown, record: any) => {
        const assigned = record.assigned_lecturers || [];
        if (!assigned.length) {
          return <Tag color="default">Unassigned</Tag>;
        }
        return (
          <Space direction="vertical" size={2}>
            {assigned.map((a: any, i: number) => (
              <Tag key={i} color="purple" icon={<UserOutlined />}>
                {a.lecturer_name} ({a.academic_period_name || 'Active'})
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: 'Enrolled',
      key: 'enrolled',
      width: 130,
      align: 'center',
      render: (_: unknown, record: any) => {
        const count = (enrollments ?? []).filter((e: any) => e.course_id === record.id).length;
        return <Tag color={count > 0 ? 'green' : 'default'}>{count} students</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'action',
      width: 250,
      align: 'center',
      render: (_: unknown, record: any) => (
        <Space size="small">
          <Button
            size="small"
            type="primary"
            ghost
            icon={<UserOutlined />}
            onClick={() => handleOpenAssign(record.id)}
          >
            Assign Lecturer
          </Button>
          <Button
            size="small"
            icon={<TeamOutlined />}
            onClick={() => handleOpenEnroll(record.id)}
          >
            Enroll Students
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Super Admin Control Center
          </Typography.Title>
          <Typography.Text type="secondary">
            Institution-wide system oversight, HOD appointments, course assignments, and grading workflows.
          </Typography.Text>
        </div>
        <Space wrap>
          <Button
            type="primary"
            icon={<ApartmentOutlined />}
            onClick={() => handleOpenRegisterHod()}
          >
            Register Head of Department
          </Button>
          <Button
            icon={<UserOutlined />}
            onClick={() => {
              lecturerForm.resetFields();
              lecturerForm.setFieldsValue({ password: 'Lecturer@2016!' });
              setRegisterLecturerOpen(true);
            }}
          >
            Register Lecturer
          </Button>
          <Button
            icon={<UserOutlined />}
            onClick={() => handleOpenAssign()}
          >
            Assign Lecturer to Course
          </Button>
          <Button
            icon={<TeamOutlined />}
            onClick={() => handleOpenEnroll()}
          >
            Enroll Students to Course
          </Button>
          <Button
            icon={<CheckCircleOutlined />}
            onClick={() => navigate('/grades')}
          >
            Grade Center
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total System Users"
              value={Array.isArray(users) ? users.length : 0}
              prefix={<UserOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Departments"
              value={departments?.length ?? 0}
              prefix={<ApartmentOutlined style={{ color: '#722ed1' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Courses"
              value={courses?.length ?? 0}
              prefix={<BookOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Audit Log Entries"
              value={auditTotal ?? 0}
              prefix={<AuditOutlined style={{ color: '#fa8c16' }} />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="Quick Actions"
        style={{ marginBottom: 20 }}
      >
        <Button
          type="primary"
          size="large"
          icon={<ApartmentOutlined />}
          onClick={() => handleOpenRegisterHod()}
        >
          Register Head of Department
        </Button>
        <Button
          size="large"
          icon={<UserOutlined />}
          onClick={() => {
            lecturerForm.resetFields();
            lecturerForm.setFieldsValue({ password: 'Lecturer@2016!' });
            setRegisterLecturerOpen(true);
          }}
          style={{ marginLeft: 12 }}
        >
          Register Lecturer
        </Button>
      </Card>

      {/* Academic Departments & Heads Management */}
      <Card
        title={
          <Space>
            <ApartmentOutlined style={{ color: '#1677ff' }} />
            <span>Academic Departments & Department Heads</span>
            <Tag color="blue">{departments?.length ?? 0} Departments</Tag>
          </Space>
        }
        extra={
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => handleOpenRegisterHod()}
          >
            Register New HOD
          </Button>
        }
        style={{ marginBottom: 20 }}
      >
        <Table
          dataSource={departments ?? []}
          rowKey="id"
          loading={deptsLoading}
          pagination={false}
          columns={[
            {
              title: 'Department Name',
              dataIndex: 'name',
              key: 'name',
              render: (n: string) => <Typography.Text strong>{n}</Typography.Text>,
            },
            {
              title: 'Head of Department',
              key: 'head',
              render: (_: any, record: any) => {
                if (record.head?.username) {
                  return (
                    <Tag color="green" icon={<UserOutlined />}>
                      Prof. {record.head.username} {record.head.email ? `(${record.head.email})` : ''}
                    </Tag>
                  );
                }
                return <Tag color="warning">No Head Appointed</Tag>;
              },
            },
            {
              title: 'Programmes',
              key: 'programmes',
              render: (_: any, record: any) => (
                <span>{record.programmes?.length ?? 0} Academic Programme(s)</span>
              ),
            },
            {
              title: 'Action',
              key: 'action',
              render: (_: any, record: any) => (
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<UserOutlined />}
                  onClick={() => handleOpenRegisterHod(record.id)}
                >
                  {record.head ? 'Reassign Head' : 'Appoint Head'}
                </Button>
              ),
            },
          ]}
        />
      </Card>

      {/* Courses & Assignments Management */}
      <Card
        title={
          <Space>
            <BookOutlined style={{ color: '#1677ff' }} />
            <span>Institution Course Roster & Teacher Assignments</span>
          </Space>
        }
        extra={
          <Space>
            <Button
              size="small"
              type="primary"
              ghost
              icon={<UserOutlined />}
              onClick={() => handleOpenAssign()}
            >
              Assign Teacher
            </Button>
            <Button
              size="small"
              icon={<TeamOutlined />}
              onClick={() => handleOpenEnroll()}
            >
              Enroll Students
            </Button>
            <Button size="small" onClick={() => navigate('/timetable')}>
              View Timetable
            </Button>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <span>
              Use this panel to oversee courses and assignments. Department Heads can also register courses, assign teachers, and enroll students directly from their <strong>Department Head Dashboard</strong>.
            </span>
          }
        />
        <Table
          dataSource={courses ?? []}
          columns={courseColumns}
          rowKey="id"
          loading={coursesLoading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Register Lecturer Modal */}
      <Modal
        title={
          <Space>
            <UserOutlined style={{ color: '#1677ff' }} />
            <span>Register Lecturer</span>
          </Space>
        }
        open={registerLecturerOpen}
        destroyOnClose
        onCancel={() => {
          setRegisterLecturerOpen(false);
          lecturerForm.resetFields();
        }}
        onOk={() => lecturerForm.submit()}
        confirmLoading={registerLecturerMutation.isPending}
        okText="Register Lecturer"
      >
        <Alert
          type="info"
          showIcon
          message="Create a lecturer account. The lecturer can then be assigned to courses from this dashboard."
          style={{ marginBottom: 16 }}
        />
        <Form
          form={lecturerForm}
          layout="vertical"
          onFinish={(vals) => registerLecturerMutation.mutate(vals)}
        >
          <Form.Item
            name="username"
            label="Username"
            rules={[{ required: true, message: 'Please enter a username' }]}
          >
            <Input placeholder="e.g. lecturer.john" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Official Email"
            rules={[{ required: true, type: 'email', message: 'Valid email required' }]}
          >
            <Input placeholder="e.g. john.lecturer@sims.edu" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Initial Password"
            extra="Must be at least 8 characters with uppercase, lowercase, digit, and symbol."
            rules={[{ required: true, message: 'Password is required' }]}
          >
            <Input.Password placeholder="Lecturer@2016!" />
          </Form.Item>
          <Form.Item name="phone" label="Phone Number (Optional)">
            <Input placeholder="+251 91 123 4567" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Lecturer Credentials Success Modal */}
      <Modal
        title={
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <span>Lecturer Account Created</span>
          </Space>
        }
        open={lecturerCredentialsOpen}
        onOk={() => setLecturerCredentialsOpen(false)}
        onCancel={() => setLecturerCredentialsOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setLecturerCredentialsOpen(false)}>
            Done
          </Button>,
        ]}
      >
        <Alert
          type="success"
          message="Lecturer successfully registered!"
          description="The lecturer can now log in and can be assigned to courses from the dashboard."
          showIcon
          style={{ marginBottom: 16 }}
        />
        <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <p style={{ margin: '6px 0' }}><strong>Username:</strong> <code>{createdLecturerInfo?.username}</code></p>
          <p style={{ margin: '6px 0' }}><strong>Role:</strong> <Tag color="purple">lecturer</Tag></p>
          <p style={{ margin: '6px 0' }}><strong>Email:</strong> {createdLecturerInfo?.email}</p>
        </div>
      </Modal>

      {/* Register Head of Department Modal */}
      <Modal
        title={
          <Space>
            <ApartmentOutlined style={{ color: '#1677ff' }} />
            <span>Register Head of Department</span>
          </Space>
        }
        open={registerHodOpen}
        destroyOnClose
        onCancel={() => {
          setRegisterHodOpen(false);
          hodForm.resetFields();
        }}
        onOk={() => hodForm.submit()}
        confirmLoading={registerHodMutation.isPending}
        okText="Register & Appoint"
      >
        <Alert
          type="info"
          showIcon
          message="This creates a Department Head account and immediately links them as the official head of the chosen department."
          style={{ marginBottom: 16 }}
        />
        <Form
          form={hodForm}
          layout="vertical"
          onFinish={(vals) => registerHodMutation.mutate(vals)}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="username"
                label="Username"
                rules={[{ required: true, message: 'Please enter a username' }]}
              >
                <Input placeholder="e.g. hod_computing" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="email"
                label="Official Email"
                rules={[{ required: true, type: 'email', message: 'Valid email required' }]}
              >
                <Input placeholder="e.g. hod.computing@sims.edu" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="password"
            label="Initial Password"
            extra="Pre-filled with secure default. Must be ≥8 chars with uppercase, lowercase, digit, and symbol."
            rules={[{ required: true, message: 'Password is required' }]}
          >
            <Input.Password placeholder="DeptHead@2016!" />
          </Form.Item>

          <Form.Item label="Department Assignment">
            <Radio.Group
              value={deptMode}
              onChange={(e) => setDeptMode(e.target.value)}
              style={{ marginBottom: 12, width: '100%' }}
            >
              <Radio.Button value="existing" style={{ width: '50%', textAlign: 'center' }}>
                Existing Department
              </Radio.Button>
              <Radio.Button value="new" style={{ width: '50%', textAlign: 'center' }}>
                Create New Department
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          {deptMode === 'existing' ? (
            <Form.Item
              name="department_id"
              label="Select Existing Department"
              rules={[{ required: deptMode === 'existing', message: 'Select a department' }]}
            >
              <Select
                showSearch
                placeholder="Select existing department..."
                optionFilterProp="label"
                options={(departments ?? []).map((d: any) => ({
                  value: d.id,
                  label: `${d.name} ${d.head?.username ? `(Current Head: ${d.head.username})` : '(No Head Appointed)'}`,
                }))}
              />
            </Form.Item>
          ) : (
            <Form.Item
              name="department_name"
              label="New Department Name"
              rules={[{ required: deptMode === 'new', message: 'Enter new department name' }]}
            >
              <Input placeholder="e.g. Mechanical Engineering or Applied Sciences" />
            </Form.Item>
          )}

          <Form.Item name="phone" label="Phone Number (Optional)">
            <Input placeholder="+251 91 123 4567" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Credentials Success Modal */}
      <Modal
        title={
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <span>Head of Department Account Created</span>
          </Space>
        }
        open={credentialsOpen}
        onOk={() => setCredentialsOpen(false)}
        onCancel={() => setCredentialsOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setCredentialsOpen(false)}>
            Done
          </Button>,
        ]}
      >
        <Alert
          type="success"
          message="Department Head successfully created and appointed!"
          description="You can now log in with these credentials to manage curriculum, assign teachers, enroll students, and moderate grades."
          showIcon
          style={{ marginBottom: 16 }}
        />
        <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <p style={{ margin: '6px 0' }}><strong>Username:</strong> <code>{createdHodInfo?.credentials?.username || createdHodInfo?.user?.username}</code></p>
          <p style={{ margin: '6px 0' }}><strong>Role:</strong> <Tag color="blue">department_head</Tag></p>
          <p style={{ margin: '6px 0' }}><strong>Assigned Department:</strong> <strong>{createdHodInfo?.department?.name}</strong></p>
          <p style={{ margin: '6px 0' }}><strong>Email:</strong> {createdHodInfo?.credentials?.email || createdHodInfo?.user?.email}</p>
        </div>
      </Modal>

      {/* Assign Lecturer Modal */}
      <Modal
        title={
          <Space>
            <UserOutlined style={{ color: '#1677ff' }} />
            <span>Assign Lecturer to Course</span>
          </Space>
        }
        open={assignModalOpen}
        destroyOnClose
        onCancel={() => {
          setAssignModalOpen(false);
          assignForm.resetFields();
        }}
        onOk={() => assignForm.submit()}
        confirmLoading={assignMutation.isPending}
        okText="Assign Lecturer"
      >
        <Form
          form={assignForm}
          layout="vertical"
          onFinish={(vals) => assignMutation.mutate(vals)}
        >
          <Form.Item
            name="course_id"
            label="Course"
            rules={[{ required: true, message: 'Please select a course' }]}
          >
            <Select
              showSearch
              placeholder="Select course..."
              optionFilterProp="label"
              options={(courses ?? []).map((c: any) => ({
                value: c.id,
                label: `${c.code} — ${c.name} (${c.department?.name || 'General'})`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="academic_period_id"
            label="Academic Period"
            rules={[{ required: true, message: 'Please select an academic period' }]}
          >
            <Select
              placeholder="Select period..."
              options={(periods ?? []).map((p: any) => ({
                value: p.id,
                label: p.name,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="lecturer_id"
            label="Teacher / Lecturer"
            rules={[{ required: true, message: 'Please select a lecturer' }]}
          >
            <Select
              showSearch
              placeholder="Select lecturer..."
              optionFilterProp="label"
              options={(lecturers ?? []).map((l: any) => ({
                value: l.id,
                label: `${l.username} ${l.department_name ? `(${l.department_name})` : ''}`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Enroll Students Modal */}
      <Modal
        title={
          <Space>
            <TeamOutlined style={{ color: '#1677ff' }} />
            <span>Enroll Students to Course</span>
          </Space>
        }
        open={enrollModalOpen}
        destroyOnClose
        onCancel={() => {
          setEnrollModalOpen(false);
          enrollForm.resetFields();
        }}
        onOk={() => enrollForm.submit()}
        confirmLoading={enrollMutation.isPending}
        okText="Enroll Students"
        width={560}
      >
        <Form
          form={enrollForm}
          layout="vertical"
          onFinish={(vals) => enrollMutation.mutate(vals)}
        >
          <Form.Item
            name="course_id"
            label="Course"
            rules={[{ required: true, message: 'Please select a course' }]}
          >
            <Select
              showSearch
              placeholder="Select course..."
              optionFilterProp="label"
              options={(courses ?? []).map((c: any) => ({
                value: c.id,
                label: `${c.code} — ${c.name}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="academic_period_id"
            label="Academic Period"
            rules={[{ required: true, message: 'Please select an academic period' }]}
          >
            <Select
              placeholder="Select period..."
              options={(periods ?? []).map((p: any) => ({
                value: p.id,
                label: p.name,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="student_ids"
            label="Students"
            rules={[{ required: true, message: 'Please select at least one student' }]}
            extra={
              <Button
                type="link"
                size="small"
                style={{ padding: 0, marginTop: 4 }}
                onClick={() => {
                  const allIds = (students ?? []).map((s: any) => s.id);
                  enrollForm.setFieldValue('student_ids', allIds);
                }}
              >
                Select All {(students ?? []).length} Students
              </Button>
            }
          >
            <Select
              mode="multiple"
              showSearch
              placeholder="Select students to enroll..."
              optionFilterProp="label"
              options={(students ?? []).map((s: any) => ({
                value: s.id,
                label: `${s.student_number || 'STU'} — ${s.user?.username || s.full_name || 'Student'} (${s.programme?.name || 'Programme'})`,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

import React, { useState } from 'react';
import {
  Row, Col, Card, Statistic, Typography, Table, Tag, Button,
  Space, Tabs, Modal, Form, Input, Select, Radio, message, Alert
} from 'antd';
import {
  TeamOutlined, BookOutlined, CalendarOutlined, PlusOutlined, GlobalOutlined,
  ClockCircleOutlined, EnvironmentOutlined, UserOutlined,
  ApartmentOutlined, SendOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import type { TimetableEntry } from '../../types';
import type { ColumnsType } from 'antd/es/table';

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function DeptHeadDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('courses');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [lecturerSource, setLecturerSource] = useState<'dept' | 'other' | 'all'>('dept');
  const [form] = Form.useForm();
  const [registerForm] = Form.useForm();
  const [assignForm] = Form.useForm();
  const [enrollForm] = Form.useForm();

  // Queries
  const { data: department } = useQuery({
    queryKey: ['my-department'],
    queryFn: () =>
      api.get('/timetable/my-department').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: courses, isLoading: coursesLoading } = useQuery({
    queryKey: ['my-department-courses'],
    queryFn: () =>
      api.get('/timetable/courses').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
  });

  const { data: timetableEntries, isLoading: timetableLoading } = useQuery({
    queryKey: ['my-department-timetable'],
    queryFn: () =>
      api.get('/timetable').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
  });

  const { data: students } = useQuery({
    queryKey: ['dept-students'],
    queryFn: () =>
      api.get('/students').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
  });

  const { data: lecturers, isLoading: lecturersLoading } = useQuery({
    queryKey: ['available-lecturers'],
    queryFn: () =>
      api.get('/timetable/lecturers').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
  });

  const { data: periods } = useQuery({
    queryKey: ['available-periods'],
    queryFn: () =>
      api.get('/timetable/periods').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
  });

  const { data: enrollments } = useQuery({
    queryKey: ['dept-enrollments'],
    queryFn: () =>
      api.get('/enrollments').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
  });

  const { data: pendingGrades } = useQuery({
    queryKey: ['pending-grade-submissions-dept'],
    queryFn: () =>
      api.get('/grades/pending-approval').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
  });

  const deptName = department?.name || 'Department Academic Office';
  const deptLecturers = (lecturers ?? []).filter((l: any) => l.is_department_lecturer);
  const otherLecturers = (lecturers ?? []).filter((l: any) => !l.is_department_lecturer);
  const draftEntries = (timetableEntries ?? []).filter((t: any) => !t.is_published && t.status !== 'published' && t.status !== 'pending_approval');

  // Mutation: Create Timetable Entry
  const createMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post('/timetable', values).then((r: any) => r.data),
    onSuccess: () => {
      void message.success('Timetable schedule entry created successfully as Draft');
      setCreateModalOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['my-department-timetable'] });
      void qc.invalidateQueries({ queryKey: ['timetable'] });
      setActiveTab('timetable');
    },
    onError: (e: any) => {
      const data = e?.response?.data;
      if (data?.message) {
        void message.error(`Conflict: ${data.message}`);
      } else {
        void message.error('Failed to create schedule entry. Please check required fields.');
      }
    },
  });

  const registerCourseMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post('/timetable/courses/register', values).then((r: any) => r.data),
    onSuccess: () => {
      void message.success('Course registered and teacher assigned successfully.');
      setRegisterModalOpen(false);
      registerForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['my-department-courses'] });
      void qc.invalidateQueries({ queryKey: ['available-lecturers'] });
    },
    onError: (e: any) => {
      void message.error(e?.response?.data?.message || 'Failed to register course.');
    },
  });

  // Mutation: Submit Draft Timetable for Central Admin review
  const submitMutation = useMutation({
    mutationFn: (periodId: string) =>
      api.post(`/timetable/submit/${periodId}`).then((r: any) => r.data),
    onSuccess: () => {
      void message.success('Department draft timetable submitted to Central Admin for review');
      void qc.invalidateQueries({ queryKey: ['my-department-timetable'] });
      void qc.invalidateQueries({ queryKey: ['timetable'] });
    },
    onError: () => void message.error('Failed to submit timetable for review'),
  });

  // Mutation: Assign Lecturer to Course
  const assignMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post('/timetable/courses/assign', values).then((r: any) => r.data),
    onSuccess: () => {
      void message.success('Teacher assigned to course successfully');
      setAssignModalOpen(false);
      assignForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['my-department-courses'] });
      void qc.invalidateQueries({ queryKey: ['available-lecturers'] });
    },
    onError: (e: any) => {
      void message.error(e?.response?.data?.message || 'Failed to assign teacher to course');
    },
  });

  // Mutation: Enroll Students to Course
  const enrollMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post('/enrollments/students', values).then((r: any) => r.data),
    onSuccess: (data: any) => {
      void message.success(data?.message || 'Students enrolled successfully');
      setEnrollModalOpen(false);
      enrollForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['dept-enrollments'] });
      void qc.invalidateQueries({ queryKey: ['my-department-courses'] });
    },
    onError: (e: any) => {
      void message.error(e?.response?.data?.message || 'Failed to enroll students');
    },
  });

  const handleOpenCreateModal = (courseId?: string) => {
    form.resetFields();
    setLecturerSource('dept');
    const defaultPeriodId = periods?.[0]?.id;
    form.setFieldsValue({
      course_id: courseId,
      academic_period_id: defaultPeriodId,
      entry_type: 'class',
      day_of_week: 1,
    });
    setCreateModalOpen(true);
  };

  const handleOpenAssignModal = (courseId?: string) => {
    assignForm.resetFields();
    assignForm.setFieldsValue({
      course_id: courseId,
      academic_period_id: periods?.[0]?.id,
    });
    setAssignModalOpen(true);
  };

  const handleOpenEnrollModal = (courseId?: string) => {
    enrollForm.resetFields();
    enrollForm.setFieldsValue({
      course_id: courseId,
      academic_period_id: periods?.[0]?.id,
    });
    setEnrollModalOpen(true);
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
      render: (n: string) => <Typography.Text strong>{n}</Typography.Text>,
    },
    {
      title: 'Credit Hours',
      dataIndex: 'credit_hours',
      key: 'credit_hours',
      width: 100,
      align: 'center',
      render: (cr: number) => <Tag color="blue">{cr ?? 3} Cr</Tag>,
    },
    {
      title: 'Assigned Teacher',
      key: 'assigned_lecturers',
      width: 220,
      render: (_: unknown, record: any) => {
        const assigned = record.assigned_lecturers || [];
        if (!assigned.length) {
          return <Tag color="default">Unassigned</Tag>;
        }
        return (
          <Space direction="vertical" size={2}>
            {assigned.map((a: any, i: number) => (
              <Tag key={i} color="purple" icon={<UserOutlined />}>
                {a.lecturer_name} ({a.academic_period_name || 'Period'})
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: 'Enrolled Students',
      key: 'enrolled',
      width: 140,
      align: 'center',
      render: (_: unknown, record: any) => {
        const count = (enrollments ?? []).filter((e: any) => e.course_id === record.id).length;
        return <Tag color={count > 0 ? 'green' : 'default'}>{count} enrolled</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'action',
      width: 320,
      align: 'center',
      render: (_: unknown, record: any) => (
        <Space size="small">
          <Button
            size="small"
            type="primary"
            ghost
            icon={<UserOutlined />}
            onClick={() => handleOpenAssignModal(record.id)}
          >
            Assign Teacher
          </Button>
          <Button
            size="small"
            icon={<TeamOutlined />}
            onClick={() => handleOpenEnrollModal(record.id)}
          >
            Enroll Students
          </Button>
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => handleOpenCreateModal(record.id)}
          >
            Schedule
          </Button>
        </Space>
      ),
    },
  ];

  const timetableColumns: ColumnsType<TimetableEntry> = [
    {
      title: 'Day',
      dataIndex: 'day_of_week',
      key: 'day',
      width: 120,
      render: (d: number) => <Tag color="processing">{DAY_NAMES[d] || '—'}</Tag>,
    },
    {
      title: 'Time',
      key: 'time',
      width: 140,
      render: (_: unknown, r: TimetableEntry) => (
        <Typography.Text strong>
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          {r.start_time} – {r.end_time}
        </Typography.Text>
      ),
    },
    {
      title: 'Course',
      key: 'course',
      render: (_: unknown, r: TimetableEntry) => (
        <div>
          <Typography.Text strong>{r.course?.name || 'Session'}</Typography.Text>
          <div style={{ fontSize: 12, color: '#1677ff', fontFamily: 'monospace' }}>{r.course?.code}</div>
        </div>
      ),
    },
    {
      title: 'Assigned Lecturer',
      key: 'lecturer',
      render: (_: unknown, r: TimetableEntry) => (
        <Typography.Text>
          <UserOutlined style={{ marginRight: 4 }} />
          {r.lecturer?.username ? `Prof. ${r.lecturer.username}` : '—'}
        </Typography.Text>
      ),
    },
    {
      title: 'Room',
      dataIndex: 'room',
      key: 'room',
      width: 130,
      render: (rm: string) => (
        <Typography.Text>
          <EnvironmentOutlined style={{ marginRight: 4 }} />
          {rm}
        </Typography.Text>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'entry_type',
      key: 'type',
      width: 110,
      render: (t: string) => (
        <Tag color={t === 'exam' ? 'red' : t === 'lab' ? 'warning' : 'blue'}>
          {t?.toUpperCase() || 'CLASS'}
        </Tag>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 160,
      render: (_: unknown, r: TimetableEntry) => {
        if (r.is_published || r.status === 'published') {
          return <Tag color="success">Published institution-wide</Tag>;
        }
        if (r.status === 'pending_approval') {
          return <Tag color="orange">Pending Admin Approval</Tag>;
        }
        return <Tag color="default">Draft (Department)</Tag>;
      },
    },
  ];

  return (
    <div>
      {/* Department Banner */}
      <Card
        style={{
          marginBottom: 16,
          borderLeft: '5px solid #1677ff',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ApartmentOutlined style={{ fontSize: 26, color: '#1677ff' }} />
              <Typography.Title level={4} style={{ margin: 0 }}>
                {deptName}
              </Typography.Title>
            </div>
            <Typography.Text type="secondary">
              Department Head: <strong>{user?.username}</strong> &bull; Department-Scoped Curriculum & Timetable Scheduling
            </Typography.Text>
          </div>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleOpenCreateModal()}
            >
              Add Schedule Entry
            </Button>
            <Button onClick={() => navigate('/students')}>
              View Enrolled Students
            </Button>
          </Space>
        </div>
      </Card>

      {/* Metrics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Department Courses"
              value={courses?.length ?? 0}
              prefix={<BookOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Department Timetable Sessions"
              value={timetableEntries?.length ?? 0}
              prefix={<CalendarOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Students Enrolled"
              value={students?.length ?? enrollments?.length ?? 0}
              prefix={<TeamOutlined style={{ color: '#fa8c16' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
              Active Academic Period
            </Typography.Text>
            <Tag color="blue" style={{ fontSize: 13, padding: '3px 10px', fontWeight: 600 }}>
              {periods?.[0]?.name || '2026/2027 - Sem 1'}
            </Tag>
          </Card>
        </Col>
      </Row>

      {/* Pending Grade Moderation Alert */}
      {pendingGrades && pendingGrades.length > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<ClockCircleOutlined />}
          style={{ marginTop: 16 }}
          message={`${pendingGrades.length} Course Grade Sheet(s) Submitted for Moderation`}
          description="Lecturers have entered assessment marks and submitted them for Department Head verification. Please review and approve or request revisions."
          action={
            <Button
              type="primary"
              size="small"
              onClick={() => setActiveTab('grades')}
            >
              Review Grades
            </Button>
          }
        />
      )}

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'courses',
            label: `Curriculum & Courses (${courses?.length ?? 0})`,
            children: (
              <Card
                title={
                  <Space>
                    <BookOutlined style={{ color: '#1677ff' }} />
                    <span>Department Courses for {deptName}</span>
                  </Space>
                }
                extra={
                  <Space wrap>
                    <Button
                      size="small"
                      icon={<UserOutlined />}
                      onClick={() => handleOpenAssignModal()}
                    >
                      Assign Teacher to Course
                    </Button>
                    <Button
                      size="small"
                      icon={<TeamOutlined />}
                      onClick={() => handleOpenEnrollModal()}
                    >
                      Enroll Students
                    </Button>
                    <Button
                      type="primary"
                      size="small"
                      icon={<BookOutlined />}
                      onClick={() => {
                        registerForm.resetFields();
                        registerForm.setFieldValue('academic_period_id', periods?.[0]?.id);
                        setRegisterModalOpen(true);
                      }}
                    >
                      Register Course & Teacher
                    </Button>
                    <Button
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => handleOpenCreateModal()}
                    >
                      Add Schedule Entry
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
                      Only courses assigned directly to <strong>{deptName}</strong> are visible to this department office. Click <strong>Schedule Session</strong> on any course to create timetable entries.
                    </span>
                  }
                />
                <Table
                  dataSource={courses ?? []}
                  columns={courseColumns}
                  rowKey="id"
                  loading={coursesLoading}
                  pagination={{ pageSize: 10 }}
                  locale={{
                    emptyText: 'No courses registered yet for this department. Click "Register Course & Teacher" above to get started.',
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'timetable',
            label: `Department Class Timetable (${timetableEntries?.length ?? 0})`,
            children: (
              <Card
                title={
                  <Space>
                    <CalendarOutlined style={{ color: '#1677ff' }} />
                    <span>Scheduled Sessions for {deptName}</span>
                    <Tag color="blue">{timetableEntries?.length ?? 0} Entries</Tag>
                  </Space>
                }
                extra={
                  <Space>
                    {draftEntries.length > 0 && periods?.[0]?.id && (
                      <Button
                        type="primary"
                        ghost
                        icon={<SendOutlined />}
                        onClick={() =>
                          Modal.confirm({
                            title: 'Submit Department Draft Timetable?',
                            content: `This will submit ${draftEntries.length} draft schedule entries to Central Administration for institutional review and publication.`,
                            onOk: () => submitMutation.mutate(periods[0].id),
                          })
                        }
                      >
                        Submit {draftEntries.length} Drafts for Review
                      </Button>
                    )}
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => handleOpenCreateModal()}
                    >
                      Add Schedule Entry
                    </Button>
                    <Button onClick={() => navigate('/timetable')}>
                      Full Timetable View
                    </Button>
                  </Space>
                }
              >
                <Table
                  dataSource={timetableEntries ?? []}
                  columns={timetableColumns}
                  rowKey="id"
                  loading={timetableLoading}
                  pagination={{ pageSize: 10 }}
                  locale={{
                    emptyText: 'No timetable sessions scheduled yet for this department. Click "Add Schedule Entry" above.',
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'faculty',
            label: `Faculty & Lecturers (${lecturers?.length ?? 0})`,
            children: (
              <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                  <Card
                    title={
                      <Space>
                        <TeamOutlined style={{ color: '#1677ff' }} />
                        <span>Option 1: Department Lecturers</span>
                        <Tag color="blue">
                          {deptLecturers.length} Internal
                        </Tag>
                      </Space>
                    }
                  >
                    <Table
                      dataSource={deptLecturers}
                      rowKey="id"
                      loading={lecturersLoading}
                      pagination={{ pageSize: 5 }}
                      columns={[
                        {
                          title: 'Instructor',
                          dataIndex: 'username',
                          key: 'username',
                          render: (u: string) => <Typography.Text strong>{u}</Typography.Text>,
                        },
                        {
                          title: 'Affiliation',
                          dataIndex: 'department_name',
                          key: 'dept',
                          render: (d: string) => <Tag color="blue">{d || deptName}</Tag>,
                        },
                        {
                          title: 'Contact',
                          dataIndex: 'email',
                          key: 'email',
                          render: (em: string) => <Typography.Text type="secondary">{em || '—'}</Typography.Text>,
                        },
                      ]}
                    />
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card
                    title={
                      <Space>
                        <GlobalOutlined style={{ color: '#722ed1' }} />
                        <span>Option 2: Other Department Lecturers</span>
                        <Tag color="purple">
                          {otherLecturers.length} Cross-Faculty
                        </Tag>
                      </Space>
                    }
                  >
                    <Table
                      dataSource={otherLecturers}
                      rowKey="id"
                      loading={lecturersLoading}
                      pagination={{ pageSize: 5 }}
                      columns={[
                        {
                          title: 'Instructor',
                          dataIndex: 'username',
                          key: 'username',
                          render: (u: string) => <Typography.Text strong>{u}</Typography.Text>,
                        },
                        {
                          title: 'Home Department',
                          dataIndex: 'department_name',
                          key: 'dept',
                          render: (d: string) => <Tag color="purple">{d || 'External Faculty'}</Tag>,
                        },
                        {
                          title: 'Contact',
                          dataIndex: 'email',
                          key: 'email',
                          render: (em: string) => <Typography.Text type="secondary">{em || '—'}</Typography.Text>,
                        },
                      ]}
                    />
                  </Card>
                </Col>
              </Row>
            ),
          },
          {
            key: 'grades',
            label: (
              <span>
                Grade Moderation & Approvals{' '}
                <Tag color={pendingGrades?.length ? 'gold' : 'default'} style={{ marginLeft: 4 }}>
                  {pendingGrades?.length ?? 0}
                </Tag>
              </span>
            ),
            children: (
              <Card
                title={
                  <Space>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <span>Grade Submissions Awaiting Department Verification</span>
                  </Space>
                }
                extra={
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => navigate('/grades')}
                  >
                    Open Grade Center
                  </Button>
                }
              >
                <Table
                  dataSource={pendingGrades ?? []}
                  rowKey={(r: any) => `${r.courseId}:${r.academicPeriodId}`}
                  pagination={false}
                  columns={[
                    {
                      title: 'Course',
                      key: 'course',
                      render: (_: any, r: any) => (
                        <div>
                          <Typography.Text strong>
                            {r.courseCode} — {r.courseName}
                          </Typography.Text>
                          <div>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {r.creditHours} Credit Hours • {r.departmentName || deptName}
                            </Typography.Text>
                          </div>
                        </div>
                      ),
                    },
                    {
                      title: 'Academic Period',
                      dataIndex: 'academicPeriodName',
                      key: 'period',
                    },
                    {
                      title: 'Assigned Lecturer',
                      dataIndex: 'lecturerName',
                      key: 'lecturer',
                      render: (l: string) => <Tag icon={<UserOutlined />}>{l}</Tag>,
                    },
                    {
                      title: 'Enrolled Students',
                      dataIndex: 'enrolledCount',
                      key: 'enrolled',
                      align: 'center',
                    },
                    {
                      title: 'Submitted On',
                      dataIndex: 'submittedAt',
                      key: 'submittedAt',
                      render: (d: string) => (d ? new Date(d).toLocaleDateString() : 'Recent'),
                    },
                    {
                      title: 'Status',
                      key: 'status',
                      render: () => <Tag color="gold">Awaiting HOD Moderation</Tag>,
                    },
                    {
                      title: 'Actions',
                      key: 'actions',
                      render: (_: any, r: any) => (
                        <Button
                          size="small"
                          type="primary"
                          icon={<CheckCircleOutlined />}
                          onClick={() =>
                            navigate(
                              `/grades?courseId=${r.courseId}&periodId=${r.academicPeriodId}`,
                            )
                          }
                        >
                          Review & Moderate
                        </Button>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* Add Schedule Entry Modal */}
      <Modal
        title={
          <Space>
            <BookOutlined style={{ color: '#1677ff' }} />
            <span>Register Course and Assign Teacher — {deptName}</span>
          </Space>
        }
        open={registerModalOpen}
        onCancel={() => {
          setRegisterModalOpen(false);
          registerForm.resetFields();
        }}
        onOk={() => registerForm.submit()}
        confirmLoading={registerCourseMutation.isPending}
        okText="Register Course"
      >
        <Alert
          type="info"
          showIcon
          message="The course will be registered under your department and assigned to the selected teacher for the selected academic period."
          style={{ marginBottom: 16 }}
        />
        <Form
          form={registerForm}
          layout="vertical"
          onFinish={(values: Record<string, unknown>) => registerCourseMutation.mutate(values)}
        >
          <Row gutter={16}>
            <Col span={10}>
              <Form.Item name="code" label="Course Code" rules={[{ required: true, whitespace: true }]}>
                <Input placeholder="e.g. ICT 201" />
              </Form.Item>
            </Col>
            <Col span={14}>
              <Form.Item name="name" label="Course Name" rules={[{ required: true, whitespace: true }]}>
                <Input placeholder="e.g. Database Systems" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="credit_hours" label="Credit Hours" initialValue={3} rules={[{ required: true }]}>
                <Input type="number" min={1} max={20} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="max_enrollment" label="Maximum Enrollment" initialValue={50} rules={[{ required: true }]}>
                <Input type="number" min={1} max={1000} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="lecturer_id" label="Teacher / Lecturer" rules={[{ required: true, message: 'Select a teacher' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select an active lecturer"
              options={(lecturers ?? []).map((l: any) => ({
                value: l.id,
                label: `${l.username}${l.department_name ? ` — ${l.department_name}` : ''}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="academic_period_id" label="Academic Period" rules={[{ required: true }]}>
            <Select
              placeholder="Select academic period"
              options={(periods ?? []).map((p: any) => ({ value: p.id, label: `${p.name}${p.is_locked ? ' (Locked)' : ''}` }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add Schedule Entry Modal */}
      <Modal
        title={
          <Space>
            <CalendarOutlined style={{ color: '#1677ff' }} />
            <span>Add Schedule Entry — {deptName}</span>
          </Space>
        }
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        width={580}
        okText="Create Entry"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(vals: Record<string, unknown>) => createMutation.mutate(vals)}
        >
          {/* Scoped Department Course Selection */}
          <Form.Item
            name="course_id"
            label="Course (Department Scoped)"
            rules={[{ required: true, message: 'Please select a course' }]}
            extra="Only courses belonging to your department are listed."
          >
            <Select
              showSearch
              placeholder="Search or select department course..."
              optionFilterProp="label"
              options={(courses ?? []).map((c: any) => ({
                value: c.id,
                label: `${c.code} — ${c.name} (${c.credit_hours} Cr)`,
              }))}
            />
          </Form.Item>

          {/* Faculty Options Selector: Option 1 vs Option 2 */}
          <div style={{ marginBottom: 14, background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Typography.Text strong style={{ fontSize: 13, color: '#1e293b' }}>
                Faculty Source:
              </Typography.Text>
              <Tag color={lecturerSource === 'dept' ? 'blue' : lecturerSource === 'other' ? 'purple' : 'default'}>
                {lecturerSource === 'dept' ? 'Option 1: Department Faculty' : lecturerSource === 'other' ? 'Option 2: Cross-Faculty / External' : 'All Faculty'}
              </Tag>
            </div>
            <Radio.Group
              value={lecturerSource}
              onChange={(e) => {
                setLecturerSource(e.target.value);
                form.setFieldValue('lecturer_id', undefined);
              }}
              buttonStyle="solid"
              style={{ width: '100%', display: 'flex' }}
            >
              <Radio.Button value="dept" style={{ flex: 1, textAlign: 'center' }}>
                <TeamOutlined style={{ marginRight: 5 }} />
                1. Department ({deptLecturers.length})
              </Radio.Button>
              <Radio.Button value="other" style={{ flex: 1, textAlign: 'center' }}>
                <GlobalOutlined style={{ marginRight: 5 }} />
                2. Other Dept ({otherLecturers.length})
              </Radio.Button>
              <Radio.Button value="all" style={{ flex: 0.8, textAlign: 'center' }}>
                All ({lecturers?.length ?? 0})
              </Radio.Button>
            </Radio.Group>
            <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
              {lecturerSource === 'dept'
                ? `Instructors appointed directly to ${deptName}.`
                : 'Cross-department faculty (Basic Sciences, General Studies, or other technical departments).'}
            </div>
          </div>

          {/* Assigned Lecturer */}
          <Form.Item
            name="lecturer_id"
            label="Assigned Lecturer / Instructor"
            rules={[{ required: true, message: 'Please select a lecturer' }]}
          >
            <Select
              showSearch
              placeholder={
                lecturerSource === 'dept'
                  ? 'Select from Department Lecturers...'
                  : lecturerSource === 'other'
                  ? 'Select from Other Department Lecturers...'
                  : 'Search all faculty members...'
              }
              optionFilterProp="label"
              options={(lecturerSource === 'dept'
                ? deptLecturers
                : lecturerSource === 'other'
                ? otherLecturers
                : (lecturers ?? [])
              ).map((l: any) => ({
                value: l.id,
                label: `${l.username} ${l.department_name ? `[${l.department_name}]` : ''} ${l.email ? `(${l.email})` : ''}`,
              }))}
            />
          </Form.Item>

          {/* Academic Period */}
          <Form.Item
            name="academic_period_id"
            label="Academic Period"
            rules={[{ required: true, message: 'Please select an academic period' }]}
          >
            <Select
              placeholder="Select academic period..."
              options={(periods ?? []).map((p: any) => ({
                value: p.id,
                label: p.name,
              }))}
            />
          </Form.Item>

          {/* Room / Hall */}
          <Form.Item
            name="room"
            label="Room / Workshop / Lecture Hall"
            rules={[{ required: true, message: 'Please enter room or workshop' }]}
          >
            <Input placeholder="e.g. Workshop Block A-101 or Computer Lab 2" />
          </Form.Item>

          {/* Day of Week */}
          <Form.Item
            name="day_of_week"
            label="Day of Week"
            rules={[{ required: true, message: 'Please select a day' }]}
          >
            <Select options={DAY_NAMES.slice(1).map((d, i) => ({ value: i + 1, label: d }))} />
          </Form.Item>

          {/* Start and End Time */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="start_time"
                label="Start Time (HH:MM)"
                rules={[{ required: true, pattern: /^\d{2}:\d{2}$/, message: 'Format: HH:MM (e.g. 08:30)' }]}
              >
                <Input placeholder="08:30" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="end_time"
                label="End Time (HH:MM)"
                rules={[{ required: true, pattern: /^\d{2}:\d{2}$/, message: 'Format: HH:MM (e.g. 10:30)' }]}
              >
                <Input placeholder="10:30" />
              </Form.Item>
            </Col>
          </Row>

          {/* Session Type */}
          <Form.Item name="entry_type" label="Session Type" rules={[{ required: true }]} initialValue="class">
            <Select
              options={[
                { value: 'class', label: 'Lecture / Regular Class' },
                { value: 'lab', label: 'Laboratory / Practical Workshop' },
                { value: 'exam', label: 'Official Examination' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Assign Teacher Modal */}
      <Modal
        title={
          <Space>
            <UserOutlined style={{ color: '#1677ff' }} />
            <span>Assign Teacher to Course</span>
          </Space>
        }
        open={assignModalOpen}
        onCancel={() => {
          setAssignModalOpen(false);
          assignForm.resetFields();
        }}
        onOk={() => assignForm.submit()}
        confirmLoading={assignMutation.isPending}
        okText="Assign Teacher"
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
            name="lecturer_id"
            label="Teacher / Lecturer"
            rules={[{ required: true, message: 'Please select a lecturer' }]}
          >
            <Select
              showSearch
              placeholder="Select active lecturer..."
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

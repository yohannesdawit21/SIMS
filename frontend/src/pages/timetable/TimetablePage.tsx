import React, { useState } from 'react';
import {
  Table, Button, Typography, Tag, Space, Modal, Form,
  Input, Select, message, Popconfirm, Row, Col, Radio
} from 'antd';
import { PlusOutlined, CheckCircleOutlined, SendOutlined, TeamOutlined, GlobalOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/axios';
import { RoleGate } from '../../components/RoleGate';
import { useAuth } from '../../context/AuthContext';
import type { TimetableEntry } from '../../types';
import type { ColumnsType } from 'antd/es/table';

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function TimetablePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [lecturerSource, setLecturerSource] = useState<'dept' | 'other' | 'all'>('dept');

  const isHOD = user?.role === 'department_head';
  const isAdminOrSuper = user?.role === 'admin_staff' || user?.role === 'super_admin';

  const { data, isLoading } = useQuery({
    queryKey: ['timetable'],
    queryFn: () =>
      api.get<{ success: boolean; data: TimetableEntry[] }>('/timetable')
        .then((r: any) => (Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [])),
  });

  const { data: courses } = useQuery({
    queryKey: ['available-courses'],
    queryFn: () =>
      api.get('/timetable/courses')
        .then((r: any) => (Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [])),
  });

  const { data: department } = useQuery({
    queryKey: ['my-department'],
    queryFn: () => api.get('/timetable/my-department').then((r: any) => r.data?.data ?? r.data),
  });

  const { data: lecturers } = useQuery({
    queryKey: ['available-lecturers'],
    queryFn: () =>
      api.get('/timetable/lecturers')
        .then((r: any) => (Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [])),
  });

  const { data: periods } = useQuery({
    queryKey: ['available-periods'],
    queryFn: () =>
      api.get('/timetable/periods')
        .then((r: any) => (Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [])),
  });

  const deptLecturers = (lecturers ?? []).filter((l: any) => l.is_department_lecturer);
  const otherLecturers = (lecturers ?? []).filter((l: any) => !l.is_department_lecturer);

  const createMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post('/timetable', values).then((r: any) => r.data),
    onSuccess: () => {
      void message.success('Timetable entry created as Draft');
      setCreateOpen(false);
      form.resetFields();
      void qc.invalidateQueries({ queryKey: ['timetable'] });
    },
    onError: (e: unknown) => {
      const data = (e as { response?: { data?: { message?: string; conflictingEntry?: unknown } } })?.response?.data;
      if (data?.message) {
        void message.error(`Conflict: ${data.message}`);
      } else {
        void message.error('Failed to create entry');
      }
    },
  });

  const submitMutation = useMutation({
    mutationFn: (periodId: string) =>
      api.post(`/timetable/submit/${periodId}`).then((r: any) => r.data),
    onSuccess: () => {
      void message.success('Timetable entries submitted to Central Admin for review');
      void qc.invalidateQueries({ queryKey: ['timetable'] });
    },
    onError: () => void message.error('Failed to submit timetable for review'),
  });

  const publishMutation = useMutation({
    mutationFn: (periodId: string) =>
      api.post(`/timetable/publish/${periodId}`).then((r: any) => r.data),
    onSuccess: () => {
      void message.success('Timetable approved, published, and notifications sent to students & lecturers');
      void qc.invalidateQueries({ queryKey: ['timetable'] });
    },
    onError: () => void message.error('Failed to publish timetable'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/timetable/${id}`).then((r: any) => r.data),
    onSuccess: () => {
      void message.success('Entry deleted');
      void qc.invalidateQueries({ queryKey: ['timetable'] });
    },
  });

  const columns: ColumnsType<TimetableEntry> = [
    {
      title: 'Course',
      key: 'course',
      render: (_: unknown, r: TimetableEntry) => (
        <div>
          <Typography.Text strong>
            {r.course?.name || 'Class Session'}
          </Typography.Text>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{r.course?.code || '—'}</div>
        </div>
      ),
    },
    {
      title: 'Lecturer',
      key: 'lecturer',
      render: (_: unknown, r: TimetableEntry) => (
        <Typography.Text>
          {r.lecturer?.username ? `Prof. ${r.lecturer.username}` : '—'}
        </Typography.Text>
      ),
    },
    {
      title: 'Day',
      dataIndex: 'day_of_week',
      key: 'day',
      render: (d: number) => DAY_NAMES[d] || '—',
    },
    {
      title: 'Time',
      key: 'time',
      render: (_: unknown, r: TimetableEntry) => `${r.start_time} – ${r.end_time}`,
    },
    {
      title: 'Room',
      dataIndex: 'room',
      key: 'room',
    },
    {
      title: 'Period',
      key: 'period',
      render: (_: unknown, r: TimetableEntry) => (
        <Tag color="cyan">{r.academicPeriod?.name || 'Current Period'}</Tag>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'entry_type',
      key: 'type',
      render: (t: string) => (
        <Tag color={t === 'exam' ? 'red' : t === 'lab' ? 'warning' : 'blue'}>
          {t?.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: unknown, r: TimetableEntry) => {
        if (r.is_published || r.status === 'published') {
          return <Tag color="success">Published</Tag>;
        }
        if (r.status === 'pending_approval') {
          return <Tag color="orange">Pending Admin Approval</Tag>;
        }
        return <Tag color="default">Draft (Department)</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: unknown, r: TimetableEntry) => {
        const isPublished = r.is_published || r.status === 'published';
        const isPending = r.status === 'pending_approval';
        const isDraft = !isPublished && !isPending;

        return (
          <RoleGate feature="timetable" action="manage">
            <Space size="small">
              {/* Department Head can submit Draft for approval */}
              {isDraft && (isHOD || isAdminOrSuper) && (
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<SendOutlined />}
                  onClick={() =>
                    Modal.confirm({
                      title: 'Submit Schedule for Approval?',
                      content:
                        'This submits all draft timetable entries for this period to Academic Administration.',
                      onOk: () => {
                        submitMutation.mutate(r.academic_period_id);
                      },
                    })
                  }
                >
                  Submit for Review
                </Button>
              )}

              {/* Central Admin can Approve & Publish */}
              {!isPublished && isAdminOrSuper && (
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() =>
                    Modal.confirm({
                      title: 'Approve & Publish Timetable?',
                      content:
                        'This publishes the timetable institution-wide and sends alerts to all enrolled students and lecturers.',
                      onOk: () => {
                        publishMutation.mutate(r.academic_period_id);
                      },
                    })
                  }
                >
                  Approve & Publish
                </Button>
              )}

              {!isPublished && (
                <Popconfirm
                  title="Delete this entry?"
                  onConfirm={() => deleteMutation.mutate(r.id)}
                >
                  <Button danger size="small">
                    Delete
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </RoleGate>
        );
      },
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Timetable & Course Scheduling
          </Typography.Title>
          <Typography.Text type="secondary">
            Two-Tier Flow: Department Head creates and submits draft schedules &rarr; Central Administration reviews and publishes.
          </Typography.Text>
        </div>
        <RoleGate feature="timetable" action="manage">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Add Schedule Entry
          </Button>
        </RoleGate>
      </Space>

      <Table dataSource={data ?? []} columns={columns} rowKey="id" loading={isLoading} />

      <Modal
        title="Create Timetable Entry"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={(vals: Record<string, unknown>) => createMutation.mutate(vals)}>
          <Form.Item
            name="course_id"
            label="Course"
            rules={[{ required: true, message: 'Please select a course' }]}
          >
            <Select
              showSearch
              placeholder="Search or select course..."
              optionFilterProp="label"
              options={(courses ?? []).map((c: any) => ({
                value: c.id,
                label: `${c.code} — ${c.name} (${c.credit_hours} Cr)`,
              }))}
            />
          </Form.Item>

          {/* Faculty Options: Option 1 - Department Lecturers, Option 2 - Other Department Lecturers */}
          <div style={{ marginBottom: 14, background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Typography.Text strong style={{ fontSize: 13, color: '#1e293b' }}>
                Faculty Source:
              </Typography.Text>
              <Tag color={lecturerSource === 'dept' ? 'blue' : lecturerSource === 'other' ? 'purple' : 'default'}>
                {lecturerSource === 'dept' ? 'Option 1: Department Faculty' : lecturerSource === 'other' ? 'Option 2: Cross-Faculty / External' : 'All Lecturers'}
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
                1. Department Lecturers ({deptLecturers.length})
              </Radio.Button>
              <Radio.Button value="other" style={{ flex: 1, textAlign: 'center' }}>
                <GlobalOutlined style={{ marginRight: 5 }} />
                2. Other Dept Lecturers ({otherLecturers.length})
              </Radio.Button>
              <Radio.Button value="all" style={{ flex: 0.8, textAlign: 'center' }}>
                All ({lecturers?.length ?? 0})
              </Radio.Button>
            </Radio.Group>
            <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
              {lecturerSource === 'dept'
                ? `Instructors belonging directly to ${department?.name || 'your department'}.`
                : 'Cross-department faculty (Basic Sciences, General Studies, or other technical departments).'}
            </div>
          </div>

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

          <Form.Item
            name="room"
            label="Room / Lecture Hall"
            rules={[{ required: true, message: 'Please enter room/hall' }]}
          >
            <Input placeholder="e.g. Workshop Block A-101 or Lab 3" />
          </Form.Item>

          <Form.Item
            name="day_of_week"
            label="Day of Week"
            rules={[{ required: true, message: 'Please select a day' }]}
          >
            <Select options={DAY_NAMES.slice(1).map((d, i) => ({ value: i + 1, label: d }))} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="start_time"
                label="Start Time (HH:MM)"
                rules={[{ required: true, pattern: /^\d{2}:\d{2}$/, message: 'Use HH:MM format' }]}
              >
                <Input placeholder="08:30" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="end_time"
                label="End Time (HH:MM)"
                rules={[{ required: true, pattern: /^\d{2}:\d{2}$/, message: 'Use HH:MM format' }]}
              >
                <Input placeholder="10:30" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="entry_type" label="Session Type" rules={[{ required: true }]} initialValue="class">
            <Select
              options={[
                { value: 'class', label: 'Lecture / Class' },
                { value: 'lab', label: 'Laboratory / Practical Workshop' },
                { value: 'exam', label: 'Official Examination' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

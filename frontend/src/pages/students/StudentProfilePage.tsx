import React, { useState } from 'react';
import {
  Card, Descriptions, Tag, Button, Tabs, Table, Upload, message,
  Modal, Form, Input, Space, Avatar, Spin, Row, Col, Statistic,
} from 'antd';
import {
  EditOutlined, CameraOutlined, PlusOutlined, UserOutlined,
  BookOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../../api/axios';
import { RoleGate } from '../../components/RoleGate';
import type { StudentProfile, Enrollment, FinalGrade } from '../../types';
import type { ColumnsType } from 'antd/es/table';

// Inline type to avoid rc-upload import issues
type CustomRequestOptions = {
  file: File;
  onProgress?: (e: { percent: number }) => void;
  onSuccess?: (body: unknown) => void;
  onError?: (err: Error) => void;
};

export default function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form] = Form.useForm();
  const [enrollForm] = Form.useForm();

  const { data: student, isLoading } = useQuery({
    queryKey: ['student', id],
    queryFn: () =>
      api.get<{ success: boolean; data: StudentProfile }>(`/students/${id}`)
        .then(r => r.data.data),
    enabled: !!id,
  });

  const { data: enrollments } = useQuery({
    queryKey: ['enrollments', id],
    queryFn: () =>
      api.get<{ success: boolean; data: Enrollment[] }>(`/enrollments?studentId=${id}`)
        .then(r => r.data.data),
    enabled: !!id,
  });

  const { data: transcript } = useQuery({
    queryKey: ['transcript', id],
    queryFn: () =>
      api.get<{ success: boolean; data: FinalGrade[] }>(`/grades/transcript/${id}`)
        .then(r => r.data.data),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.patch(`/students/${id}`, values).then(r => r.data),
    onSuccess: () => {
      void message.success('Profile updated');
      setEditOpen(false);
      void qc.invalidateQueries({ queryKey: ['student', id] });
    },
    onError: () => void message.error('Update failed'),
  });

  const enrollMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post('/enrollments', { ...values, student_id: id }).then(r => r.data),
    onSuccess: () => {
      void message.success('Enrolled successfully');
      setEnrollOpen(false);
      enrollForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['enrollments', id] });
    },
    onError: (e: unknown) => {
      const code = (e as { response?: { data?: { error?: { code?: string } } } })
        ?.response?.data?.error?.code;
      void message.error(
        code === 'ENROLLMENT_CAPACITY_EXCEEDED' ? 'Course is at full capacity' : 'Enrollment failed',
      );
    },
  });

  const removeEnrollMutation = useMutation({
    mutationFn: (enrollId: string) =>
      api.delete(`/enrollments/${enrollId}`).then(r => r.data),
    onSuccess: () => {
      void message.success('Enrollment removed');
      void qc.invalidateQueries({ queryKey: ['enrollments', id] });
    },
  });

  // ── Photo upload ──────────────────────────────────────────────────────────
  const handlePhotoUpload = async (options: CustomRequestOptions) => {
    const file = options.file;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      void message.error('Only JPEG or PNG files are accepted');
      options.onError?.(new Error('Invalid type'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      void message.error('Photo must be ≤ 2 MB');
      options.onError?.(new Error('Too large'));
      return;
    }

    const fd = new FormData();
    fd.append('photo', file);
    setUploading(true);
    try {
      await api.post(`/students/${id}/photo`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) options.onProgress?.({ percent: Math.round((e.loaded / e.total) * 100) });
        },
      });
      options.onSuccess?.({});
      void message.success('Photo updated successfully');
      void qc.invalidateQueries({ queryKey: ['student', id] });
    } catch {
      options.onError?.(new Error('Upload failed'));
      void message.error('Photo upload failed. Must be JPEG or PNG ≤ 2 MB');
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
      <Spin size="large" />
    </div>
  );
  if (!student) return <div style={{ padding: 24 }}>Student not found.</div>;

  const statusColor = { active: 'green', inactive: 'red', graduated: 'blue', suspended: 'orange' };

  const enrollCols: ColumnsType<Enrollment> = [
    { title: 'Course', dataIndex: ['course', 'name'], key: 'course', render: (v: unknown) => v ?? '—' },
    { title: 'Period', dataIndex: ['academicPeriod', 'name'], key: 'period', render: (v: unknown) => v ?? '—' },
    { title: 'Enrolled', dataIndex: 'enrolled_at', key: 'date', render: (d: string) => new Date(d).toLocaleDateString() },
    {
      title: '',
      key: 'remove',
      render: (_: unknown, r: Enrollment) => (
        <RoleGate feature="course_enrollment" action="manage">
          <Button danger size="small" onClick={() => Modal.confirm({
            title: 'Remove this enrollment?',
            onOk: () => { removeEnrollMutation.mutate(r.id); },
          })}>Remove</Button>
        </RoleGate>
      ),
    },
  ];

  const gradeCols: ColumnsType<FinalGrade> = [
    { title: 'Course', dataIndex: ['course', 'name'], key: 'course', render: (v: unknown) => v ?? '—' },
    { title: 'Period', dataIndex: ['academicPeriod', 'name'], key: 'period', render: (v: unknown) => v ?? '—' },
    { title: 'Score', dataIndex: 'final_score', key: 'score' },
    {
      title: 'Grade', dataIndex: 'letter_grade', key: 'grade',
      render: (g: string) => <Tag color={g === 'F' ? 'red' : g?.startsWith('A') ? 'green' : 'blue'}>{g}</Tag>,
    },
    { title: 'GPA Points', dataIndex: 'grade_points', key: 'gpa' },
  ];

  return (
    <div>
      {/* ── Profile header card ── */}
      <Card
        style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: 16 }}
        bodyStyle={{ padding: 0 }}
      >
        {/* Blue banner */}
        <div style={{
          background: 'linear-gradient(135deg, #001529, #003a8c)',
          borderRadius: '12px 12px 0 0',
          height: 100,
        }} />

        <div style={{ padding: '0 32px 24px', marginTop: -50 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            {/* Avatar + upload */}
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <Avatar
                src={student.photo_url ?? undefined}
                size={96}
                style={{
                  border: '4px solid #fff',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  background: '#1677ff',
                  fontSize: 36,
                  fontWeight: 700,
                }}
                icon={!student.photo_url ? <UserOutlined /> : undefined}
              >
                {!student.photo_url && student.full_legal_name[0]}
              </Avatar>

              {/* Camera overlay button */}
              <RoleGate feature="profile" action="update">
                <Upload
                  accept="image/jpeg,image/png"
                  showUploadList={false}
                  customRequest={(opts) => {
                    void handlePhotoUpload(opts as unknown as CustomRequestOptions);
                  }}
                  maxCount={1}
                >
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: 28,
                      height: 28,
                      background: uploading ? '#faad14' : '#1677ff',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      border: '2px solid #fff',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                      transition: 'background 0.2s',
                    }}
                    title="Change photo (JPEG/PNG ≤ 2MB)"
                  >
                    <CameraOutlined style={{ color: '#fff', fontSize: 13 }} />
                  </div>
                </Upload>
              </RoleGate>
            </div>

            {/* Name + status */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#262626', lineHeight: 1.3 }}>
                {student.full_legal_name}
              </div>
              <div style={{ color: '#8c8c8c', marginTop: 2 }}>
                {student.student_number} · {student.programme?.name ?? 'No programme'}
              </div>
              <Tag
                color={statusColor[student.status] ?? 'default'}
                style={{ marginTop: 6, textTransform: 'capitalize' }}
              >
                {student.status}
              </Tag>
            </div>

            {/* Edit button */}
            <RoleGate feature="profile" action="update">
              <Button
                icon={<EditOutlined />}
                onClick={() => { form.setFieldsValue(student); setEditOpen(true); }}
              >
                Edit Profile
              </Button>
            </RoleGate>
          </div>
        </div>
      </Card>

      {/* ── Stats row ── */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic title="Year of Entry" value={student.year_of_entry} prefix={<CalendarOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic title="Enrollments" value={enrollments?.length ?? 0} prefix={<BookOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic title="Grades" value={transcript?.length ?? 0} prefix={<BookOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic title="Gender" value={student.gender ?? '—'} />
          </Card>
        </Col>
      </Row>

      {/* ── Details + Tabs ── */}
      <Card style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <Tabs
          items={[
            {
              key: 'info',
              label: 'Personal Info',
              children: (
                <Descriptions column={{ xs: 1, sm: 2 }} size="small" style={{ marginTop: 8 }}>
                  <Descriptions.Item label="National ID">{student.national_id}</Descriptions.Item>
                  <Descriptions.Item label="Date of Birth">
                    {student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString() : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Email">{student.personal_email ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Phone">{student.phone ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Home Address" span={2}>{student.home_address ?? '—'}</Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: 'enrollments',
              label: `Enrollments (${enrollments?.length ?? 0})`,
              children: (
                <>
                  <RoleGate feature="course_enrollment" action="manage">
                    <Button icon={<PlusOutlined />} onClick={() => setEnrollOpen(true)} style={{ marginBottom: 12 }}>
                      Enroll in Course
                    </Button>
                  </RoleGate>
                  <Table
                    dataSource={enrollments ?? []}
                    columns={enrollCols}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    locale={{ emptyText: 'No enrollments yet' }}
                  />
                </>
              ),
            },
            {
              key: 'grades',
              label: `Transcript (${transcript?.length ?? 0})`,
              children: (
                <Table
                  dataSource={transcript ?? []}
                  columns={gradeCols}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  locale={{ emptyText: 'No published grades yet' }}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* Edit modal */}
      <Modal title="Edit Student Profile" open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => form.submit()} confirmLoading={updateMutation.isPending} width={520}>
        <Form form={form} layout="vertical" onFinish={vals => updateMutation.mutate(vals)}>
          <Form.Item name="full_legal_name" label="Full Legal Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="phone" label="Phone"><Input /></Form.Item>
          <Form.Item name="personal_email" label="Email" rules={[{ type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="home_address" label="Home Address"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* Enroll modal */}
      <Modal title="Enroll Student in Course" open={enrollOpen} onCancel={() => setEnrollOpen(false)} onOk={() => enrollForm.submit()} confirmLoading={enrollMutation.isPending}>
        <Form form={enrollForm} layout="vertical" onFinish={vals => enrollMutation.mutate(vals)}>
          <Form.Item name="course_id" label="Course ID (UUID)" rules={[{ required: true }]}><Input placeholder="e.g. 3fa85f64-5717-4562-b3fc-2c963f66afa6" /></Form.Item>
          <Form.Item name="academic_period_id" label="Academic Period ID (UUID)" rules={[{ required: true }]}><Input placeholder="e.g. 3fa85f64-5717-4562-b3fc-2c963f66afa6" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

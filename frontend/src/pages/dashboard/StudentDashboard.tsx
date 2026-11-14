import React from 'react';
import {
  Row, Col, Card, Statistic, Typography, Table, Tag, Alert,
  Space, Divider, Tabs
} from 'antd';
import {
  BookOutlined, CalendarOutlined, DollarOutlined,
  CheckCircleOutlined, ClockCircleOutlined,
  EnvironmentOutlined, UserOutlined, SafetyCertificateOutlined,
  FileDoneOutlined
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import type { FinalGrade, TimetableEntry } from '../../types';
import type { ColumnsType } from 'antd/es/table';

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function StudentDashboard() {
  const { user } = useAuth();

  const { data: gpaData } = useQuery({
    queryKey: ['gpa', user?.id],
    queryFn: () =>
      api.get<{ success: boolean; data: { gpa: number } }>(`/grades/gpa/${user?.id}`)
        .then((r: any) => r.data.data),
    enabled: !!user?.id,
  });

  const { data: feesData } = useQuery({
    queryKey: ['fees-balance', user?.id],
    queryFn: () =>
      api.get<{ success: boolean; data: { outstanding: number } }>(`/fees/balance/${user?.id}`)
        .then((r: any) => r.data.data),
    enabled: !!user?.id,
  });

  const { data: enrollments, isLoading: enrollmentsLoading } = useQuery({
    queryKey: ['my-enrollments'],
    queryFn: () =>
      api.get<{ success: boolean; data: any[] }>('/enrollments')
        .then((r: any) => {
          const d = r.data?.data ?? r.data;
          return Array.isArray(d) ? d : [];
        }),
  });

  const { data: timetableEntries, isLoading: timetableLoading } = useQuery({
    queryKey: ['my-timetable'],
    queryFn: () =>
      api.get<{ success: boolean; data: TimetableEntry[] }>('/timetable')
        .then((r: any) => {
          const d = r.data?.data ?? r.data;
          return Array.isArray(d) ? d : [];
        }),
  });

  const { data: transcriptData } = useQuery({
    queryKey: ['transcript', user?.id],
    queryFn: () =>
      api.get<{ success: boolean; data: FinalGrade[] }>(`/grades/transcript/${user?.id}`)
        .then((r: any) => {
          const d = r.data?.data ?? r.data;
          return Array.isArray(d) ? d : [];
        }),
    enabled: !!user?.id,
  });

  const outstanding = feesData?.outstanding ?? 0;

  // Derive student information from enrollment relations
  const firstEnrollment = enrollments?.[0];
  const studentProfile = firstEnrollment?.student;
  const programmeName =
    studentProfile?.programme?.name ||
    (firstEnrollment?.course?.department?.name
      ? `BSc in ${firstEnrollment.course.department.name}`
      : 'Undergraduate Degree Program');
  const studentName = studentProfile?.full_legal_name || user?.username || 'Student';
  const studentNumber = studentProfile?.student_number || `UGPR-${user?.username?.toUpperCase() || '2026'}`;
  const periodName = firstEnrollment?.academicPeriod?.name || '2026/2027 - Semester 1';
  const totalCredits = (enrollments ?? []).reduce(
    (acc: number, curr: any) => acc + (Number(curr.course?.credit_hours) || 0),
    0
  );

  const auditColumns: ColumnsType<any> = [
    {
      title: 'COURSE',
      key: 'course',
      render: (_: unknown, record: any) => (
        <div>
          <Typography.Text strong style={{ fontSize: 14, display: 'block', color: '#1f2937' }}>
            {record.course?.name || 'Course Name'}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
            {record.course?.code || '—'}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'CREDIT',
      key: 'credit',
      width: 90,
      align: 'center',
      render: (_: unknown, record: any) => (
        <Typography.Text strong style={{ fontSize: 14 }}>
          {record.course?.credit_hours ?? 3}
        </Typography.Text>
      ),
    },
    {
      title: 'GRADE',
      key: 'grade',
      width: 100,
      align: 'center',
      render: (_: unknown, record: any) => {
        const gradeObj = (transcriptData ?? []).find(
          (g: any) => g.course_id === record.course_id || g.course?.code === record.course?.code
        );
        const grade = gradeObj?.letter_grade;
        if (!grade) {
          return <Tag color="default" style={{ padding: '2px 10px', fontSize: 13 }}>--</Tag>;
        }
        return (
          <Tag
            color={grade === 'F' ? 'red' : grade === 'A' ? 'green' : 'blue'}
            style={{ padding: '2px 10px', fontSize: 13, fontWeight: 600 }}
          >
            {grade}
          </Tag>
        );
      },
    },
    {
      title: 'VALUE',
      key: 'value',
      width: 90,
      align: 'center',
      render: (_: unknown, record: any) => {
        const gradeObj = (transcriptData ?? []).find(
          (g: any) => g.course_id === record.course_id || g.course?.code === record.course?.code
        );
        return (
          <Typography.Text type="secondary">
            {gradeObj?.final_score != null ? Number(gradeObj.final_score).toFixed(1) : '--'}
          </Typography.Text>
        );
      },
    },
    {
      title: 'INSTRUCTOR',
      key: 'instructor',
      render: (_: unknown, record: any) => {
        const tt = (timetableEntries ?? []).find(
          (t: TimetableEntry) => t.course_id === record.course_id || t.course?.code === record.course?.code
        );
        const lecturerName = tt?.lecturer?.username;
        const deptName = record.course?.department?.name;
        return (
          <div>
            <Typography.Text strong style={{ color: '#2563eb' }}>
              {lecturerName ? `Dr./Prof. ${lecturerName}` : (deptName ? `${deptName} Faculty` : 'Assigned Faculty')}
            </Typography.Text>
            {tt && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                <ClockCircleOutlined style={{ marginRight: 4 }} />
                {DAY_NAMES[tt.day_of_week]} {tt.start_time}–{tt.end_time} &bull; <EnvironmentOutlined style={{ marginRight: 2 }} /> {tt.room}
              </div>
            )}
          </div>
        );
      },
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
      width: 150,
      render: (_: unknown, r: TimetableEntry) => (
        <Typography.Text strong>
          <ClockCircleOutlined style={{ marginRight: 6 }} />
          {r.start_time} – {r.end_time}
        </Typography.Text>
      ),
    },
    {
      title: 'Course',
      key: 'course',
      render: (_: unknown, r: TimetableEntry) => (
        <div>
          <Typography.Text strong>{r.course?.name || 'Class Session'}</Typography.Text>
          <div style={{ fontSize: 12, color: '#6b7280' }}>{r.course?.code}</div>
        </div>
      ),
    },
    {
      title: 'Room / Hall',
      dataIndex: 'room',
      key: 'room',
      width: 140,
      render: (rm: string) => (
        <Typography.Text>
          <EnvironmentOutlined style={{ marginRight: 4 }} />
          {rm}
        </Typography.Text>
      ),
    },
    {
      title: 'Lecturer',
      key: 'lecturer',
      render: (_: unknown, r: TimetableEntry) => (
        <Typography.Text>
          <UserOutlined style={{ marginRight: 4 }} />
          {r.lecturer?.username || 'Department Lecturer'}
        </Typography.Text>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'entry_type',
      key: 'type',
      width: 90,
      render: (t: string) => (
        <Tag color={t === 'exam' ? 'error' : t === 'lab' ? 'warning' : 'blue'}>
          {t?.toUpperCase()}
        </Tag>
      ),
    },
  ];

  return (
    <div>
      {/* Official Registrar Header Banner */}
      <Card
        style={{
          marginBottom: 16,
          borderTop: '4px solid #1677ff',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <SafetyCertificateOutlined style={{ fontSize: 24, color: '#1677ff' }} />
              <Typography.Title level={4} style={{ margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Office of the Registrar &bull; Academic Course Audit
              </Typography.Title>
            </div>
            <Typography.Title level={5} style={{ margin: 0, color: '#4b5563' }}>
              Program: <span style={{ color: '#111827' }}>{programmeName}</span>
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              Courses Detail for {periodName}
            </Typography.Text>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Typography.Text strong style={{ fontSize: 15, display: 'block' }}>
              Student: {studentName}
            </Typography.Text>
            <Tag color="blue" style={{ fontSize: 12, padding: '2px 8px', marginTop: 4 }}>
              ID: {studentNumber}
            </Tag>
          </div>
        </div>
      </Card>

      {outstanding > 0 && (
        <Alert
          message={`Outstanding fee balance: ETB ${outstanding.toFixed(2)}`}
          type="warning"
          showIcon
          icon={<DollarOutlined />}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Metric Cards (matching Audit Report) */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic title="SGPA" value={0.0} precision={2} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic
              title="CGPA"
              value={gpaData?.gpa ?? 0.0}
              precision={2}
              prefix={<BookOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
              Academic Status
            </Typography.Text>
            <Tag color="processing" style={{ fontSize: 14, padding: '2px 14px', fontWeight: 600 }}>
              NYD (In Progress)
            </Tag>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic
              title="Registered Courses"
              value={enrollments?.length ?? 0}
              prefix={<FileDoneOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Tabs
        defaultActiveKey="audit"
        items={[
          {
            key: 'audit',
            label: 'Academic Course Audit',
            children: (
              <Card>
                <Table
                  dataSource={enrollments ?? []}
                  columns={auditColumns}
                  rowKey="id"
                  loading={enrollmentsLoading}
                  pagination={false}
                  size="middle"
                />
                <div
                  style={{
                    marginTop: 16,
                    padding: '12px 16px',
                    background: '#f8fafc',
                    borderRadius: 6,
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <Space>
                    <CheckCircleOutlined style={{ color: '#10b981', fontSize: 16 }} />
                    <Typography.Text strong style={{ color: '#0f766e', fontSize: 13 }}>
                      Verified Electronic Record
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      &bull; Securely generated from the Student Information Management System Registrar.
                    </Typography.Text>
                  </Space>
                  <Typography.Text strong style={{ fontSize: 14 }}>
                    Total Registered Credits:{' '}
                    <Tag color="blue" style={{ fontSize: 14, padding: '2px 8px', marginLeft: 6 }}>
                      {totalCredits} Credit Hours
                    </Tag>
                  </Typography.Text>
                </div>
              </Card>
            ),
          },
          {
            key: 'timetable',
            label: 'Class Schedule & Timetable',
            children: (
              <Card>
                <Table
                  dataSource={timetableEntries ?? []}
                  columns={timetableColumns}
                  rowKey="id"
                  loading={timetableLoading}
                  pagination={false}
                  locale={{ emptyText: 'No published timetable entries yet for your enrolled courses.' }}
                />
              </Card>
            ),
          },
          {
            key: 'transcript',
            label: 'Completed Grades & Transcript',
            children: (
              <Card>
                <Table
                  dataSource={transcriptData ?? []}
                  rowKey="id"
                  pagination={false}
                  size="small"
                  locale={{ emptyText: 'No completed grades on transcript yet (current semester in progress).' }}
                  columns={[
                    { title: 'Course', dataIndex: ['course', 'name'], key: 'course' },
                    { title: 'Period', dataIndex: ['academicPeriod', 'name'], key: 'period' },
                    { title: 'Score', dataIndex: 'final_score', key: 'score' },
                    {
                      title: 'Grade',
                      dataIndex: 'letter_grade',
                      key: 'letter',
                      render: (g: string) => (
                        <Tag color={g === 'F' ? 'red' : g === 'A' ? 'green' : 'blue'}>{g}</Tag>
                      ),
                    },
                  ]}
                />
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}

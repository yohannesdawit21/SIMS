import React from 'react';
import { Row, Col, Card, Statistic, Typography, Table, Tag, Button, Space, Alert } from 'antd';
import {
  BookOutlined,
  CalendarOutlined,
  EditOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import type { TimetableEntry, LecturerAssignedCourse } from '../../types';

const { Title, Text, Paragraph } = Typography;
const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function LecturerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: timetable } = useQuery({
    queryKey: ['timetable-lecturer', user?.id],
    queryFn: () =>
      api
        .get<{ success: boolean; data: TimetableEntry[] }>('/timetable')
        .then((r) => r.data.data),
    enabled: !!user?.id,
  });

  const { data: assignedCourses } = useQuery<LecturerAssignedCourse[]>({
    queryKey: ['my-assigned-courses-dash', user?.id],
    queryFn: () =>
      api.get('/grades/my-courses').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
    enabled: !!user?.id,
  });

  const coursesList = assignedCourses ?? [];
  const draftCount = coursesList.filter((c) => c.gradingStatus === 'draft').length;
  const pendingCount = coursesList.filter((c) => c.gradingStatus === 'pending_approval').length;
  const revisionCount = coursesList.filter((c) => c.gradingStatus === 'revision_requested').length;
  const publishedCount = coursesList.filter((c) => c.gradingStatus === 'published').length;

  const upcoming = (timetable ?? [])
    .filter((e) => e.is_published)
    .sort((a, b) => a.day_of_week - b.day_of_week)
    .slice(0, 5);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ marginBottom: 2 }}>
          Welcome, {user?.username}
        </Title>
        <Paragraph type="secondary">
          Academic Faculty Dashboard — manage assigned course grading, submit marks for HOD moderation, and monitor your schedule.
        </Paragraph>
      </div>

      {revisionCount > 0 && (
        <Alert
          type="error"
          showIcon
          icon={<ExclamationCircleOutlined />}
          message={`${revisionCount} course(s) require grade revision.`}
          description="The Head of Department has requested adjustments on submitted grades. Please open the course grade sheet, review notes, and re-submit."
          action={
            <Button
              size="small"
              danger
              onClick={() => {
                const revCourse = coursesList.find((c) => c.gradingStatus === 'revision_requested');
                if (revCourse) {
                  navigate(`/grades?courseId=${revCourse.courseId}&periodId=${revCourse.academicPeriodId}`);
                } else {
                  navigate('/grades');
                }
              }}
            >
              Review Revisions
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {/* KPI Stats */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card bordered>
            <Statistic
              title="Assigned Courses"
              value={coursesList.length}
              prefix={<BookOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered>
            <Statistic
              title="Draft / In Progress"
              value={draftCount}
              valueStyle={{ color: '#0958d9' }}
              prefix={<EditOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered>
            <Statistic
              title="Pending HOD Review"
              value={pendingCount}
              valueStyle={{ color: '#fa8c16' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered>
            <Statistic
              title="Published / Final"
              value={publishedCount}
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Course Grading Overview */}
      <Card
        title="My Courses & Grade Entry Workflow"
        extra={
          <Button type="primary" onClick={() => navigate('/grades')}>
            Open Grading Workspace
          </Button>
        }
        style={{ marginTop: 16 }}
      >
        <Table
          dataSource={coursesList}
          rowKey={(r) => `${r.courseId}:${r.academicPeriodId}`}
          pagination={false}
          size="middle"
          columns={[
            {
              title: 'Course',
              key: 'course',
              render: (_: unknown, r: LecturerAssignedCourse) => (
                <div>
                  <Text strong>{r.courseCode} — {r.courseName}</Text>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {r.creditHours} Credits • {r.departmentName || 'Department'}
                    </Text>
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
              title: 'Enrolled Students',
              dataIndex: 'enrolledCount',
              key: 'enrolled',
              align: 'center',
            },
            {
              title: 'Grading Status',
              key: 'status',
              render: (_: unknown, r: LecturerAssignedCourse) => {
                if (r.gradingStatus === 'published') {
                  return <Tag color="success">Approved & Published</Tag>;
                }
                if (r.gradingStatus === 'pending_approval') {
                  return <Tag color="gold">Pending HOD Review</Tag>;
                }
                if (r.gradingStatus === 'revision_requested') {
                  return <Tag color="error">Revision Requested</Tag>;
                }
                return <Tag color="blue">Draft (Editing)</Tag>;
              },
            },
            {
              title: 'Actions',
              key: 'actions',
              render: (_: unknown, r: LecturerAssignedCourse) => (
                <Button
                  size="small"
                  type={r.gradingStatus === 'revision_requested' ? 'primary' : 'default'}
                  danger={r.gradingStatus === 'revision_requested'}
                  icon={<EditOutlined />}
                  onClick={() =>
                    navigate(
                      `/grades?courseId=${r.courseId}&periodId=${r.academicPeriodId}`,
                    )
                  }
                >
                  {r.gradingStatus === 'published'
                    ? 'View Sheet'
                    : r.gradingStatus === 'pending_approval'
                    ? 'View Submission'
                    : 'Enter Marks'}
                </Button>
              ),
            },
          ]}
        />
      </Card>

      {/* Class Schedule */}
      <Card title="Upcoming Classes & Timetable" style={{ marginTop: 16 }}>
        <Table
          dataSource={upcoming}
          rowKey="id"
          pagination={false}
          size="small"
          columns={[
            { title: 'Course', dataIndex: ['course', 'name'], key: 'course' },
            {
              title: 'Day',
              dataIndex: 'day_of_week',
              key: 'day',
              render: (d: number) => DAY_NAMES[d],
            },
            {
              title: 'Time',
              key: 'time',
              render: (_: unknown, r: TimetableEntry) =>
                `${r.start_time} – ${r.end_time}`,
            },
            { title: 'Room', dataIndex: 'room', key: 'room' },
            {
              title: 'Type',
              dataIndex: 'entry_type',
              key: 'type',
              render: (t: string) => <Tag>{t}</Tag>,
            },
          ]}
        />
      </Card>
    </div>
  );
}

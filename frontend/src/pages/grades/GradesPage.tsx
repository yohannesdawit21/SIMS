import React, { useState, useEffect, useMemo } from 'react';
import {
  Table,
  Button,
  Typography,
  Modal,
  Tag,
  Space,
  Alert,
  InputNumber,
  Input,
  Select,
  Card,
  Row,
  Col,
  Statistic,
  Badge,
  Tabs,
  Tooltip,
  Divider,
  message,
  Popconfirm,
} from 'antd';
import {
  SendOutlined,
  CheckCircleOutlined,
  EditOutlined,
  RollbackOutlined,
  SaveOutlined,
  BookOutlined,
  CheckOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useRbac } from '../../hooks/useRbac';
import type {
  FinalGrade,
  CourseGradingSheet,
  LecturerAssignedCourse,
  PendingGradeSubmission,
  AcademicPeriod,
} from '../../types';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text, Paragraph } = Typography;

function getGradeColor(letterGrade: string | null | undefined): string {
  if (!letterGrade) return 'default';
  if (letterGrade === 'F') return 'error';
  if (letterGrade.startsWith('A')) return 'success';
  if (letterGrade.startsWith('B')) return 'processing';
  if (letterGrade.startsWith('C')) return 'warning';
  return 'default';
}

function calculateGradeLetter(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  if (score >= 65) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 55) return 'C-';
  if (score >= 50) return 'D+';
  if (score >= 45) return 'D';
  return 'F';
}

function calculateGradePoints(score: number): number {
  if (score >= 90) return 4.0;
  if (score >= 85) return 3.7;
  if (score >= 80) return 3.3;
  if (score >= 75) return 3.0;
  if (score >= 70) return 2.7;
  if (score >= 65) return 2.3;
  if (score >= 60) return 2.0;
  if (score >= 55) return 1.7;
  if (score >= 50) return 1.3;
  if (score >= 45) return 1.0;
  return 0.0;
}

function StudentCourseBreakdown({ courseId, periodId }: { courseId: string; periodId: string }) {
  const { data: breakdown, isLoading } = useQuery<any[]>({
    queryKey: ['course-grade-breakdown', courseId, periodId],
    queryFn: () =>
      api.get(`/grades/breakdown/${courseId}/${periodId}`).then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
  });

  if (isLoading) {
    return (
      <div style={{ padding: '8px 16px' }}>
        <Text type="secondary">Loading assessment component breakdown...</Text>
      </div>
    );
  }

  if (!breakdown || breakdown.length === 0) {
    return (
      <div style={{ padding: '8px 16px' }}>
        <Text type="secondary">No detailed component scores published for this course.</Text>
      </div>
    );
  }

  const columns = [
    {
      title: 'Assessment Component',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, r: any) => (
        <span>
          <Text strong>{name}</Text>{' '}
          {r.isMandatory ? (
            <Tag color="orange" style={{ fontSize: 11, marginLeft: 6 }}>
              Mandatory
            </Tag>
          ) : null}
        </span>
      ),
    },
    {
      title: 'Weight',
      dataIndex: 'weight',
      key: 'weight',
      width: 120,
      render: (w: number) => `${w}%`,
    },
    {
      title: 'Score Obtained',
      dataIndex: 'score',
      key: 'score',
      width: 150,
      render: (s: number | null) => (s !== null ? `${Number(s).toFixed(1)} / 100` : '--'),
    },
    {
      title: 'Weighted Contribution',
      dataIndex: 'weightedContribution',
      key: 'weightedContribution',
      width: 180,
      render: (wc: number | null) =>
        wc !== null ? (
          <Text strong style={{ color: '#1677ff' }}>
            {Number(wc).toFixed(2)}%
          </Text>
        ) : (
          '--'
        ),
    },
  ];

  return (
    <div
      style={{
        margin: '6px 0',
        background: '#fafafa',
        padding: '12px 16px',
        borderRadius: 6,
        border: '1px solid #f0f0f0',
      }}
    >
      <Text strong style={{ display: 'block', marginBottom: 8, color: '#333' }}>
        Itemized Assessment Component Breakdown:
      </Text>
      <Table
        dataSource={breakdown}
        columns={columns}
        rowKey="componentId"
        pagination={false}
        size="small"
      />
    </div>
  );
}

export default function GradesPage() {
  const { user } = useAuth();
  const { can } = useRbac();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const isLecturer = user?.role === 'lecturer';
  const isDeptHead = user?.role === 'department_head';
  const isAdminOrSuper = user?.role === 'admin_staff' || user?.role === 'super_admin';
  const isStudent = user?.role === 'student';
  const isParent = user?.role === 'parent_guardian';

  // Selected course & period
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(
    searchParams.get('courseId') || null,
  );
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(
    searchParams.get('periodId') || null,
  );

  // Active view tab for HOD
  const [activeTab, setActiveTab] = useState<string>('sheet');

  // Local editable scores: studentId -> { [componentId]: score }
  const [editedScores, setEditedScores] = useState<
    Record<string, Record<string, number | null>>
  >({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // Revision modal state
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');

  // Missing components warning
  const [publishWarning, setPublishWarning] = useState<string[] | null>(null);

  // Synchronize URL query params
  useEffect(() => {
    const params: Record<string, string> = {};
    if (selectedCourseId) params.courseId = selectedCourseId;
    if (selectedPeriodId) params.periodId = selectedPeriodId;
    setSearchParams(params, { replace: true });
  }, [selectedCourseId, selectedPeriodId, setSearchParams]);

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  // Academic Periods
  const { data: periods } = useQuery<AcademicPeriod[]>({
    queryKey: ['academic-periods'],
    queryFn: () =>
      api.get('/timetable/periods').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
    enabled: !isStudent && !isParent,
  });

  // Lecturer assigned courses
  const { data: myCourses, isLoading: myCoursesLoading } = useQuery<LecturerAssignedCourse[]>({
    queryKey: ['my-assigned-courses', user?.id],
    queryFn: () =>
      api.get('/grades/my-courses').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
    enabled: isLecturer || isAdminOrSuper,
  });

  // HOD Pending Submissions
  const { data: pendingSubmissions, isLoading: pendingLoading } = useQuery<
    PendingGradeSubmission[]
  >({
    queryKey: ['pending-grade-submissions', user?.id],
    queryFn: () =>
      api.get('/grades/pending-approval').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
    enabled: isDeptHead || isAdminOrSuper,
  });

  // Department Courses (for HOD selection)
  const { data: deptCourses } = useQuery<any[]>({
    queryKey: ['department-courses', user?.id],
    queryFn: () =>
      api.get('/timetable/courses').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
    enabled: isDeptHead,
  });

  // Auto-select first period if not set
  useEffect(() => {
    if (!selectedPeriodId && periods && periods.length > 0) {
      setSelectedPeriodId(periods[0].id);
    }
  }, [periods, selectedPeriodId]);

  // Auto-select first course for lecturer if not set
  useEffect(() => {
    if (!selectedCourseId && myCourses && myCourses.length > 0) {
      setSelectedCourseId(myCourses[0].courseId);
      if (myCourses[0].academicPeriodId && !selectedPeriodId) {
        setSelectedPeriodId(myCourses[0].academicPeriodId);
      }
    }
  }, [myCourses, selectedCourseId, selectedPeriodId]);

  // Auto-select first course for HOD if none selected and pending exists
  useEffect(() => {
    if (!selectedCourseId && isDeptHead && pendingSubmissions && pendingSubmissions.length > 0) {
      setSelectedCourseId(pendingSubmissions[0].courseId);
      setSelectedPeriodId(pendingSubmissions[0].academicPeriodId);
    }
  }, [pendingSubmissions, selectedCourseId, isDeptHead]);

  // Active Grading Sheet Query
  const {
    data: sheet,
    isLoading: sheetLoading,
    refetch: refetchSheet,
  } = useQuery<CourseGradingSheet>({
    queryKey: ['course-grading-sheet', selectedCourseId, selectedPeriodId],
    queryFn: () =>
      api
        .get(`/grades/sheet/${selectedCourseId}/${selectedPeriodId}`)
        .then((r: any) => r.data?.data ?? r.data),
    enabled: !!selectedCourseId && !!selectedPeriodId && !isStudent && !isParent,
  });

  // Populate local editedScores from backend sheet data
  useEffect(() => {
    if (sheet?.roster) {
      const initial: Record<string, Record<string, number | null>> = {};
      for (const row of sheet.roster) {
        initial[row.studentId] = { ...(row.scores || {}) };
      }
      setEditedScores(initial);
      setHasUnsavedChanges(false);
    }
  }, [sheet]);

  // Student Transcript & GPA Queries
  const { data: transcript } = useQuery<FinalGrade[]>({
    queryKey: ['transcript', user?.id],
    queryFn: () =>
      api
        .get(`/grades/transcript/${user?.id}`)
        .then((r: any) => r.data?.data ?? r.data),
    enabled: isStudent && !!user?.id,
  });

  const { data: gpaData } = useQuery<{ gpa: number }>({
    queryKey: ['gpa', user?.id],
    queryFn: () =>
      api.get(`/grades/gpa/${user?.id}`).then((r: any) => r.data?.data ?? r.data),
    enabled: isStudent && !!user?.id,
  });

  // Guardian Linked Students Query
  const { data: guardianStudents } = useQuery<any[]>({
    queryKey: ['guardian-students-grades', user?.id],
    queryFn: () =>
      api.get('/guardians/me/students').then((r: any) => {
        const d = r.data?.data ?? r.data;
        return Array.isArray(d) ? d : [];
      }),
    enabled: isParent && !!user?.id,
  });

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  // Batch Save Draft
  const batchSaveMutation = useMutation({
    mutationFn: (grades: Array<{ studentId: string; componentId: string; score: number | null }>) =>
      api
        .post('/grades/batch', {
          courseId: selectedCourseId,
          periodId: selectedPeriodId,
          grades,
        })
        .then((r: any) => r.data),
    onSuccess: (data: any) => {
      void message.success(data?.message || 'Grades saved in draft state.');
      setHasUnsavedChanges(false);
      void qc.invalidateQueries({
        queryKey: ['course-grading-sheet', selectedCourseId, selectedPeriodId],
      });
      void qc.invalidateQueries({ queryKey: ['my-assigned-courses'] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Failed to save grades';
      void message.error(msg);
    },
  });

  // Submit to HOD
  const submitMutation = useMutation({
    mutationFn: () =>
      api
        .post('/grades/submit', {
          courseId: selectedCourseId,
          periodId: selectedPeriodId,
        })
        .then((r: any) => r.data),
    onSuccess: (data: any) => {
      void message.success(data?.message || 'Grades submitted to Department Head for review.');
      setHasUnsavedChanges(false);
      void qc.invalidateQueries({
        queryKey: ['course-grading-sheet', selectedCourseId, selectedPeriodId],
      });
      void qc.invalidateQueries({ queryKey: ['my-assigned-courses'] });
      void qc.invalidateQueries({ queryKey: ['pending-grade-submissions'] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Failed to submit grades for approval';
      void message.error(msg);
    },
  });

  // Request Revision (HOD)
  const requestRevisionMutation = useMutation({
    mutationFn: (reason: string) =>
      api
        .post('/grades/request-revision', {
          courseId: selectedCourseId,
          periodId: selectedPeriodId,
          reason,
        })
        .then((r: any) => r.data),
    onSuccess: () => {
      void message.success('Revision requested with moderation feedback sent to lecturer.');
      setRevisionModalOpen(false);
      setRevisionReason('');
      void qc.invalidateQueries({
        queryKey: ['course-grading-sheet', selectedCourseId, selectedPeriodId],
      });
      void qc.invalidateQueries({ queryKey: ['pending-grade-submissions'] });
      void qc.invalidateQueries({ queryKey: ['my-assigned-courses'] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Failed to request revision';
      void message.error(msg);
    },
  });

  // Approve & Publish (HOD / Admin)
  const publishMutation = useMutation({
    mutationFn: (force: boolean) =>
      api
        .post('/grades/publish', {
          courseId: selectedCourseId,
          periodId: selectedPeriodId,
          force,
        })
        .then((r: any) => r.data?.data ?? r.data),
    onSuccess: (data: any) => {
      if (data?.warning && data?.affectedStudents?.length) {
        setPublishWarning(data.affectedStudents.map((s: any) => s.studentId));
      } else {
        void message.success(
          'Grades successfully approved, published to transcripts, and notifications dispatched.',
        );
        setPublishWarning(null);
        void qc.invalidateQueries({
          queryKey: ['course-grading-sheet', selectedCourseId, selectedPeriodId],
        });
        void qc.invalidateQueries({ queryKey: ['pending-grade-submissions'] });
        void qc.invalidateQueries({ queryKey: ['my-assigned-courses'] });
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Failed to publish grades';
      void message.error(msg);
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers & Helpers
  // ---------------------------------------------------------------------------

  const handleScoreChange = (studentId: string, componentId: string, value: number | null) => {
    setEditedScores((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [componentId]: value,
      },
    }));
    setHasUnsavedChanges(true);
  };

  const handleSaveAll = () => {
    if (!sheet?.components) return;
    const flatList: Array<{ studentId: string; componentId: string; score: number | null }> = [];
    for (const [studentId, compMap] of Object.entries(editedScores)) {
      for (const [componentId, score] of Object.entries(compMap)) {
        flatList.push({ studentId, componentId, score });
      }
    }
    batchSaveMutation.mutate(flatList);
  };

  const handleSubmitGrades = async () => {
    if (hasUnsavedChanges && sheet?.components) {
      const flatList: Array<{ studentId: string; componentId: string; score: number | null }> = [];
      for (const [studentId, compMap] of Object.entries(editedScores)) {
        for (const [componentId, score] of Object.entries(compMap)) {
          flatList.push({ studentId, componentId, score });
        }
      }
      try {
        await batchSaveMutation.mutateAsync(flatList);
      } catch {
        return;
      }
    }
    submitMutation.mutate();
  };

  const sheetStatus = sheet?.status || 'draft';
  const isPeriodLocked = sheet?.period?.isLocked || false;
  const isLockedForTeacher =
    sheetStatus === 'pending_approval' || sheetStatus === 'published' || isPeriodLocked;

  // ---------------------------------------------------------------------------
  // Render: Student View
  // ---------------------------------------------------------------------------
  if (isStudent) {
    const transcriptCols: ColumnsType<FinalGrade> = [
      {
        title: 'Course Code',
        dataIndex: ['course', 'code'],
        key: 'code',
        render: (c: string) => <Text strong>{c}</Text>,
      },
      { title: 'Course Name', dataIndex: ['course', 'name'], key: 'course' },
      {
        title: 'Credits',
        dataIndex: ['course', 'credit_hours'],
        key: 'credits',
        align: 'center',
      },
      { title: 'Academic Period', dataIndex: ['academicPeriod', 'name'], key: 'period' },
      {
        title: 'Final Score',
        dataIndex: 'final_score',
        key: 'score',
        render: (s: number) => <Text strong>{Number(s).toFixed(1)}%</Text>,
      },
      {
        title: 'Letter Grade',
        dataIndex: 'letter_grade',
        key: 'grade',
        render: (g: string) => <Tag color={getGradeColor(g)}>{g}</Tag>,
      },
      {
        title: 'Grade Points',
        dataIndex: 'grade_points',
        key: 'gpa',
        render: (gp: number) => Number(gp).toFixed(2),
      },
    ];

    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 0' }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          <BookOutlined style={{ marginRight: 8, color: '#1677ff' }} />
          Official Academic Transcript
        </Title>
        <Paragraph type="secondary">
          Certified record of all published course grades and cumulative grade point average (GPA).
        </Paragraph>

        {gpaData && (
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            <Col xs={24} sm={12} md={8}>
              <Card bordered style={{ borderLeft: '4px solid #52c41a' }}>
                <Statistic
                  title="Cumulative GPA"
                  value={gpaData.gpa.toFixed(2)}
                  precision={2}
                  valueStyle={{ color: '#52c41a', fontWeight: 'bold' }}
                  suffix="/ 4.00"
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Card bordered style={{ borderLeft: '4px solid #1677ff' }}>
                <Statistic
                  title="Completed Courses"
                  value={transcript?.length ?? 0}
                  prefix={<CheckCircleOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Card bordered style={{ borderLeft: '4px solid #722ed1' }}>
                <Statistic
                  title="Total Credit Hours"
                  value={(transcript ?? []).reduce(
                    (sum, t) => sum + (t.course?.credit_hours || 0),
                    0,
                  )}
                  prefix={<BookOutlined />}
                />
              </Card>
            </Col>
          </Row>
        )}

        <Card title="Published Course Grades" bordered>
          <Table
            dataSource={transcript ?? []}
            columns={transcriptCols}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            expandable={{
              expandedRowRender: (r: FinalGrade) => (
                <StudentCourseBreakdown courseId={r.course_id} periodId={r.academic_period_id} />
              ),
              rowExpandable: () => true,
            }}
          />
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Guardian / Parent View
  // ---------------------------------------------------------------------------
  if (isParent) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 0' }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          <UserOutlined style={{ marginRight: 8, color: '#1677ff' }} />
          Student Academic Performance
        </Title>
        <Paragraph type="secondary">
          View official approved grades, term assessments, and GPA for your registered students.
        </Paragraph>

        {(guardianStudents ?? []).map((student: any) => (
          <Card
            key={student.id}
            title={
              <Space>
                <Text strong>{student.student_number} — {student.full_legal_name}</Text>
                <Tag color="blue">{student.programme?.name || 'Academic Programme'}</Tag>
              </Space>
            }
            style={{ marginBottom: 20 }}
          >
            <Table
              dataSource={student.grades ?? []}
              rowKey="id"
              pagination={false}
              columns={[
                { title: 'Course Code', dataIndex: ['course', 'code'], key: 'code' },
                { title: 'Course Name', dataIndex: ['course', 'name'], key: 'name' },
                { title: 'Period', dataIndex: ['academicPeriod', 'name'], key: 'period' },
                {
                  title: 'Final Score',
                  dataIndex: 'final_score',
                  key: 'score',
                  render: (s: number) => `${Number(s).toFixed(1)}%`,
                },
                {
                  title: 'Grade',
                  dataIndex: 'letter_grade',
                  key: 'grade',
                  render: (g: string) => <Tag color={getGradeColor(g)}>{g}</Tag>,
                },
                {
                  title: 'Points',
                  dataIndex: 'grade_points',
                  key: 'gpa',
                  render: (gp: number) => Number(gp).toFixed(2),
                },
              ]}
            />
          </Card>
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Lecturer / HOD / Admin View
  // ---------------------------------------------------------------------------

  const componentsList = sheet?.components || [];
  const rosterData = sheet?.roster || [];

  const rosterColumns: ColumnsType<any> = [
    {
      title: '#',
      key: 'idx',
      width: 50,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: 'Student ID',
      dataIndex: 'studentNumber',
      key: 'studentNumber',
      width: 130,
      render: (num: string) => <Text code>{num}</Text>,
    },
    {
      title: 'Student Legal Name',
      dataIndex: 'studentName',
      key: 'studentName',
      width: 220,
      render: (name: string) => <Text strong>{name}</Text>,
    },
    ...componentsList.map((comp) => ({
      title: (
        <div>
          <div>{comp.name}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Weight: {comp.weight}% {comp.isMandatory ? '(Mandatory)' : ''}
          </Text>
        </div>
      ),
      key: comp.id,
      width: 160,
      render: (_: any, record: any) => {
        const studentScores = editedScores[record.studentId] || {};
        const currentScore =
          studentScores[comp.id] !== undefined
            ? studentScores[comp.id]
            : record.scores?.[comp.id] ?? null;

        return (
          <InputNumber
            min={0}
            max={100}
            step={0.5}
            placeholder="Score (0-100)"
            value={currentScore ?? undefined}
            disabled={isLockedForTeacher}
            onChange={(val) => handleScoreChange(record.studentId, comp.id, val)}
            style={{ width: '100%' }}
          />
        );
      },
    })),
    {
      title: 'Total Score',
      key: 'liveTotal',
      width: 120,
      align: 'center' as const,
      render: (_: any, record: any) => {
        const studentScores = editedScores[record.studentId] || {};
        let total = 0;
        let hasAny = false;
        for (const comp of componentsList) {
          const sc =
            studentScores[comp.id] !== undefined
              ? studentScores[comp.id]
              : record.scores?.[comp.id] ?? null;
          if (sc !== null && sc !== undefined) {
            hasAny = true;
            total += (Number(sc) * Number(comp.weight)) / 100;
          }
        }
        if (!hasAny) return <Text type="secondary">—</Text>;
        const rounded = Math.round(total * 100) / 100;
        return <Text strong>{rounded.toFixed(2)}%</Text>;
      },
    },
    {
      title: 'Projected Grade',
      key: 'liveGrade',
      width: 130,
      align: 'center' as const,
      render: (_: any, record: any) => {
        const studentScores = editedScores[record.studentId] || {};
        let total = 0;
        let hasAny = false;
        for (const comp of componentsList) {
          const sc =
            studentScores[comp.id] !== undefined
              ? studentScores[comp.id]
              : record.scores?.[comp.id] ?? null;
          if (sc !== null && sc !== undefined) {
            hasAny = true;
            total += (Number(sc) * Number(comp.weight)) / 100;
          }
        }
        if (!hasAny) return <Tag color="default">Unset</Tag>;
        const rounded = Math.round(total * 100) / 100;
        const letter = calculateGradeLetter(rounded);
        return <Tag color={getGradeColor(letter)}>{letter}</Tag>;
      },
    },
    {
      title: 'Points',
      key: 'livePoints',
      width: 90,
      align: 'center' as const,
      render: (_: any, record: any) => {
        const studentScores = editedScores[record.studentId] || {};
        let total = 0;
        let hasAny = false;
        for (const comp of componentsList) {
          const sc =
            studentScores[comp.id] !== undefined
              ? studentScores[comp.id]
              : record.scores?.[comp.id] ?? null;
          if (sc !== null && sc !== undefined) {
            hasAny = true;
            total += (Number(sc) * Number(comp.weight)) / 100;
          }
        }
        if (!hasAny) return <Text type="secondary">—</Text>;
        const rounded = Math.round(total * 100) / 100;
        return <Text>{calculateGradePoints(rounded).toFixed(2)}</Text>;
      },
    },
  ];

  const courseOptions = useMemo(() => {
    if (isLecturer && myCourses) {
      return myCourses.map((c) => ({
        value: c.courseId,
        label: `${c.courseCode} — ${c.courseName} (${c.enrolledCount} enrolled)`,
        periodId: c.academicPeriodId,
      }));
    }
    if (isDeptHead && deptCourses) {
      return deptCourses.map((c: any) => ({
        value: c.id,
        label: `${c.code} — ${c.name}`,
        periodId: selectedPeriodId,
      }));
    }
    return (myCourses ?? []).map((c) => ({
      value: c.courseId,
      label: `${c.courseCode} — ${c.courseName}`,
      periodId: c.academicPeriodId,
    }));
  }, [isLecturer, isDeptHead, myCourses, deptCourses, selectedPeriodId]);

  return (
    <div style={{ padding: '4px 0' }}>
      {/* Page Header */}
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 2 }}>
          <FileTextOutlined style={{ marginRight: 8, color: '#1677ff' }} />
          Course Grading & Academic Moderation Workspace
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {isLecturer
            ? 'Enter assessment scores for enrolled students, save drafts, and submit to the Head of Department for review.'
            : isDeptHead
            ? 'Review submitted course grade sheets from lecturers, moderate marks, request revisions, or approve & publish.'
            : 'Academic grade management, two-step moderation approval lifecycle, and transcript administration.'}
        </Paragraph>
      </div>

      {/* Tabs for HOD / Admin */}
      {(isDeptHead || isAdminOrSuper) && (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'sheet',
              label: (
                <span>
                  <EditOutlined /> Course Grade Sheet View
                </span>
              ),
            },
            {
              key: 'queue',
              label: (
                <span>
                  <ClockCircleOutlined /> Pending Moderation Queue{' '}
                  <Badge
                    count={pendingSubmissions?.length ?? 0}
                    style={{ backgroundColor: '#fa8c16', marginLeft: 4 }}
                  />
                </span>
              ),
            },
          ]}
        />
      )}

      {/* HOD Pending Queue Tab */}
      {activeTab === 'queue' && (isDeptHead || isAdminOrSuper) ? (
        <Card title="Course Submissions Awaiting Department Head Moderation" bordered>
          <Table
            dataSource={pendingSubmissions ?? []}
            rowKey={(r) => `${r.courseId}:${r.academicPeriodId}`}
            loading={pendingLoading}
            columns={[
              {
                title: 'Course',
                key: 'course',
                render: (_: any, r: PendingGradeSubmission) => (
                  <div>
                    <Text strong>
                      {r.courseCode} — {r.courseName}
                    </Text>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {r.departmentName} • {r.creditHours} Credit Hours
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
                render: (d: string) => (d ? new Date(d).toLocaleString() : 'Recent'),
              },
              {
                title: 'Status',
                key: 'status',
                render: () => <Tag color="gold">Pending HOD Review</Tag>,
              },
              {
                title: 'Actions',
                key: 'actions',
                render: (_: any, r: PendingGradeSubmission) => (
                  <Button
                    type="primary"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setSelectedCourseId(r.courseId);
                      setSelectedPeriodId(r.academicPeriodId);
                      setActiveTab('sheet');
                    }}
                  >
                    Moderate & Review
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      ) : (
        /* Grade Sheet Tab */
        <>
          {/* Top Selection & Filter Toolbar */}
          <Card bordered style={{ marginBottom: 16 }}>
            <Row gutter={[16, 16]} align="middle">
              <Col xs={24} md={10}>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>
                  Select Course:
                </Text>
                <Select
                  showSearch
                  placeholder="Select course to enter or moderate grades..."
                  value={selectedCourseId}
                  onChange={(val) => {
                    setSelectedCourseId(val);
                    const opt = courseOptions.find((o) => o.value === val);
                    if (opt?.periodId) setSelectedPeriodId(opt.periodId);
                  }}
                  options={courseOptions}
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  style={{ width: '100%' }}
                />
              </Col>

              <Col xs={24} md={8}>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>
                  Academic Period:
                </Text>
                <Select
                  placeholder="Select academic period..."
                  value={selectedPeriodId}
                  onChange={(val) => setSelectedPeriodId(val)}
                  options={(periods ?? []).map((p) => ({
                    value: p.id,
                    label: `${p.name} ${p.is_locked ? '🔒 (Locked)' : ''}`,
                  }))}
                  style={{ width: '100%' }}
                />
              </Col>

              <Col xs={24} md={6} style={{ textAlign: 'right' }}>
                <Button onClick={() => refetchSheet()} loading={sheetLoading}>
                  Refresh Sheet
                </Button>
              </Col>
            </Row>
          </Card>

          {/* Missing scores warning alert */}
          {publishWarning && (
            <Alert
              type="warning"
              showIcon
              message={`${publishWarning.length} students are missing mandatory assessment scores.`}
              description={
                <div style={{ marginTop: 8 }}>
                  <Text>
                    Affected student records must have scores entered before publication, or you can
                    force publication if approved.
                  </Text>
                  <div style={{ marginTop: 8 }}>
                    <Button
                      type="primary"
                      danger
                      size="small"
                      loading={publishMutation.isPending}
                      onClick={() => publishMutation.mutate(true)}
                    >
                      Publish Anyway (Force)
                    </Button>
                    <Button
                      size="small"
                      style={{ marginLeft: 8 }}
                      onClick={() => setPublishWarning(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              }
              style={{ marginBottom: 16 }}
            />
          )}

          {/* Active Course Sheet Details & Workflow Action Header */}
          {sheet && (
            <Card
              bordered
              style={{
                marginBottom: 16,
                backgroundColor:
                  sheetStatus === 'revision_requested'
                    ? '#fff2f0'
                    : sheetStatus === 'pending_approval'
                    ? '#fffbe6'
                    : sheetStatus === 'published'
                    ? '#f6ffed'
                    : '#ffffff',
              }}
            >
              <Row gutter={[16, 16]} align="middle" justify="space-between">
                <Col xs={24} md={14}>
                  <Space direction="vertical" size={2}>
                    <Space align="center">
                      <Title level={4} style={{ margin: 0 }}>
                        {sheet.course.code} — {sheet.course.name}
                      </Title>
                      {sheetStatus === 'draft' && (
                        <Tag color="cyan">Draft (Lecturer Editing)</Tag>
                      )}
                      {sheetStatus === 'pending_approval' && (
                        <Tag color="gold" icon={<ClockCircleOutlined />}>
                          Pending HOD Approval
                        </Tag>
                      )}
                      {sheetStatus === 'revision_requested' && (
                        <Tag color="error" icon={<ExclamationCircleOutlined />}>
                          Revision Requested by HOD
                        </Tag>
                      )}
                      {sheetStatus === 'published' && (
                        <Tag color="success" icon={<CheckCircleOutlined />}>
                          Approved & Published
                        </Tag>
                      )}
                    </Space>
                    <Text type="secondary">
                      Period: <Text strong>{sheet.period.name}</Text> • Enrolled Students:{' '}
                      <Text strong>{rosterData.length}</Text> • Credit Hours:{' '}
                      <Text strong>{sheet.course.creditHours}</Text>
                    </Text>
                  </Space>
                </Col>

                {/* Workflow Buttons */}
                <Col xs={24} md={10} style={{ textAlign: 'right' }}>
                  <Space wrap>
                    {/* Lecturer Actions */}
                    {!isLockedForTeacher && (isLecturer || isAdminOrSuper) && (
                      <>
                        <Button
                          icon={<SaveOutlined />}
                          onClick={handleSaveAll}
                          loading={batchSaveMutation.isPending}
                        >
                          Save Draft
                        </Button>

                        <Popconfirm
                          title="Submit Course Grades to Head of Department?"
                          description="This will lock grade editing and submit all marks to the HOD for verification."
                          okText="Submit for Review"
                          cancelText="Cancel"
                          onConfirm={() => {
                            void handleSubmitGrades();
                          }}
                        >
                          <Button
                            type="primary"
                            icon={<SendOutlined />}
                            loading={submitMutation.isPending}
                          >
                            Submit to HOD
                          </Button>
                        </Popconfirm>
                      </>
                    )}

                    {/* HOD Actions */}
                    {(isDeptHead || isAdminOrSuper) && sheetStatus !== 'published' && (
                      <>
                        <Button
                          danger
                          icon={<RollbackOutlined />}
                          onClick={() => setRevisionModalOpen(true)}
                        >
                          Request Revision
                        </Button>

                        <Popconfirm
                          title="Approve & Publish Grades?"
                          description="This will finalize scores, calculate student GPAs, update transcripts, and notify students & guardians."
                          okText="Approve & Publish"
                          cancelText="Cancel"
                          onConfirm={() => publishMutation.mutate(false)}
                        >
                          <Button
                            type="primary"
                            style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                            icon={<CheckCircleOutlined />}
                            loading={publishMutation.isPending}
                          >
                            Approve & Publish
                          </Button>
                        </Popconfirm>
                      </>
                    )}
                  </Space>
                </Col>
              </Row>

              {/* Status Alert Banners */}
              {sheetStatus === 'revision_requested' && (
                <Alert
                  type="error"
                  showIcon
                  icon={<ExclamationCircleOutlined />}
                  message="Department Head Moderation Feedback"
                  description={
                    <div>
                      <Paragraph style={{ marginBottom: 4, fontWeight: 'bold' }}>
                        "{sheet.moderationNote || 'Please review entered component marks and re-submit.'}"
                      </Paragraph>
                      <Text type="secondary">
                        Action required: Edit the scores in the table below, then click "Submit to HOD" once adjustments are complete.
                      </Text>
                    </div>
                  }
                  style={{ marginTop: 12 }}
                />
              )}

              {sheetStatus === 'pending_approval' && (
                <Alert
                  type="info"
                  showIcon
                  icon={<ClockCircleOutlined />}
                  message="Grades Under Review"
                  description="Grades have been submitted and are currently awaiting review by the Head of Department. Grade editing is locked."
                  style={{ marginTop: 12 }}
                />
              )}

              {sheetStatus === 'published' && (
                <Alert
                  type="success"
                  showIcon
                  icon={<CheckCircleOutlined />}
                  message="Grades Published"
                  description="Grades have been verified by the Department Head and officially published to student transcripts. Notifications have been dispatched."
                  style={{ marginTop: 12 }}
                />
              )}

              {isPeriodLocked && (
                <Alert
                  type="warning"
                  showIcon
                  message="Academic Period is Locked"
                  description="This academic period is locked for grading operations. No new marks can be entered or modified."
                  style={{ marginTop: 12 }}
                />
              )}
            </Card>
          )}

          {/* Roster & Grade Input Table */}
          <Card
            title={
              <Space>
                <span>Enrolled Student Roster & Assessment Marks</span>
                {hasUnsavedChanges && <Tag color="warning">Unsaved Changes</Tag>}
              </Space>
            }
            extra={
              !isLockedForTeacher && (isLecturer || isAdminOrSuper) ? (
                <Button
                  type="dashed"
                  size="small"
                  icon={<SaveOutlined />}
                  onClick={handleSaveAll}
                  loading={batchSaveMutation.isPending}
                >
                  Save All
                </Button>
              ) : null
            }
            bordered
          >
            {sheetLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Text type="secondary">Loading course grading sheet...</Text>
              </div>
            ) : rosterData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Text type="secondary">
                  No enrolled students found for this course in the selected academic period.
                </Text>
              </div>
            ) : (
              <Table
                dataSource={rosterData}
                columns={rosterColumns}
                rowKey="studentId"
                pagination={false}
                bordered
                scroll={{ x: 'max-content' }}
              />
            )}
          </Card>
        </>
      )}

      {/* Modal: HOD Request Revision */}
      <Modal
        title={
          <span>
            <RollbackOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
            Request Grade Revision from Lecturer
          </span>
        }
        open={revisionModalOpen}
        onOk={() => {
          if (!revisionReason.trim()) {
            void message.warning('Please enter moderation feedback or instructions.');
            return;
          }
          requestRevisionMutation.mutate(revisionReason);
        }}
        confirmLoading={requestRevisionMutation.isPending}
        onCancel={() => {
          setRevisionModalOpen(false);
          setRevisionReason('');
        }}
        okText="Send Revision Request"
        okButtonProps={{ danger: true }}
      >
        <Paragraph type="secondary">
          Enter specific feedback or instructions for the lecturer. The course grade sheet will be
          returned to draft status with this note displayed prominently to the teacher.
        </Paragraph>
        <Input.TextArea
          rows={4}
          placeholder="e.g. Please verify question 4 score distribution or check continuous assessment weightings..."
          value={revisionReason}
          onChange={(e) => setRevisionReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}

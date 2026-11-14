import React from 'react';
import { Card, Typography, Tabs, Table, Tag, Statistic, Row, Col } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

interface LinkedStudentData {
  student_id: string;
  student_number: string;
  full_name: string;
  status: string;
  outstanding_fee_balance: number;
  programme?: { name: string };
}

export default function GuardianDashboard() {
  const { user } = useAuth();

  const { data: linkedStudents, isLoading } = useQuery({
    queryKey: ['guardian-students', user?.id],
    queryFn: () =>
      api.get<{ success: boolean; data: LinkedStudentData[] }>('/guardians/me/students')
        .then(r => r.data.data),
    enabled: !!user?.id,
  });

  const students = linkedStudents ?? [];

  return (
    <div>
      <Typography.Title level={4}>Guardian Portal</Typography.Title>
      {students.map(s => (
        <Card key={s.student_id} title={s.full_name} style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Statistic title="Student Number" value={s.student_number} />
            </Col>
            <Col span={8}>
              <Statistic title="Programme" value={s.programme?.name ?? '—'} />
            </Col>
            <Col span={8}>
              <Statistic
                title="Outstanding Fees"
                value={s.outstanding_fee_balance}
                precision={2}
                prefix="ETB"
                valueStyle={{ color: s.outstanding_fee_balance > 0 ? '#cf1322' : '#3f8600' }}
              />
            </Col>
          </Row>
          <Tag color={s.status === 'active' ? 'green' : 'red'} style={{ marginTop: 8 }}>
            {s.status}
          </Tag>
        </Card>
      ))}
      {students.length === 0 && (
        <Typography.Text type="secondary">No linked students found.</Typography.Text>
      )}
    </div>
  );
}

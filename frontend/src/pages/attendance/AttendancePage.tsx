import React, { useState } from 'react';
import {
  Table, Button, Typography, Select, Form, Radio, message,
  Card, Progress, Tag, Space, Modal, InputNumber, Alert
} from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useRbac } from '../../hooks/useRbac';
import type { AttendanceRecord } from '../../types';
import type { ColumnsType } from 'antd/es/table';

interface AttendanceSummary {
  percentage: number;
  present: number;
  late: number;
  absent: number;
  total: number;
}

interface MarkRecord {
  student_id: string;
  status: 'present' | 'absent' | 'late';
}

export default function AttendancePage() {
  const { user } = useAuth();
  const { can } = useRbac();
  const qc = useQueryClient();
  const isStudent = user?.role === 'student';
  const [sessionId, setSessionId] = useState('');
  const [markRecords, setMarkRecords] = useState<MarkRecord[]>([]);
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [thresholdVal, setThresholdVal] = useState<number>(75);

  const { data: attendanceData } = useQuery({
    queryKey: ['attendance'],
    queryFn: () =>
      api.get<{ success: boolean; data: AttendanceRecord[] }>('/attendance')
        .then(r => r.data.data),
  });

  const { data: threshold } = useQuery({
    queryKey: ['attendance-threshold'],
    queryFn: () =>
      api.get<{ success: boolean; data: { threshold: number } }>('/attendance/config/threshold')
        .then(r => r.data.data),
  });

  const markMutation = useMutation({
    mutationFn: ({ sid, records }: { sid: string; records: MarkRecord[] }) =>
      api.post('/attendance/mark', { sessionId: sid, records }).then(r => r.data),
    onSuccess: () => {
      void message.success('Attendance marked');
      void qc.invalidateQueries({ queryKey: ['attendance'] });
      setMarkRecords([]);
      setSessionId('');
    },
    onError: () => { void message.error('Failed to mark attendance'); },
  });

  const amendMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/attendance/${id}`, { status }).then(r => r.data),
    onSuccess: () => {
      void message.success('Record amended');
      void qc.invalidateQueries({ queryKey: ['attendance'] });
    },
  });

  const thresholdMutation = useMutation({
    mutationFn: (value: number) =>
      api.put('/attendance/config/threshold', { threshold: value }).then(r => r.data),
    onSuccess: () => {
      void message.success('Threshold updated');
      setThresholdOpen(false);
      void qc.invalidateQueries({ queryKey: ['attendance-threshold'] });
    },
  });

  const records = attendanceData ?? [];

  const cols: ColumnsType<AttendanceRecord> = [
    { title: 'Session', dataIndex: 'session_id', key: 'session' },
    { title: 'Student', dataIndex: 'student_id', key: 'student' },
    {
      title: 'Status', dataIndex: 'status', key: 'status',
      render: (s: string) => (
        <Tag color={s === 'present' ? 'green' : s === 'late' ? 'orange' : 'red'}>{s}</Tag>
      ),
    },
    { title: 'Recorded', dataIndex: 'recorded_at', key: 'date', render: (d: string) => new Date(d).toLocaleString() },
    ...(can('attendance', 'amend') ? [{
      title: 'Amend', key: 'amend',
      render: (_: unknown, r: AttendanceRecord) => (
        <Select
          size="small"
          defaultValue={r.status}
          options={[
            { value: 'present', label: 'Present' },
            { value: 'absent', label: 'Absent' },
            { value: 'late', label: 'Late' },
          ]}
          onChange={(val: string) => amendMutation.mutate({ id: r.id, status: val })}
          style={{ width: 100 }}
        />
      ),
    }] : []),
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>Attendance</Typography.Title>
        <Space>
          {can('profile', 'update') && (
            <Button onClick={() => setThresholdOpen(true)}>
              Configure Threshold ({threshold?.threshold ?? 75}%)
            </Button>
          )}
          {can('attendance', 'mark') && (
            <Button type="primary" onClick={() => Modal.confirm({
              title: 'Mark Attendance',
              width: 500,
              content: (
                <Form layout="vertical">
                  <Form.Item label="Session ID">
                    <input
                      id="session-id-input"
                      className="ant-input"
                      placeholder="Session UUID"
                    />
                  </Form.Item>
                  <p>Use the Attendance API to submit bulk attendance records for a session.</p>
                </Form>
              ),
              onOk: () => {
                const el = document.getElementById('session-id-input') as HTMLInputElement;
                if (el?.value) {
                  markMutation.mutate({ sid: el.value, records: markRecords });
                }
              },
            })}>Mark Attendance</Button>
          )}
        </Space>
      </Space>

      <Table
        dataSource={records}
        columns={cols}
        rowKey="id"
        pagination={{ pageSize: 20 }}
      />

      {/* Threshold config modal */}
      <Modal
        title="Set Attendance Warning Threshold"
        open={thresholdOpen}
        onCancel={() => setThresholdOpen(false)}
        onOk={() => thresholdMutation.mutate(thresholdVal)}
        confirmLoading={thresholdMutation.isPending}
      >
        <p>Enter a percentage between 50 and 100. Students below this threshold will receive a warning notification.</p>
        <InputNumber
          min={50}
          max={100}
          value={thresholdVal}
          onChange={(v) => setThresholdVal(v ?? 75)}
          addonAfter="%"
          style={{ width: '100%' }}
        />
      </Modal>
    </div>
  );
}

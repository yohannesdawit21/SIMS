import React, { useState } from 'react';
import { Table, Button, Typography, Tag, Select, Input, Row, Col, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/axios';
import type { NotificationLog } from '../../types';
import type { ColumnsType } from 'antd/es/table';

interface NotifResponse {
  data: NotificationLog[];
  total: number;
  page: number;
  limit: number;
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['notification-logs', status, type, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (type) params.set('type', type);
      params.set('page', String(page));
      params.set('limit', '20');
      // ResponseInterceptor wraps as { success, data: NotifResponse, meta }
      const res = await api.get<{ success: boolean; data: NotifResponse }>(
        `/notifications/logs?${params.toString()}`,
      );
      return res.data.data; // NotifResponse: { data, total, page, limit }
    },
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) =>
      api.post<{ success: boolean }>(`/notifications/retry/${id}`).then(r => r.data),
    onSuccess: () => {
      void message.success('Notification re-queued');
      void qc.invalidateQueries({ queryKey: ['notification-logs'] });
    },
    onError: () => void message.error('Retry failed'),
  });

  const columns: ColumnsType<NotificationLog> = [
    { title: 'Type', dataIndex: 'notification_type', key: 'type', ellipsis: true },
    {
      title: 'Channel', dataIndex: 'channel', key: 'channel', width: 90,
      render: (c: string) => (
        <Tag color={c === 'email' ? 'blue' : 'purple'}>{c}</Tag>
      ),
    },
    { title: 'Trigger Event', dataIndex: 'trigger_event', key: 'trigger', ellipsis: true },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 90,
      render: (s: string) => (
        <Tag color={s === 'sent' ? 'green' : s === 'failed' ? 'red' : 'orange'}>
          {s}
        </Tag>
      ),
    },
    { title: 'Attempts', dataIndex: 'attempt_count', key: 'attempts', width: 85 },
    {
      title: 'Dispatched', dataIndex: 'dispatched_at', key: 'dispatched', width: 160,
      render: (d: string | null) => d ? new Date(d).toLocaleString() : '—',
    },
    {
      title: 'Created', dataIndex: 'created_at', key: 'created', width: 160,
      render: (d: string) => new Date(d).toLocaleString(),
    },
    {
      title: '', key: 'actions', width: 80,
      render: (_: unknown, r: NotificationLog) =>
        r.status === 'failed' ? (
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={retryMutation.isPending}
            onClick={() => retryMutation.mutate(r.id)}
          >
            Retry
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <Typography.Title level={4}>Notification Log</Typography.Title>

      <Row gutter={8} style={{ marginBottom: 16 }}>
        <Col>
          <Select
            placeholder="Filter by status"
            allowClear
            style={{ width: 160 }}
            onChange={v => { setStatus(v ?? ''); setPage(1); }}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'sent', label: 'Sent' },
              { value: 'failed', label: 'Failed' },
            ]}
          />
        </Col>
        <Col>
          <Input
            placeholder="Filter by type"
            style={{ width: 200 }}
            value={type}
            onChange={e => { setType(e.target.value); setPage(1); }}
            allowClear
          />
        </Col>
      </Row>

      <Table
        dataSource={data?.data ?? []}
        columns={columns}
        rowKey="id"
        loading={isLoading}
        pagination={{
          current: page,
          total: data?.total ?? 0,
          pageSize: 20,
          onChange: (p) => setPage(p),
          showTotal: (total) => `${total} total`,
        }}
        size="small"
        scroll={{ x: 900 }}
      />
    </div>
  );
}

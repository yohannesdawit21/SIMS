import React, { useState } from 'react';
import { Table, Typography, Select, Input, Row, Col, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/axios';
import type { AuditLog } from '../../types';
import type { ColumnsType } from 'antd/es/table';

interface AuditResponse {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

export default function AuditPage() {
  const [actor, setActor] = useState('');
  const [recordType, setRecordType] = useState('');
  const [operation, setOperation] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', actor, recordType, operation, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (actor) params.set('actor', actor);
      if (recordType) params.set('recordType', recordType);
      if (operation) params.set('operation', operation);
      params.set('page', String(page));
      params.set('limit', '20');
      // ResponseInterceptor wraps as { success, data: AuditResponse, meta }
      const res = await api.get<{ success: boolean; data: AuditResponse }>(
        `/audit?${params.toString()}`,
      );
      return res.data.data; // AuditResponse: { data, total, page, limit }
    },
  });

  const columns: ColumnsType<AuditLog> = [
    {
      title: 'Timestamp', dataIndex: 'created_at', key: 'ts', width: 180,
      render: (d: string) => new Date(d).toLocaleString(),
    },
    { title: 'Actor ID', dataIndex: 'actor_id', key: 'actor', ellipsis: true, width: 130 },
    {
      title: 'Operation', dataIndex: 'operation', key: 'op', width: 110,
      render: (o: string) => (
        <Tag color={o === 'create' ? 'green' : o === 'update' ? 'blue' : 'red'}>
          {o.toUpperCase()}
        </Tag>
      ),
    },
    { title: 'Record Type', dataIndex: 'record_type', key: 'type', width: 170 },
    { title: 'Record ID', dataIndex: 'record_id', key: 'rid', ellipsis: true, width: 130 },
    {
      title: 'Changes', key: 'changes',
      render: (_: unknown, r: AuditLog) => {
        if (!r.previous_values && !r.new_values) return '—';
        const snippet = r.new_values
          ? JSON.stringify(r.new_values).slice(0, 80)
          : JSON.stringify(r.previous_values).slice(0, 80);
        return <small style={{ color: '#888' }}>{snippet}…</small>;
      },
    },
  ];

  return (
    <div>
      <Typography.Title level={4}>Audit Log</Typography.Title>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Read-only tamper-evident audit trail. No modifications permitted.
      </Typography.Text>

      <Row gutter={8} style={{ marginBottom: 16 }}>
        <Col>
          <Input
            placeholder="Filter by actor ID"
            value={actor}
            onChange={e => { setActor(e.target.value); setPage(1); }}
            style={{ width: 200 }}
            allowClear
          />
        </Col>
        <Col>
          <Input
            placeholder="Filter by record type"
            value={recordType}
            onChange={e => { setRecordType(e.target.value); setPage(1); }}
            style={{ width: 180 }}
            allowClear
          />
        </Col>
        <Col>
          <Select
            placeholder="Operation"
            allowClear
            style={{ width: 140 }}
            onChange={(v) => { setOperation(v ?? ''); setPage(1); }}
            options={[
              { value: 'create', label: 'Create' },
              { value: 'update', label: 'Update' },
              { value: 'delete', label: 'Delete' },
            ]}
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
          showTotal: (total) => `${total} entries`,
        }}
        size="small"
        scroll={{ x: 900 }}
      />
    </div>
  );
}

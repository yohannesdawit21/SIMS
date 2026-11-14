import React, { useState } from 'react';
import {
  Table, Button, Typography, Tag, Space, Modal, Form,
  Input, InputNumber, message
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/axios';
import { RoleGate } from '../../components/RoleGate';
import type { Hostel, HostelAllocation } from '../../types';
import type { ColumnsType } from 'antd/es/table';

export default function HostelPage() {
  const qc = useQueryClient();
  const [allocOpen, setAllocOpen] = useState(false);
  const [terminateId, setTerminateId] = useState<string | null>(null);
  const [allocForm] = Form.useForm();
  const [termForm] = Form.useForm();
  const [tab, setTab] = useState<'rooms' | 'allocations'>('rooms');

  const { data: hostels } = useQuery({
    queryKey: ['hostels'],
    queryFn: () =>
      api.get<{ success: boolean; data: Hostel[] }>('/hostels').then(r => r.data.data),
  });

  const { data: allocations } = useQuery({
    queryKey: ['hostel-allocations'],
    queryFn: () =>
      api.get<{ success: boolean; data: HostelAllocation[] }>('/hostels/allocations')
        .then(r => r.data.data),
  });

  const allocMutation = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api.post('/hostels/allocations', v).then(r => r.data),
    onSuccess: () => {
      void message.success('Allocation created');
      setAllocOpen(false);
      allocForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['hostel-allocations'] });
    },
    onError: (e: unknown) => {
      const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === 'HOSTEL_CAPACITY_EXCEEDED') void message.error('Room is at full capacity');
      else void message.error('Allocation failed');
    },
  });

  const terminateMutation = useMutation({
    mutationFn: ({ id, ...rest }: Record<string, unknown>) =>
      api.patch(`/hostels/allocations/${id as string}/terminate`, rest).then(r => r.data),
    onSuccess: () => {
      void message.success('Allocation terminated');
      setTerminateId(null);
      void qc.invalidateQueries({ queryKey: ['hostel-allocations'] });
    },
  });

  const hostelCols: ColumnsType<Hostel> = [
    { title: 'Block', dataIndex: 'block_name', key: 'block' },
    { title: 'Room', dataIndex: 'room_number', key: 'room' },
    { title: 'Type', dataIndex: 'room_type', key: 'type', render: (v: unknown) => v ?? '—' },
    { title: 'Max Occupancy', dataIndex: 'max_occupancy', key: 'max' },
  ];

  const allocCols: ColumnsType<HostelAllocation> = [
    { title: 'Student', dataIndex: 'student_id', key: 'student' },
    { title: 'Block', dataIndex: ['hostel', 'block_name'], key: 'block', render: (v: unknown) => v ?? '—' },
    { title: 'Room', dataIndex: ['hostel', 'room_number'], key: 'room', render: (v: unknown) => v ?? '—' },
    { title: 'Start', dataIndex: 'start_date', key: 'start', render: (d: string) => new Date(d).toLocaleDateString() },
    { title: 'End', dataIndex: 'end_date', key: 'end', render: (d: string) => new Date(d).toLocaleDateString() },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, r: HostelAllocation) => (
        r.departure_date
          ? <Tag color="default">Terminated</Tag>
          : <Tag color="green">Active</Tag>
      ),
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: HostelAllocation) => (
        !r.departure_date && (
          <RoleGate feature="hostel_allocations" action="manage">
            <Button danger size="small" onClick={() => setTerminateId(r.id)}>Terminate</Button>
          </RoleGate>
        )
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>Hostel</Typography.Title>
        <Space>
          <Button type={tab === 'rooms' ? 'primary' : 'default'} onClick={() => setTab('rooms')}>Rooms</Button>
          <Button type={tab === 'allocations' ? 'primary' : 'default'} onClick={() => setTab('allocations')}>Allocations</Button>
          <RoleGate feature="hostel_allocations" action="manage">
            <Button icon={<PlusOutlined />} onClick={() => setAllocOpen(true)}>Allocate Student</Button>
          </RoleGate>
        </Space>
      </Space>

      {tab === 'rooms' && <Table dataSource={hostels ?? []} columns={hostelCols} rowKey="id" />}
      {tab === 'allocations' && <Table dataSource={allocations ?? []} columns={allocCols} rowKey="id" />}

      <Modal title="Allocate Student" open={allocOpen} onCancel={() => setAllocOpen(false)} onOk={() => allocForm.submit()} confirmLoading={allocMutation.isPending}>
        <Form form={allocForm} layout="vertical" onFinish={v => allocMutation.mutate(v)}>
          <Form.Item name="student_id" label="Student ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="hostel_id" label="Hostel Room ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="start_date" label="Start Date" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Form.Item name="end_date" label="End Date" rules={[{ required: true }]}><Input type="date" /></Form.Item>
        </Form>
      </Modal>

      <Modal title="Terminate Allocation" open={!!terminateId} onCancel={() => setTerminateId(null)} onOk={() => termForm.submit()} confirmLoading={terminateMutation.isPending}>
        <Form form={termForm} layout="vertical" onFinish={v => terminateMutation.mutate({ id: terminateId!, ...v })}>
          <Form.Item name="departure_date" label="Departure Date" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Form.Item name="departure_reason" label="Reason"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

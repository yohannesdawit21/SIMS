import React, { useState } from 'react';
import {
  Table, Button, Typography, Space, Modal, Form, Input, message
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/axios';
import type { ColumnsType } from 'antd/es/table';

interface Guardian {
  id: string;
  user_id: string;
  user?: { username: string; email: string };
}

export default function GuardianPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState<string | null>(null);
  const [createForm] = Form.useForm();
  const [linkForm] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['guardians'],
    queryFn: () =>
      api.get<{ success: boolean; data: Guardian[] }>('/guardians').then(r => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api.post('/guardians', v).then(r => r.data),
    onSuccess: () => {
      void message.success('Guardian account created');
      setCreateOpen(false);
      createForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['guardians'] });
    },
  });

  const linkMutation = useMutation({
    mutationFn: ({ guardianId, studentId }: { guardianId: string; studentId: string }) =>
      api.post(`/guardians/${guardianId}/link/${studentId}`).then(r => r.data),
    onSuccess: () => {
      void message.success('Guardian linked to student');
      setLinkOpen(null);
      linkForm.resetFields();
    },
  });

  const columns: ColumnsType<Guardian> = [
    { title: 'Username', dataIndex: ['user', 'username'], key: 'user', render: (v: unknown) => v ?? '—' },
    { title: 'Email', dataIndex: ['user', 'email'], key: 'email', render: (v: unknown) => v ?? '—' },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: Guardian) => (
        <Button size="small" onClick={() => { linkForm.resetFields(); setLinkOpen(r.id); }}>
          Link Student
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>Parent/Guardian Management</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          New Guardian
        </Button>
      </Space>

      <Table dataSource={data ?? []} columns={columns} rowKey="id" loading={isLoading} />

      <Modal title="Create Guardian Account" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => createForm.submit()} confirmLoading={createMutation.isPending}>
        <Form form={createForm} layout="vertical" onFinish={v => createMutation.mutate(v)}>
          <Form.Item name="full_name" label="Full Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}><Input /></Form.Item>
          <Form.Item name="phone" label="Phone" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="password" label="Initial Password" rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Link to Student" open={!!linkOpen} onCancel={() => setLinkOpen(null)} onOk={() => linkForm.submit()} confirmLoading={linkMutation.isPending}>
        <p>Linking requires explicit student consent which will be recorded in the audit log.</p>
        <Form form={linkForm} layout="vertical" onFinish={v =>
          linkMutation.mutate({ guardianId: linkOpen!, studentId: v.studentId as string })
        }>
          <Form.Item name="studentId" label="Student ID (UUID)" rules={[{ required: true }]}><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

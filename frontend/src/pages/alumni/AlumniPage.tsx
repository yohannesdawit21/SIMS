import React, { useState } from 'react';
import {
  Table, Button, Typography, Space, Modal, Form, Input, message, Tag
} from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/axios';
import { RoleGate } from '../../components/RoleGate';
import { useAuth } from '../../context/AuthContext';
import type { Alumni } from '../../types';
import type { ColumnsType } from 'antd/es/table';

export default function AlumniPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [placementId, setPlacementId] = useState<string | null>(null);
  const [editForm] = Form.useForm();
  const [placementForm] = Form.useForm();

  const { data: alumni, isLoading } = useQuery({
    queryKey: ['alumni'],
    queryFn: () =>
      api.get<{ success: boolean; data: Alumni[] }>('/alumni').then(r => r.data.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...rest }: Record<string, unknown>) =>
      api.patch(`/alumni/${id as string}/contact`, rest).then(r => r.data),
    onSuccess: () => {
      void message.success('Contact updated');
      setEditId(null);
      void qc.invalidateQueries({ queryKey: ['alumni'] });
    },
  });

  const placementMutation = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api.post('/alumni/placements', v).then(r => r.data),
    onSuccess: () => {
      void message.success('Placement recorded');
      setPlacementId(null);
      placementForm.resetFields();
    },
  });

  const columns: ColumnsType<Alumni> = [
    { title: 'Name', dataIndex: ['student', 'full_legal_name'], key: 'name', render: (v: unknown) => v ?? '—' },
    { title: 'Graduation', dataIndex: 'graduation_date', key: 'grad', render: (d: string) => new Date(d).toLocaleDateString() },
    { title: 'GPA', dataIndex: 'final_gpa', key: 'gpa', render: (v: unknown) => v ?? '—' },
    { title: 'Email', dataIndex: 'current_email', key: 'email', render: (v: unknown) => v ?? '—' },
    { title: 'Employer', dataIndex: 'employer', key: 'emp', render: (v: unknown) => v ?? '—' },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: Alumni) => (
        <Space>
          <Button size="small" onClick={() => { editForm.setFieldsValue(r); setEditId(r.id); }}>Edit Contact</Button>
          <RoleGate feature="alumni" action="manage">
            <Button size="small" onClick={() => { placementForm.setFieldValue('alumni_id', r.id); setPlacementId(r.id); }}>Add Placement</Button>
          </RoleGate>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4}>Alumni</Typography.Title>
      <Table dataSource={alumni ?? []} columns={columns} rowKey="id" loading={isLoading} />

      <Modal title="Update Contact" open={!!editId} onCancel={() => setEditId(null)} onOk={() => editForm.submit()} confirmLoading={updateMutation.isPending}>
        <Form form={editForm} layout="vertical" onFinish={v => updateMutation.mutate({ id: editId!, ...v })}>
          <Form.Item name="current_email" label="Email"><Input /></Form.Item>
          <Form.Item name="current_phone" label="Phone"><Input /></Form.Item>
          <Form.Item name="employer" label="Employer"><Input /></Form.Item>
          <Form.Item name="job_title" label="Job Title"><Input /></Form.Item>
        </Form>
      </Modal>

      <Modal title="Record Career Placement" open={!!placementId} onCancel={() => setPlacementId(null)} onOk={() => placementForm.submit()} confirmLoading={placementMutation.isPending}>
        <Form form={placementForm} layout="vertical" onFinish={v => placementMutation.mutate(v)}>
          <Form.Item name="alumni_id" hidden><Input /></Form.Item>
          <Form.Item name="employer_name" label="Employer" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="position_title" label="Position" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="start_date" label="Start Date" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Form.Item name="sector" label="Sector"><Input /></Form.Item>
          <Form.Item name="placement_type" label="Type">
            <select style={{ width: '100%' }}>
              <option value="job">Job</option>
              <option value="internship">Internship</option>
            </select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

import React, { useState } from 'react';
import {
  Table, Button, Typography, Tag, Space, Modal, Form,
  Input, message, Upload, Card
} from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/axios';
import { RoleGate } from '../../components/RoleGate';
import { useAuth } from '../../context/AuthContext';
import type { JobListing } from '../../types';
import type { ColumnsType } from 'antd/es/table';

export default function PlacementPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [applyId, setApplyId] = useState<string | null>(null);
  const [createForm] = Form.useForm();
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const { data: listings, isLoading } = useQuery({
    queryKey: ['placement-listings'],
    queryFn: () =>
      api.get<{ success: boolean; data: JobListing[] }>('/placement/listings')
        .then(r => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api.post('/placement/listings', v).then(r => r.data),
    onSuccess: () => {
      void message.success('Listing created');
      setCreateOpen(false);
      createForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['placement-listings'] });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async ({ listingId, file }: { listingId: string; file: File }) => {
      const fd = new FormData();
      fd.append('resume', file);
      return api.post(`/placement/listings/${listingId}/apply`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data);
    },
    onSuccess: () => {
      void message.success('Application submitted');
      setApplyId(null);
      setResumeFile(null);
    },
    onError: (e: unknown) => {
      const code = (e as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
      if (code === 'APPLICATION_ALREADY_EXISTS') void message.error('You have already applied to this listing');
      else void message.error('Application failed');
    },
  });

  const columns: ColumnsType<JobListing> = [
    { title: 'Employer', dataIndex: 'employer_name', key: 'emp' },
    { title: 'Position', dataIndex: 'position_title', key: 'pos' },
    { title: 'Deadline', dataIndex: 'deadline', key: 'dead', render: (d: string) => new Date(d).toLocaleDateString() },
    {
      title: 'Status', dataIndex: 'is_active', key: 'status',
      render: (a: boolean) => <Tag color={a ? 'green' : 'default'}>{a ? 'Active' : 'Closed'}</Tag>,
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: JobListing) => (
        <Space>
          {r.is_active && user?.role === 'student' && (
            <Button size="small" type="primary" onClick={() => setApplyId(r.id)}>Apply</Button>
          )}
          <RoleGate feature="placement_listings" action="manage">
            <Button size="small" danger onClick={() =>
              api.patch(`/placement/listings/${r.id}/deactivate`).then(() => {
                void message.success('Listing deactivated');
                void qc.invalidateQueries({ queryKey: ['placement-listings'] });
              }).catch(() => void message.error('Failed'))
            }>
              Deactivate
            </Button>
          </RoleGate>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>Career Placement</Typography.Title>
        <RoleGate feature="placement_listings" action="manage">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            New Listing
          </Button>
        </RoleGate>
      </Space>

      <Table dataSource={listings ?? []} columns={columns} rowKey="id" loading={isLoading} />

      {/* Create Listing */}
      <Modal title="Create Job/Internship Listing" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => createForm.submit()} confirmLoading={createMutation.isPending} width={560}>
        <Form form={createForm} layout="vertical" onFinish={v => createMutation.mutate(v)}>
          <Form.Item name="employer_name" label="Employer" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="position_title" label="Position Title" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="deadline" label="Application Deadline" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Form.Item name="programme_ids" label="Eligible Programme IDs (comma-separated)">
            <Input placeholder="uuid1,uuid2" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Apply */}
      <Modal
        title="Apply to Listing"
        open={!!applyId}
        onCancel={() => { setApplyId(null); setResumeFile(null); }}
        onOk={() => {
          if (!resumeFile) { void message.error('Please select a PDF resume'); return; }
          applyMutation.mutate({ listingId: applyId!, file: resumeFile });
        }}
        confirmLoading={applyMutation.isPending}
      >
        <Upload
          accept="application/pdf"
          beforeUpload={file => { setResumeFile(file); return false; }}
          maxCount={1}
          showUploadList={!!resumeFile}
        >
          <Button icon={<UploadOutlined />}>Select Resume PDF (max 5 MB)</Button>
        </Upload>
      </Modal>
    </div>
  );
}

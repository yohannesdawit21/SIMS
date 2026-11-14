import React, { useState } from 'react';
import {
  Table, Button, Input, Typography, Tag, Space, Modal, Form, message
} from 'antd';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/axios';
import { RoleGate } from '../../components/RoleGate';
import type { LibraryResource, LibraryLoan } from '../../types';
import type { ColumnsType } from 'antd/es/table';

export default function LibraryPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [loanOpen, setLoanOpen] = useState(false);
  const [loanForm] = Form.useForm();
  const [tab, setTab] = useState<'catalogue' | 'loans'>('catalogue');

  const { data: catalogue, isLoading } = useQuery({
    queryKey: ['library-catalogue', search],
    queryFn: () =>
      api.get<{ success: boolean; data: LibraryResource[] }>(
        `/library/catalogue?title=${search}`,
      ).then(r => r.data.data),
  });

  const { data: loans } = useQuery({
    queryKey: ['library-loans'],
    queryFn: () =>
      api.get<{ success: boolean; data: LibraryLoan[] }>('/library/loans').then(r => r.data.data),
  });

  const loanMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post('/library/loans', values).then(r => r.data),
    onSuccess: () => {
      void message.success('Loan created');
      setLoanOpen(false);
      loanForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['library-loans'] });
      void qc.invalidateQueries({ queryKey: ['library-catalogue'] });
    },
    onError: (e: unknown) => {
      const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === 'LIBRARY_NO_COPIES') void message.error('No available copies');
      else void message.error('Failed to create loan');
    },
  });

  const returnMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/library/loans/${id}/return`).then(r => r.data),
    onSuccess: () => {
      void message.success('Loan returned');
      void qc.invalidateQueries({ queryKey: ['library-loans'] });
      void qc.invalidateQueries({ queryKey: ['library-catalogue'] });
    },
  });

  const resCols: ColumnsType<LibraryResource> = [
    { title: 'Title', dataIndex: 'title', key: 'title' },
    { title: 'Authors', dataIndex: 'authors', key: 'authors', render: (v: unknown) => v ?? '—' },
    { title: 'ISBN/Acc', dataIndex: 'isbn_or_accession', key: 'isbn' },
    { title: 'Category', dataIndex: 'category', key: 'cat', render: (v: unknown) => v ?? '—' },
    {
      title: 'Available', key: 'avail',
      render: (_: unknown, r: LibraryResource) => (
        <Tag color={r.available_copies > 0 ? 'green' : 'red'}>
          {r.available_copies} / {r.total_copies}
        </Tag>
      ),
    },
  ];

  const loanCols: ColumnsType<LibraryLoan> = [
    { title: 'Resource', dataIndex: ['resource', 'title'], key: 'res', render: (v: unknown) => v ?? '—' },
    { title: 'Student', dataIndex: 'student_id', key: 'student' },
    { title: 'Loan Date', dataIndex: 'loan_date', key: 'loan', render: (d: string) => new Date(d).toLocaleDateString() },
    { title: 'Due Date', dataIndex: 'due_date', key: 'due', render: (d: string) => new Date(d).toLocaleDateString() },
    {
      title: 'Status', key: 'status',
      render: (_: unknown, r: LibraryLoan) => {
        if (r.is_returned) return <Tag color="green">Returned</Tag>;
        const overdue = new Date(r.due_date) < new Date();
        return <Tag color={overdue ? 'red' : 'blue'}>{overdue ? 'Overdue' : 'Active'}</Tag>;
      },
    },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: LibraryLoan) => (
        !r.is_returned && (
          <RoleGate feature="loans" action="manage">
            <Button size="small" onClick={() => returnMutation.mutate(r.id)}>Return</Button>
          </RoleGate>
        )
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>Library</Typography.Title>
        <Space>
          <Button type={tab === 'catalogue' ? 'primary' : 'default'} onClick={() => setTab('catalogue')}>Catalogue</Button>
          <Button type={tab === 'loans' ? 'primary' : 'default'} onClick={() => setTab('loans')}>Loans</Button>
          <RoleGate feature="loans" action="manage">
            <Button icon={<PlusOutlined />} onClick={() => setLoanOpen(true)}>New Loan</Button>
          </RoleGate>
        </Space>
      </Space>

      {tab === 'catalogue' && (
        <>
          <Input
            placeholder="Search by title, author, or category"
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ marginBottom: 12, width: 320 }}
          />
          <Table dataSource={catalogue ?? []} columns={resCols} rowKey="id" loading={isLoading} />
        </>
      )}

      {tab === 'loans' && (
        <Table dataSource={loans ?? []} columns={loanCols} rowKey="id" />
      )}

      <Modal title="Create Loan" open={loanOpen} onCancel={() => setLoanOpen(false)} onOk={() => loanForm.submit()} confirmLoading={loanMutation.isPending}>
        <Form form={loanForm} layout="vertical" onFinish={v => loanMutation.mutate(v)}>
          <Form.Item name="resourceId" label="Resource ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="studentId" label="Student ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="loanDate" label="Loan Date" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Form.Item name="dueDate" label="Due Date" rules={[{ required: true }]}><Input type="date" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

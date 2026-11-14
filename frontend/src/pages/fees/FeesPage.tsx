import React, { useState } from 'react';
import {
  Table, Button, Typography, Tag, Space, Modal, Form,
  Input, InputNumber, message, Statistic, Card, Row, Col, Alert
} from 'antd';
import { PlusOutlined, DollarOutlined, FileTextOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { RoleGate } from '../../components/RoleGate';
import type { FeeRecord } from '../../types';
import type { ColumnsType } from 'antd/es/table';

export default function FeesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [waiverOpen, setWaiverOpen] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [batchInvoiceOpen, setBatchInvoiceOpen] = useState(false);

  const [payForm] = Form.useForm();
  const [waiverForm] = Form.useForm();
  const [createForm] = Form.useForm();
  const [batchInvoiceForm] = Form.useForm();

  const isStudent = user?.role === 'student';

  const { data: balance } = useQuery({
    queryKey: ['fees-balance', user?.id],
    queryFn: () =>
      api.get<{ success: boolean; data: { total_due: number; total_paid: number; outstanding: number } }>(
        `/fees/balance/${user?.id}`,
      ).then(r => r.data.data),
    enabled: !!user?.id,
  });

  const { data: fees } = useQuery({
    queryKey: ['fees'],
    queryFn: () =>
      api.get<{ success: boolean; data: FeeRecord[] }>('/fees').then(r => r.data.data),
  });

  const payMutation = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      api.post(`/fees/${id}/payment`, { amount }).then(r => r.data),
    onSuccess: () => {
      void message.success('Payment recorded');
      setPayOpen(null);
      payForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['fees'] });
      void qc.invalidateQueries({ queryKey: ['fees-balance'] });
    },
    onError: () => void message.error('Payment failed'),
  });

  const waiverMutation = useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount: number; reason: string }) =>
      api.patch(`/fees/${id}/waiver`, { amount, reason }).then(r => r.data),
    onSuccess: () => {
      void message.success('Waiver applied');
      setWaiverOpen(null);
      waiverForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['fees'] });
    },
    onError: () => void message.error('Waiver failed'),
  });

  const createMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post('/fees', values).then(r => r.data),
    onSuccess: () => {
      void message.success('Fee record created');
      setCreateOpen(false);
      createForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['fees'] });
    },
  });

  const batchInvoiceMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.post('/fees/batch-invoice', values).then(r => r.data),
    onSuccess: (res: any) => {
      const data = res.data ?? res;
      Modal.success({
        title: 'Batch Term Invoicing Complete',
        content: (
          <div style={{ marginTop: 8 }}>
            <p><strong>Invoices Generated:</strong> {data.generatedCount}</p>
            <p><strong>Skipped (Already Invoiced):</strong> {data.skippedCount}</p>
            <p><strong>Total Eligible Students:</strong> {data.totalEligibleStudents}</p>
          </div>
        ),
      });
      setBatchInvoiceOpen(false);
      batchInvoiceForm.resetFields();
      void qc.invalidateQueries({ queryKey: ['fees'] });
      void qc.invalidateQueries({ queryKey: ['fees-balance'] });
    },
    onError: (e: any) => {
      const msg = e.response?.data?.message || 'Failed to generate batch invoices';
      void message.error(msg);
    },
  });

  const outstanding = balance?.outstanding ?? 0;

  const columns: ColumnsType<FeeRecord> = [
    { title: 'Category', dataIndex: ['category', 'name'], key: 'cat', render: (v: unknown) => v ?? '—' },
    { title: 'Amount Due', dataIndex: 'amount_due', key: 'due', render: (v: number) => `ETB ${Number(v).toFixed(2)}` },
    { title: 'Waiver', dataIndex: 'waiver_amount', key: 'waiver', render: (v: number) => Number(v) > 0 ? `ETB ${Number(v).toFixed(2)}` : '—' },
    { title: 'Paid', dataIndex: 'amount_paid', key: 'paid', render: (v: number) => `ETB ${Number(v).toFixed(2)}` },
    {
      title: 'Outstanding', key: 'outstanding',
      render: (_: unknown, r: FeeRecord) => {
        const o = Number(r.amount_due) - Number(r.waiver_amount) - Number(r.amount_paid);
        return <span style={{ color: o > 0 ? '#cf1322' : '#3f8600', fontWeight: 500 }}>ETB {Math.max(0, o).toFixed(2)}</span>;
      },
    },
    { title: 'Due Date', dataIndex: 'due_date', key: 'due_date', render: (d: string) => new Date(d).toLocaleDateString() },
    {
      title: 'Actions', key: 'actions',
      render: (_: unknown, r: FeeRecord) => (
        <RoleGate feature="fees" action="manage">
          <Space>
            <Button size="small" icon={<DollarOutlined />} onClick={() => setPayOpen(r.id)}>Pay</Button>
            <Button size="small" onClick={() => setWaiverOpen(r.id)}>Waiver</Button>
          </Space>
        </RoleGate>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%' }} wrap>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>Fee & Billing Management</Typography.Title>
          <Typography.Text type="secondary">
            Advisory Clearance: Outstanding balances do not block exam attendance, but graduation transcript release remains on hold until cleared.
          </Typography.Text>
        </div>
        <RoleGate feature="fees" action="manage">
          <Space>
            <Button icon={<FileTextOutlined />} onClick={() => setBatchInvoiceOpen(true)}>
              Batch Term Invoicing
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              New Fee Record
            </Button>
          </Space>
        </RoleGate>
      </Space>

      {/* Advisory Clearance Banner */}
      {isStudent && outstanding > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<InfoCircleOutlined />}
          message="Soft Clearance Policy Notice"
          description={`You currently have an outstanding balance of ETB ${outstanding.toFixed(2)}. Regular coursework and exam attendance remain unrestricted; official graduation certificates and final transcripts will be released upon full clearance.`}
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="Total Due" value={balance?.total_due ?? 0} precision={2} prefix="ETB" />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="Total Paid" value={balance?.total_paid ?? 0} precision={2} prefix="ETB" valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="Outstanding" value={outstanding} precision={2} prefix="ETB" valueStyle={{ color: outstanding > 0 ? '#cf1322' : '#3f8600' }} />
          </Card>
        </Col>
      </Row>

      <Table dataSource={fees ?? []} columns={columns} rowKey="id" pagination={{ pageSize: 20 }} />

      {/* Pay Modal */}
      <Modal title="Record Payment" open={!!payOpen} onCancel={() => setPayOpen(null)} onOk={() => payForm.submit()} confirmLoading={payMutation.isPending}>
        <Form form={payForm} layout="vertical" onFinish={v => payMutation.mutate({ id: payOpen!, amount: v.amount as number })}>
          <Form.Item name="amount" label="Amount (ETB)" rules={[{ required: true }]}>
            <InputNumber min={0.01} style={{ width: '100%' }} precision={2} prefix="ETB" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Waiver Modal */}
      <Modal title="Apply Waiver" open={!!waiverOpen} onCancel={() => setWaiverOpen(null)} onOk={() => waiverForm.submit()} confirmLoading={waiverMutation.isPending}>
        <Form form={waiverForm} layout="vertical" onFinish={v => waiverMutation.mutate({ id: waiverOpen!, amount: v.amount as number, reason: v.reason as string })}>
          <Form.Item name="amount" label="Waiver Amount (ETB)" rules={[{ required: true }]}>
            <InputNumber min={0.01} style={{ width: '100%' }} precision={2} />
          </Form.Item>
          <Form.Item name="reason" label="Justification Note" rules={[{ required: true, min: 5 }]}>
            <Input.TextArea rows={3} placeholder="Reason for waiver..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Create Fee Record Modal */}
      <Modal title="Create Individual Fee Record" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => createForm.submit()} confirmLoading={createMutation.isPending}>
        <Form form={createForm} layout="vertical" onFinish={v => createMutation.mutate(v)}>
          <Form.Item name="student_id" label="Student ID" rules={[{ required: true }]}><Input placeholder="Student UUID" /></Form.Item>
          <Form.Item name="category_id" label="Category ID" rules={[{ required: true }]}><Input placeholder="Category UUID" /></Form.Item>
          <Form.Item name="academic_period_id" label="Academic Period ID" rules={[{ required: true }]}><Input placeholder="Academic Period UUID" /></Form.Item>
          <Form.Item name="amount_due" label="Amount Due (ETB)" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="due_date" label="Due Date" rules={[{ required: true }]}><Input type="date" /></Form.Item>
        </Form>
      </Modal>

      {/* Batch Term Invoicing Modal */}
      <Modal
        title="Batch Term Invoicing"
        open={batchInvoiceOpen}
        onCancel={() => { setBatchInvoiceOpen(false); batchInvoiceForm.resetFields(); }}
        onOk={() => batchInvoiceForm.submit()}
        confirmLoading={batchInvoiceMutation.isPending}
        okText="Generate Term Invoices"
        width={560}
      >
        <Typography.Paragraph type="secondary">
          Generate term fee records (e.g. Tuition) for all active students or scoped to a specific programme cohort.
        </Typography.Paragraph>
        <Form form={batchInvoiceForm} layout="vertical" onFinish={v => batchInvoiceMutation.mutate(v)}>
          <Form.Item name="academic_period_id" label="Academic Period ID (UUID)" rules={[{ required: true, message: 'Academic Period is required' }]}>
            <Input placeholder="Academic Period UUID" />
          </Form.Item>
          <Form.Item name="category_id" label="Fee Category ID (UUID)" rules={[{ required: true, message: 'Category is required' }]}>
            <Input placeholder="Tuition / Category UUID" />
          </Form.Item>
          <Form.Item name="amount" label="Term Fee Amount (ETB)" rules={[{ required: true, message: 'Amount is required' }]}>
            <InputNumber min={1} style={{ width: '100%' }} precision={2} placeholder="e.g. 5000" />
          </Form.Item>
          <Form.Item name="due_date" label="Payment Due Date" rules={[{ required: true, message: 'Due Date is required' }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="programme_id" label="Programme ID (optional - leave blank for all active students)">
            <Input placeholder="Optional Programme UUID" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

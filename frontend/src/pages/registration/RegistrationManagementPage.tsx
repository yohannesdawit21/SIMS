import React, { useState } from 'react';
import {
  Table,
  Button,
  Space,
  Tag,
  Typography,
  Modal,
  Form,
  Input,
  message,
  Select,
  Card,
  Descriptions,
  Alert,
} from 'antd';
import {
  EyeOutlined,
  CheckCircleOutlined,
  UnlockOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRegistrations, overrideBlock } from '../../api/registration';
import type { SemesterRegistration } from '../../api/registration';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function RegistrationManagementPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState<SemesterRegistration | null>(
    null
  );
  const [overrideForm] = Form.useForm();

  // Fetch registrations
  const { data: registrations = [], isLoading } = useQuery({
    queryKey: ['all-registrations', statusFilter],
    queryFn: () => getRegistrations(statusFilter || undefined),
  });

  // Override mutation
  const overrideMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { override_reason: string } }) =>
      overrideBlock(id, data),
    onSuccess: () => {
      message.success('Registration block overridden successfully!');
      setOverrideModalOpen(false);
      overrideForm.resetFields();
      qc.invalidateQueries({ queryKey: ['all-registrations'] });
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to override block';
      message.error(msg);
    },
  });

  const handleView = (record: SemesterRegistration) => {
    setSelectedRegistration(record);
    setViewModalOpen(true);
  };

  const handleOverride = (record: SemesterRegistration) => {
    setSelectedRegistration(record);
    setOverrideModalOpen(true);
  };

  const handleOverrideSubmit = (values: any) => {
    if (!selectedRegistration) return;
    overrideMutation.mutate({
      id: selectedRegistration.id,
      data: { override_reason: values.override_reason },
    });
  };

  const columns: ColumnsType<SemesterRegistration> = [
    {
      title: 'Student',
      dataIndex: ['student', 'user', 'username'],
      key: 'student',
      render: (username, record) => {
        const fullName =
          record.student?.user?.full_name ||
          `${record.student?.first_name || ''} ${record.student?.last_name || ''}`.trim();
        return (
          <div>
            <div><strong>{fullName || 'N/A'}</strong></div>
            <Text type="secondary">{username || 'N/A'}</Text>
          </div>
        );
      },
    },
    {
      title: 'Semester',
      dataIndex: ['academicPeriod', 'name'],
      key: 'semester',
      render: (name) => name || 'N/A',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record) => {
        const colors: Record<string, string> = {
          approved: 'green',
          blocked: 'red',
          pending: 'gold',
        };
        return (
          <Space direction="vertical" size="small">
            <Tag color={colors[status] || 'default'}>{status.toUpperCase()}</Tag>
            {record.admin_override && (
              <Tag color="blue" icon={<UnlockOutlined />}>
                Overridden
              </Tag>
            )}
          </Space>
        );
      },
      filters: [
        { text: 'Approved', value: 'approved' },
        { text: 'Blocked', value: 'blocked' },
        { text: 'Pending', value: 'pending' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'GPA',
      dataIndex: 'gpa_at_registration',
      key: 'gpa',
      render: (gpa: number | null, record) => (
        <Space direction="vertical" size="small">
          <Text>{gpa ? gpa.toFixed(2) : 'N/A'}</Text>
          {record.gpa_warning && <Tag color="warning">Warning</Tag>}
          {record.gpa_block && <Tag color="error">Block</Tag>}
        </Space>
      ),
      sorter: (a, b) => (a.gpa_at_registration || 0) - (b.gpa_at_registration || 0),
    },
    {
      title: 'Issues',
      key: 'issues',
      render: (_, record) => (
        <Space direction="vertical" size="small">
          {record.has_discipline_block && <Tag color="red">Discipline</Tag>}
          {record.gpa_block && <Tag color="red">Low GPA</Tag>}
          {!record.has_discipline_block && !record.gpa_block && <Text type="secondary">None</Text>}
        </Space>
      ),
    },
    {
      title: 'Registration Date',
      dataIndex: 'registered_at',
      key: 'registered_at',
      render: (date: string) => dayjs(date).format('MMM DD, YYYY HH:mm'),
      sorter: (a, b) => dayjs(a.registered_at).unix() - dayjs(b.registered_at).unix(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EyeOutlined />} onClick={() => handleView(record)}>
            View
          </Button>
          {record.status === 'blocked' && !record.admin_override && (
            <Button
              type="link"
              icon={<UnlockOutlined />}
              onClick={() => handleOverride(record)}
              style={{ color: 'orange' }}
            >
              Override
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div
        style={{
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Title level={2}>Semester Registrations</Title>
        <Select
          placeholder="Filter by status"
          style={{ width: 200 }}
          allowClear
          onChange={(value) => setStatusFilter(value || '')}
          value={statusFilter || undefined}
          suffixIcon={<FilterOutlined />}
        >
          <Select.Option value="">All</Select.Option>
          <Select.Option value="approved">Approved</Select.Option>
          <Select.Option value="blocked">Blocked</Select.Option>
          <Select.Option value="pending">Pending</Select.Option>
        </Select>
      </div>

      <Table
        columns={columns}
        dataSource={registrations}
        rowKey="id"
        loading={isLoading}
        pagination={{ pageSize: 15 }}
        scroll={{ x: 'max-content' }}
      />

      {/* View Details Modal */}
      <Modal
        title="Registration Details"
        open={viewModalOpen}
        onCancel={() => setViewModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setViewModalOpen(false)}>
            Close
          </Button>,
          selectedRegistration?.status === 'blocked' && !selectedRegistration.admin_override && (
            <Button
              key="override"
              type="primary"
              icon={<UnlockOutlined />}
              onClick={() => {
                setViewModalOpen(false);
                handleOverride(selectedRegistration);
              }}
            >
              Override Block
            </Button>
          ),
        ]}
        width={700}
      >
        {selectedRegistration && (
          <div>
            <Card style={{ marginBottom: '16px' }}>
              <Descriptions title="Student Information" column={1} bordered size="small">
                <Descriptions.Item label="Name">
                  {selectedRegistration.student?.user?.full_name ||
                    `${selectedRegistration.student?.first_name || ''} ${
                      selectedRegistration.student?.last_name || ''
                    }`.trim() ||
                    'N/A'}
                </Descriptions.Item>
                <Descriptions.Item label="Username">
                  {selectedRegistration.student?.user?.username || 'N/A'}
                </Descriptions.Item>
                <Descriptions.Item label="Email">
                  {selectedRegistration.student?.email || 'N/A'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card style={{ marginBottom: '16px' }}>
              <Descriptions title="Registration Details" column={2} bordered size="small">
                <Descriptions.Item label="Semester" span={2}>
                  {selectedRegistration.academicPeriod?.name || 'N/A'}
                </Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag
                    color={
                      selectedRegistration.status === 'approved'
                        ? 'green'
                        : selectedRegistration.status === 'blocked'
                        ? 'red'
                        : 'gold'
                    }
                  >
                    {selectedRegistration.status.toUpperCase()}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Registration Date">
                  {dayjs(selectedRegistration.registered_at).format('MMM DD, YYYY HH:mm')}
                </Descriptions.Item>
                <Descriptions.Item label="GPA at Registration">
                  {selectedRegistration.gpa_at_registration
                    ? selectedRegistration.gpa_at_registration.toFixed(2)
                    : 'N/A'}
                </Descriptions.Item>
                <Descriptions.Item label="Approved Date">
                  {selectedRegistration.approved_at
                    ? dayjs(selectedRegistration.approved_at).format('MMM DD, YYYY HH:mm')
                    : 'Not approved'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card style={{ marginBottom: '16px' }}>
              <Descriptions title="Eligibility Checks" column={1} bordered size="small">
                <Descriptions.Item label="GPA Warning">
                  {selectedRegistration.gpa_warning ? (
                    <Tag color="warning">Yes (1.80-2.00)</Tag>
                  ) : (
                    <Tag color="success">No</Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="GPA Block">
                  {selectedRegistration.gpa_block ? (
                    <Tag color="error">Yes (&lt;1.80)</Tag>
                  ) : (
                    <Tag color="success">No</Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Discipline Block">
                  {selectedRegistration.has_discipline_block ? (
                    <Tag color="error">Yes</Tag>
                  ) : (
                    <Tag color="success">No</Tag>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Admin Override">
                  {selectedRegistration.admin_override ? (
                    <Tag color="blue" icon={<UnlockOutlined />}>
                      Yes
                    </Tag>
                  ) : (
                    <Tag>No</Tag>
                  )}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {selectedRegistration.block_reason && (
              <Alert
                message="Block Reason"
                description={selectedRegistration.block_reason}
                type="error"
                showIcon
                style={{ marginBottom: '16px' }}
              />
            )}

            {selectedRegistration.override_reason && (
              <Alert
                message="Override Reason"
                description={
                  <div>
                    <p>{selectedRegistration.override_reason}</p>
                    {selectedRegistration.overriddenBy && (
                      <Text type="secondary">
                        Overridden by: {selectedRegistration.overriddenBy.username}
                      </Text>
                    )}
                  </div>
                }
                type="info"
                showIcon
                style={{ marginBottom: '16px' }}
              />
            )}

            {selectedRegistration.notes && (
              <Alert
                message="Notes"
                description={selectedRegistration.notes}
                type="info"
                showIcon
              />
            )}
          </div>
        )}
      </Modal>

      {/* Override Block Modal */}
      <Modal
        title="Override Registration Block"
        open={overrideModalOpen}
        onCancel={() => {
          setOverrideModalOpen(false);
          overrideForm.resetFields();
        }}
        footer={null}
      >
        <Alert
          message="Super Admin Override"
          description="You are about to override the registration block for this student. This will approve their registration despite GPA or discipline issues. Please provide a reason."
          type="warning"
          showIcon
          style={{ marginBottom: '16px' }}
        />

        <Form form={overrideForm} layout="vertical" onFinish={handleOverrideSubmit}>
          <Form.Item
            name="override_reason"
            label="Override Reason"
            rules={[{ required: true, message: 'Please provide a reason for override' }]}
          >
            <TextArea rows={4} placeholder="Enter reason for overriding the block" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ float: 'right' }}>
              <Button
                onClick={() => {
                  setOverrideModalOpen(false);
                  overrideForm.resetFields();
                }}
              >
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={overrideMutation.isPending}
                icon={<UnlockOutlined />}
              >
                Override Block
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

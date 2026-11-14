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
  PlusOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/axios';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface DisciplineRecord {
  id: string;
  student_id: string;
  issue_type: string;
  description: string;
  severity: string;
  status: 'active' | 'cleared';
  created_by_id: string | null;
  cleared_by_id: string | null;
  cleared_at: string | null;
  issue_date: string;
  created_at: string;
  student?: any;
  createdBy?: any;
  clearedBy?: any;
}

export default function DisciplineManagementPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<DisciplineRecord | null>(null);
  const [form] = Form.useForm();

  // Fetch discipline records
  const { data: records = [], isLoading } = useQuery<DisciplineRecord[]>({
    queryKey: ['discipline-records'],
    queryFn: async () => {
      const response = await api.get('/discipline');
      return response.data?.data || response.data || [];
    },
  });

  // Fetch students for dropdown
  const { data: students = [] } = useQuery({
    queryKey: ['students-list'],
    queryFn: async () => {
      const response = await api.get('/students');
      return response.data?.data || response.data || [];
    },
  });

  // Create discipline record mutation
  const createMutation = useMutation({
    mutationFn: (values: any) => api.post('/discipline', values),
    onSuccess: () => {
      message.success('Discipline record created successfully!');
      setCreateOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['discipline-records'] });
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to create discipline record';
      message.error(msg);
    },
  });

  // Clear discipline record mutation
  const clearMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/discipline/${id}/clear`),
    onSuccess: () => {
      message.success('Discipline record cleared successfully!');
      qc.invalidateQueries({ queryKey: ['discipline-records'] });
      setViewModalOpen(false);
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to clear discipline record';
      message.error(msg);
    },
  });

  const handleView = (record: DisciplineRecord) => {
    setSelectedRecord(record);
    setViewModalOpen(true);
  };

  const handleClear = (record: DisciplineRecord) => {
    Modal.confirm({
      title: 'Clear Discipline Record',
      content: 'Are you sure you want to clear this discipline record? This will allow the student to register for semesters.',
      okText: 'Clear',
      okType: 'primary',
      onOk: () => clearMutation.mutate(record.id),
    });
  };

  const columns: ColumnsType<DisciplineRecord> = [
    {
      title: 'Student',
      key: 'student',
      render: (_, record) => {
        const student = record.student;
        const name = student?.user?.full_name || 
          `${student?.first_name || ''} ${student?.last_name || ''}`.trim();
        return (
          <div>
            <div><strong>{name || 'N/A'}</strong></div>
            <Text type="secondary">{student?.user?.username || 'N/A'}</Text>
          </div>
        );
      },
    },
    {
      title: 'Issue Type',
      dataIndex: 'issue_type',
      key: 'issue_type',
    },
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      render: (severity: string) => {
        const colors: Record<string, string> = {
          minor: 'blue',
          major: 'orange',
          severe: 'red',
        };
        return <Tag color={colors[severity] || 'default'}>{severity.toUpperCase()}</Tag>;
      },
      filters: [
        { text: 'Minor', value: 'minor' },
        { text: 'Major', value: 'major' },
        { text: 'Severe', value: 'severe' },
      ],
      onFilter: (value, record) => record.severity === value,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const color = status === 'active' ? 'red' : 'green';
        const icon = status === 'active' ? <WarningOutlined /> : <CheckCircleOutlined />;
        return (
          <Tag color={color} icon={icon}>
            {status.toUpperCase()}
          </Tag>
        );
      },
      filters: [
        { text: 'Active', value: 'active' },
        { text: 'Cleared', value: 'cleared' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Issue Date',
      dataIndex: 'issue_date',
      key: 'issue_date',
      render: (date: string) => dayjs(date).format('MMM DD, YYYY'),
      sorter: (a, b) => dayjs(a.issue_date).unix() - dayjs(b.issue_date).unix(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EyeOutlined />} onClick={() => handleView(record)}>
            View
          </Button>
          {record.status === 'active' && (
            <Button
              type="link"
              style={{ color: 'green' }}
              icon={<CheckCircleOutlined />}
              onClick={() => handleClear(record)}
            >
              Clear
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
        <div>
          <Title level={2}>Discipline Management</Title>
          <Text type="secondary">Track and manage student discipline records</Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateOpen(true)}
          size="large"
        >
          Create Discipline Record
        </Button>
      </div>

      <Alert
        message="Discipline Impact on Registration"
        description="Students with active discipline records are automatically blocked from semester registration. Clear the record to allow registration."
        type="info"
        showIcon
        style={{ marginBottom: '16px' }}
      />

      <Table
        columns={columns}
        dataSource={records}
        rowKey="id"
        loading={isLoading}
        pagination={{ pageSize: 15 }}
        scroll={{ x: 'max-content' }}
      />

      {/* Create Discipline Record Modal */}
      <Modal
        title="Create Discipline Record"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          form.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate(values)}>
          <Form.Item
            name="student_id"
            label="Student"
            rules={[{ required: true, message: 'Please select student' }]}
          >
            <Select
              placeholder="Select student"
              showSearch
              optionFilterProp="children"
              filterOption={(input, option: any) =>
                option.children.toLowerCase().includes(input.toLowerCase())
              }
            >
              {students.map((student: any) => {
                const name = student.user?.full_name || 
                  `${student.first_name || ''} ${student.last_name || ''}`.trim();
                return (
                  <Select.Option key={student.id} value={student.id}>
                    {name} ({student.user?.username})
                  </Select.Option>
                );
              })}
            </Select>
          </Form.Item>

          <Form.Item
            name="issue_type"
            label="Issue Type"
            rules={[{ required: true, message: 'Please enter issue type' }]}
          >
            <Input placeholder="e.g., Academic misconduct, Attendance, Behavior" />
          </Form.Item>

          <Form.Item
            name="severity"
            label="Severity"
            rules={[{ required: true, message: 'Please select severity' }]}
          >
            <Select placeholder="Select severity level">
              <Select.Option value="minor">Minor</Select.Option>
              <Select.Option value="major">Major</Select.Option>
              <Select.Option value="severe">Severe</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true, message: 'Please enter description' }]}
          >
            <TextArea rows={4} placeholder="Describe the disciplinary issue in detail" />
          </Form.Item>

          <Alert
            message="Registration Block"
            description="Creating this record will immediately block the student from registering for new semesters until cleared."
            type="warning"
            showIcon
            style={{ marginBottom: '16px' }}
          />

          <Form.Item>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
                Create Record
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* View Details Modal */}
      <Modal
        title="Discipline Record Details"
        open={viewModalOpen}
        onCancel={() => setViewModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setViewModalOpen(false)}>
            Close
          </Button>,
          selectedRecord?.status === 'active' && (
            <Button
              key="clear"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => handleClear(selectedRecord)}
              loading={clearMutation.isPending}
            >
              Clear Record
            </Button>
          ),
        ]}
        width={700}
      >
        {selectedRecord && (
          <div>
            <Card style={{ marginBottom: '16px' }}>
              <Descriptions title="Student Information" column={1} bordered size="small">
                <Descriptions.Item label="Name">
                  {selectedRecord.student?.user?.full_name || 
                    `${selectedRecord.student?.first_name || ''} ${selectedRecord.student?.last_name || ''}`.trim() || 
                    'N/A'}
                </Descriptions.Item>
                <Descriptions.Item label="Username">
                  {selectedRecord.student?.user?.username || 'N/A'}
                </Descriptions.Item>
                <Descriptions.Item label="Email">
                  {selectedRecord.student?.email || 'N/A'}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card style={{ marginBottom: '16px' }}>
              <Descriptions title="Discipline Information" column={2} bordered size="small">
                <Descriptions.Item label="Issue Type" span={2}>
                  {selectedRecord.issue_type}
                </Descriptions.Item>
                <Descriptions.Item label="Severity">
                  <Tag
                    color={
                      selectedRecord.severity === 'minor'
                        ? 'blue'
                        : selectedRecord.severity === 'major'
                        ? 'orange'
                        : 'red'
                    }
                  >
                    {selectedRecord.severity.toUpperCase()}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag
                    color={selectedRecord.status === 'active' ? 'red' : 'green'}
                    icon={
                      selectedRecord.status === 'active' ? (
                        <WarningOutlined />
                      ) : (
                        <CheckCircleOutlined />
                      )
                    }
                  >
                    {selectedRecord.status.toUpperCase()}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Issue Date" span={2}>
                  {dayjs(selectedRecord.issue_date).format('MMMM DD, YYYY')}
                </Descriptions.Item>
                <Descriptions.Item label="Created By">
                  {selectedRecord.createdBy?.username || 'System'}
                </Descriptions.Item>
                <Descriptions.Item label="Created At">
                  {dayjs(selectedRecord.created_at).format('MMM DD, YYYY HH:mm')}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card style={{ marginBottom: '16px' }}>
              <Title level={5}>Description</Title>
              <p style={{ whiteSpace: 'pre-wrap' }}>{selectedRecord.description}</p>
            </Card>

            {selectedRecord.status === 'cleared' && (
              <Card>
                <Descriptions title="Clearance Information" column={2} bordered size="small">
                  <Descriptions.Item label="Cleared By">
                    {selectedRecord.clearedBy?.username || 'N/A'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Cleared At">
                    {selectedRecord.cleared_at
                      ? dayjs(selectedRecord.cleared_at).format('MMM DD, YYYY HH:mm')
                      : 'N/A'}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            {selectedRecord.status === 'active' && (
              <Alert
                message="Registration Blocked"
                description="This student is currently blocked from semester registration due to this active discipline issue."
                type="error"
                showIcon
                icon={<ExclamationCircleOutlined />}
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

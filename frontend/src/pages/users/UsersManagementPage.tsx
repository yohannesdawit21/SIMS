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
  Tabs,
  Card,
  Select,
  Descriptions,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  UserOutlined,
  CrownOutlined,
  TeamOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/axios';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  phone_number?: string;
  role: string;
  is_active: boolean;
  created_at: string;
  department_id?: string;
  department?: any;
}

interface Department {
  id: string;
  name: string;
  head_id: string | null;
  head?: User;
}

export default function UsersManagementPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('lecturers');
  const [createLecturerOpen, setCreateLecturerOpen] = useState(false);
  const [createStaffOpen, setCreateStaffOpen] = useState(false);
  const [deptHeadModalOpen, setDeptHeadModalOpen] = useState(false);
  const [demoteModalOpen, setDemoteModalOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [credentialsModalOpen, setCredentialsModalOpen] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState<any>(null);
  
  const [lecturerForm] = Form.useForm();
  const [staffForm] = Form.useForm();
  const [promoteForm] = Form.useForm();
  const [demoteForm] = Form.useForm();

  // Fetch users
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await api.get('/users');
      return response.data?.data || response.data || [];
    },
  });

  // Fetch departments
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const response = await api.get('/timetable/departments');
      return response.data?.data || response.data || [];
    },
  });

  // Create lecturer mutation
  const createLecturerMutation = useMutation({
    mutationFn: (values: any) => api.post('/users/lecturer', values),
    onSuccess: (response) => {
      const credentials = response.data?.credentials;
      if (credentials) {
        setGeneratedCredentials(credentials);
        setCredentialsModalOpen(true);
      } else {
        message.success('Lecturer created successfully!');
      }
      setCreateLecturerOpen(false);
      lecturerForm.resetFields();
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to create lecturer';
      message.error(msg);
    },
  });

  // Create staff mutation
  const createStaffMutation = useMutation({
    mutationFn: (values: any) => api.post('/users/staff', values),
    onSuccess: (response) => {
      const credentials = response.data?.credentials;
      if (credentials) {
        setGeneratedCredentials(credentials);
        setCredentialsModalOpen(true);
      } else {
        message.success('Staff member created successfully!');
      }
      setCreateStaffOpen(false);
      staffForm.resetFields();
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to create staff';
      message.error(msg);
    },
  });

  // Promote to dept head mutation
  const promoteMutation = useMutation({
    mutationFn: ({ userId, departmentId }: { userId: string; departmentId: string }) =>
      api.post(`/users/${userId}/promote-to-dept-head`, { departmentId }),
    onSuccess: () => {
      message.success('User promoted to department head successfully!');
      setDeptHeadModalOpen(false);
      promoteForm.resetFields();
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to promote user';
      message.error(msg);
    },
  });

  // Demote from dept head mutation
  const demoteMutation = useMutation({
    mutationFn: ({ userId, newHeadId }: { userId: string; newHeadId: string }) =>
      api.post(`/users/${userId}/demote-from-dept-head`, { newHeadId }),
    onSuccess: () => {
      message.success('Department head demoted successfully!');
      setDemoteModalOpen(false);
      demoteForm.resetFields();
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to demote user';
      message.error(msg);
    },
  });

  const handlePromoteToDeptHead = (department: Department) => {
    setSelectedDepartment(department);
    setDeptHeadModalOpen(true);
  };

  const handleDemoteFromDeptHead = (department: Department) => {
    setSelectedDepartment(department);
    setDemoteModalOpen(true);
  };

  const copyCredentials = () => {
    if (generatedCredentials) {
      const text = `Username: ${generatedCredentials.username}\nPassword: ${generatedCredentials.temporary_password}`;
      navigator.clipboard.writeText(text);
      message.success('Credentials copied to clipboard!');
    }
  };

  const lecturers = users.filter((u) => u.role === 'lecturer');
  const staff = users.filter((u) => u.role === 'admin_staff');
  const deptHeads = users.filter((u) => u.role === 'department_head');

  const userColumns: ColumnsType<User> = [
    {
      title: 'Name',
      key: 'name',
      render: (_, record) => {
        const name = record.full_name || 
          `${record.first_name || ''} ${record.middle_name || ''} ${record.last_name || ''}`.trim();
        return (
          <div>
            <div><strong>{name || 'N/A'}</strong></div>
            <Text type="secondary">{record.username}</Text>
          </div>
        );
      },
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Phone',
      dataIndex: 'phone_number',
      key: 'phone',
      render: (phone) => phone || 'N/A',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => {
        const colors: Record<string, string> = {
          lecturer: 'purple',
          admin_staff: 'green',
          department_head: 'orange',
          super_admin: 'red',
        };
        return <Tag color={colors[role] || 'default'}>{role.replace('_', ' ').toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'is_active',
      key: 'status',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'red'}>{active ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => dayjs(date).format('MMM DD, YYYY'),
    },
  ];

  const deptColumns: ColumnsType<Department> = [
    {
      title: 'Department',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Current Head',
      key: 'head',
      render: (_, record) => {
        if (!record.head) {
          return <Text type="secondary">No head assigned</Text>;
        }
        const name = record.head.full_name || 
          `${record.head.first_name || ''} ${record.head.last_name || ''}`.trim();
        return (
          <div>
            <div><strong>{name}</strong></div>
            <Text type="secondary">{record.head.username}</Text>
          </div>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space>
          {!record.head_id ? (
            <Button
              type="link"
              icon={<CrownOutlined />}
              onClick={() => handlePromoteToDeptHead(record)}
            >
              Assign Head
            </Button>
          ) : (
            <Button
              type="link"
              danger
              onClick={() => handleDemoteFromDeptHead(record)}
            >
              Change Head
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>User Management</Title>
      <Text type="secondary">Manage lecturers, staff, and department heads</Text>

      <Card style={{ marginTop: '24px' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'lecturers',
              label: (
                <span>
                  <UserOutlined /> Lecturers ({lecturers.length})
                </span>
              ),
              children: (
                <div>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setCreateLecturerOpen(true)}
                    style={{ marginBottom: '16px' }}
                  >
                    Create Lecturer
                  </Button>
                  <Table
                    columns={userColumns}
                    dataSource={lecturers}
                    rowKey="id"
                    loading={isLoading}
                    pagination={{ pageSize: 10 }}
                  />
                </div>
              ),
            },
            {
              key: 'staff',
              label: (
                <span>
                  <TeamOutlined /> Staff ({staff.length})
                </span>
              ),
              children: (
                <div>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setCreateStaffOpen(true)}
                    style={{ marginBottom: '16px' }}
                  >
                    Create Staff
                  </Button>
                  <Table
                    columns={userColumns}
                    dataSource={staff}
                    rowKey="id"
                    loading={isLoading}
                    pagination={{ pageSize: 10 }}
                  />
                </div>
              ),
            },
            {
              key: 'departments',
              label: (
                <span>
                  <CrownOutlined /> Department Heads
                </span>
              ),
              children: (
                <Table
                  columns={deptColumns}
                  dataSource={departments}
                  rowKey="id"
                  loading={isLoading}
                  pagination={{ pageSize: 10 }}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* Create Lecturer Modal */}
      <Modal
        title="Create Lecturer"
        open={createLecturerOpen}
        onCancel={() => {
          setCreateLecturerOpen(false);
          lecturerForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={lecturerForm}
          layout="vertical"
          onFinish={(values) => createLecturerMutation.mutate(values)}
        >
          <Form.Item
            name="first_name"
            label="First Name"
            rules={[{ required: true, message: 'Please enter first name' }]}
          >
            <Input placeholder="Enter first name" />
          </Form.Item>

          <Form.Item name="middle_name" label="Middle Name">
            <Input placeholder="Enter middle name (optional)" />
          </Form.Item>

          <Form.Item
            name="last_name"
            label="Last Name"
            rules={[{ required: true, message: 'Please enter last name' }]}
          >
            <Input placeholder="Enter last name" />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please enter email' },
              { type: 'email', message: 'Please enter valid email' },
            ]}
          >
            <Input placeholder="Enter email address" />
          </Form.Item>

          <Form.Item name="phone_number" label="Phone Number">
            <Input placeholder="Enter phone number (optional)" />
          </Form.Item>

          <Alert
            message="Auto-Generated Credentials"
            description="A username (LEC2024XXX) and random password will be generated automatically and shown after creation."
            type="info"
            showIcon
            style={{ marginBottom: '16px' }}
          />

          <Form.Item>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setCreateLecturerOpen(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={createLecturerMutation.isPending}>
                Create Lecturer
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Create Staff Modal */}
      <Modal
        title="Create Staff Member"
        open={createStaffOpen}
        onCancel={() => {
          setCreateStaffOpen(false);
          staffForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={staffForm}
          layout="vertical"
          onFinish={(values) => createStaffMutation.mutate(values)}
        >
          <Form.Item
            name="first_name"
            label="First Name"
            rules={[{ required: true, message: 'Please enter first name' }]}
          >
            <Input placeholder="Enter first name" />
          </Form.Item>

          <Form.Item name="middle_name" label="Middle Name">
            <Input placeholder="Enter middle name (optional)" />
          </Form.Item>

          <Form.Item
            name="last_name"
            label="Last Name"
            rules={[{ required: true, message: 'Please enter last name' }]}
          >
            <Input placeholder="Enter last name" />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please enter email' },
              { type: 'email', message: 'Please enter valid email' },
            ]}
          >
            <Input placeholder="Enter email address" />
          </Form.Item>

          <Form.Item name="phone_number" label="Phone Number">
            <Input placeholder="Enter phone number (optional)" />
          </Form.Item>

          <Alert
            message="Auto-Generated Credentials"
            description="A username (STF2024XXX) and random password will be generated automatically and shown after creation."
            type="info"
            showIcon
            style={{ marginBottom: '16px' }}
          />

          <Form.Item>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setCreateStaffOpen(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={createStaffMutation.isPending}>
                Create Staff
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Promote to Dept Head Modal */}
      <Modal
        title={`Assign Department Head - ${selectedDepartment?.name}`}
        open={deptHeadModalOpen}
        onCancel={() => {
          setDeptHeadModalOpen(false);
          promoteForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={promoteForm}
          layout="vertical"
          onFinish={(values) =>
            promoteMutation.mutate({
              userId: values.user_id,
              departmentId: selectedDepartment!.id,
            })
          }
        >
          <Alert
            message="Select New Department Head"
            description="Choose a lecturer or staff member to become the head of this department."
            type="info"
            showIcon
            style={{ marginBottom: '16px' }}
          />

          <Form.Item
            name="user_id"
            label="User"
            rules={[{ required: true, message: 'Please select a user' }]}
          >
            <Select
              placeholder="Select lecturer or staff"
              showSearch
              optionFilterProp="children"
            >
              {users
                .filter((u) => ['lecturer', 'admin_staff'].includes(u.role))
                .map((user) => {
                  const name = user.full_name || 
                    `${user.first_name || ''} ${user.last_name || ''}`.trim();
                  return (
                    <Select.Option key={user.id} value={user.id}>
                      {name} ({user.username}) - {user.role}
                    </Select.Option>
                  );
                })}
            </Select>
          </Form.Item>

          <Form.Item>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setDeptHeadModalOpen(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={promoteMutation.isPending}>
                Assign as Head
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Demote/Change Dept Head Modal */}
      <Modal
        title={`Change Department Head - ${selectedDepartment?.name}`}
        open={demoteModalOpen}
        onCancel={() => {
          setDemoteModalOpen(false);
          demoteForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={demoteForm}
          layout="vertical"
          onFinish={(values) =>
            demoteMutation.mutate({
              userId: selectedDepartment!.head_id!,
              newHeadId: values.new_head_id,
            })
          }
        >
          <Alert
            message="Select New Department Head"
            description={`Current head: ${selectedDepartment?.head?.username}. You must assign a new head before demoting the current one.`}
            type="warning"
            showIcon
            style={{ marginBottom: '16px' }}
          />

          <Form.Item
            name="new_head_id"
            label="New Department Head"
            rules={[{ required: true, message: 'Please select new department head' }]}
          >
            <Select
              placeholder="Select new head"
              showSearch
              optionFilterProp="children"
            >
              {users
                .filter(
                  (u) =>
                    ['lecturer', 'admin_staff'].includes(u.role) &&
                    u.id !== selectedDepartment?.head_id
                )
                .map((user) => {
                  const name = user.full_name || 
                    `${user.first_name || ''} ${user.last_name || ''}`.trim();
                  return (
                    <Select.Option key={user.id} value={user.id}>
                      {name} ({user.username}) - {user.role}
                    </Select.Option>
                  );
                })}
            </Select>
          </Form.Item>

          <Form.Item>
            <Space style={{ float: 'right' }}>
              <Button onClick={() => setDemoteModalOpen(false)}>Cancel</Button>
              <Button
                type="primary"
                danger
                htmlType="submit"
                loading={demoteMutation.isPending}
              >
                Change Department Head
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Credentials Modal */}
      <Modal
        title="Account Created Successfully!"
        open={credentialsModalOpen}
        onCancel={() => setCredentialsModalOpen(false)}
        footer={[
          <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={copyCredentials}>
            Copy Credentials
          </Button>,
          <Button key="close" onClick={() => setCredentialsModalOpen(false)}>
            Close
          </Button>,
        ]}
      >
        {generatedCredentials && (
          <div>
            <Alert
              message="Share These Credentials"
              description="The user can log in with these credentials. They should change their password after first login."
              type="success"
              showIcon
              style={{ marginBottom: '24px' }}
            />
            <Card>
              <Descriptions column={1} bordered>
                <Descriptions.Item label="Username">
                  <Text strong copyable>
                    {generatedCredentials.username}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Temporary Password">
                  <Text strong copyable>
                    {generatedCredentials.temporary_password}
                  </Text>
                </Descriptions.Item>
              </Descriptions>
            </Card>
            <Alert
              message="Important"
              description="⚠️ Save these credentials! They cannot be recovered later."
              type="warning"
              showIcon
              style={{ marginTop: '16px' }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

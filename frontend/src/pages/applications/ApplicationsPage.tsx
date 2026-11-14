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
  Descriptions,
  Card,
  Row,
  Col,
  Alert,
} from 'antd';
import {
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApplications, getApplication, reviewApplication } from '../../api/applications';
import type { StudentApplication, ReviewApplicationDto } from '../../api/applications';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function ApplicationsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<StudentApplication | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
  const [reviewForm] = Form.useForm();
  const [credentialsModalOpen, setCredentialsModalOpen] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState<any>(null);

  // Fetch applications
  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['applications', statusFilter],
    queryFn: () => getApplications(statusFilter || undefined),
  });

  // Review mutation
  const reviewMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReviewApplicationDto }) =>
      reviewApplication(id, data),
    onSuccess: (response, variables) => {
      const action = variables.data.status === 'approved' ? 'approved' : 'rejected';
      message.success(`Application ${action} successfully!`);
      
      // If approved and credentials returned, show them
      if (variables.data.status === 'approved' && response.credentials) {
        setGeneratedCredentials(response.credentials);
        setCredentialsModalOpen(true);
      }
      
      setReviewModalOpen(false);
      reviewForm.resetFields();
      qc.invalidateQueries({ queryKey: ['applications'] });
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to review application';
      message.error(msg);
    },
  });

  const handleViewApplication = async (record: StudentApplication) => {
    setSelectedApplication(record);
    setViewModalOpen(true);
  };

  const handleReview = (record: StudentApplication, action: 'approve' | 'reject') => {
    setSelectedApplication(record);
    setReviewAction(action);
    setReviewModalOpen(true);
  };

  const handleReviewSubmit = (values: any) => {
    if (!selectedApplication) return;

    const data: ReviewApplicationDto = {
      status: reviewAction === 'approve' ? 'approved' : 'rejected',
      review_notes: values.review_notes,
      rejection_reason: reviewAction === 'reject' ? values.rejection_reason : undefined,
    };

    reviewMutation.mutate({ id: selectedApplication.id, data });
  };

  const copyCredentials = () => {
    if (generatedCredentials) {
      const text = `Username: ${generatedCredentials.username}\nPassword: ${generatedCredentials.temporary_password}`;
      navigator.clipboard.writeText(text);
      message.success('Credentials copied to clipboard!');
    }
  };

  const columns: ColumnsType<StudentApplication> = [
    {
      title: 'Full Name',
      dataIndex: 'full_name',
      key: 'full_name',
      sorter: (a, b) => a.full_name.localeCompare(b.full_name),
    },
    {
      title: 'Email',
      dataIndex: 'email_address',
      key: 'email_address',
    },
    {
      title: 'Phone',
      dataIndex: 'phone_number',
      key: 'phone_number',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colors: Record<string, string> = {
          pending: 'gold',
          under_review: 'blue',
          approved: 'green',
          rejected: 'red',
        };
        return <Tag color={colors[status] || 'default'}>{status.toUpperCase()}</Tag>;
      },
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Under Review', value: 'under_review' },
        { text: 'Approved', value: 'approved' },
        { text: 'Rejected', value: 'rejected' },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: 'Submission Date',
      dataIndex: 'submission_date',
      key: 'submission_date',
      render: (date: string) => dayjs(date).format('MMM DD, YYYY'),
      sorter: (a, b) => dayjs(a.submission_date).unix() - dayjs(b.submission_date).unix(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleViewApplication(record)}
          >
            View
          </Button>
          {record.status === 'pending' && (
            <>
              <Button
                type="link"
                icon={<CheckCircleOutlined />}
                onClick={() => handleReview(record, 'approve')}
                style={{ color: 'green' }}
              >
                Approve
              </Button>
              <Button
                type="link"
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => handleReview(record, 'reject')}
              >
                Reject
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={2}>Student Applications</Title>
        <Select
          placeholder="Filter by status"
          style={{ width: 200 }}
          allowClear
          onChange={(value) => setStatusFilter(value || '')}
          value={statusFilter || undefined}
        >
          <Select.Option value="">All</Select.Option>
          <Select.Option value="pending">Pending</Select.Option>
          <Select.Option value="under_review">Under Review</Select.Option>
          <Select.Option value="approved">Approved</Select.Option>
          <Select.Option value="rejected">Rejected</Select.Option>
        </Select>
      </div>

      <Table
        columns={columns}
        dataSource={applications}
        rowKey="id"
        loading={isLoading}
        pagination={{ pageSize: 10 }}
      />

      {/* View Application Modal */}
      <Modal
        title="Application Details"
        open={viewModalOpen}
        onCancel={() => setViewModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setViewModalOpen(false)}>
            Close
          </Button>,
          selectedApplication?.status === 'pending' && (
            <Button
              key="approve"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                setViewModalOpen(false);
                handleReview(selectedApplication, 'approve');
              }}
            >
              Approve
            </Button>
          ),
          selectedApplication?.status === 'pending' && (
            <Button
              key="reject"
              danger
              icon={<CloseCircleOutlined />}
              onClick={() => {
                setViewModalOpen(false);
                handleReview(selectedApplication, 'reject');
              }}
            >
              Reject
            </Button>
          ),
        ]}
        width={800}
      >
        {selectedApplication && (
          <div>
            <Card style={{ marginBottom: '16px' }}>
              <Descriptions title="Personal Information" column={2} bordered size="small">
                <Descriptions.Item label="Full Name" span={2}>
                  {selectedApplication.full_name}
                </Descriptions.Item>
                <Descriptions.Item label="National ID">
                  {selectedApplication.national_id}
                </Descriptions.Item>
                <Descriptions.Item label="Date of Birth">
                  {dayjs(selectedApplication.date_of_birth).format('MMM DD, YYYY')}
                </Descriptions.Item>
                <Descriptions.Item label="Gender">{selectedApplication.gender}</Descriptions.Item>
                <Descriptions.Item label="Phone">{selectedApplication.phone_number}</Descriptions.Item>
                <Descriptions.Item label="Email" span={2}>
                  {selectedApplication.email_address}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card style={{ marginBottom: '16px' }}>
              <Descriptions title="Educational Background" column={2} bordered size="small">
                <Descriptions.Item label="Previous School" span={2}>
                  {selectedApplication.previous_school}
                </Descriptions.Item>
                <Descriptions.Item label="Education Level">
                  {selectedApplication.education_level}
                </Descriptions.Item>
                <Descriptions.Item label="Graduation Year">
                  {selectedApplication.graduation_year}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card style={{ marginBottom: '16px' }}>
              <Descriptions title="Emergency Contact" column={2} bordered size="small">
                <Descriptions.Item label="Name">
                  {selectedApplication.emergency_contact_name}
                </Descriptions.Item>
                <Descriptions.Item label="Phone">
                  {selectedApplication.emergency_contact_phone}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card style={{ marginBottom: '16px' }}>
              <Descriptions title="Parent/Guardian Information" column={2} bordered size="small">
                <Descriptions.Item label="Name">
                  {selectedApplication.parent_guardian_name}
                </Descriptions.Item>
                <Descriptions.Item label="Phone">
                  {selectedApplication.parent_guardian_phone}
                </Descriptions.Item>
                <Descriptions.Item label="Occupation" span={2}>
                  {selectedApplication.parent_guardian_occupation}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card style={{ marginBottom: '16px' }}>
              <Title level={5}>Uploaded Documents</Title>
              <Space direction="vertical" style={{ width: '100%' }}>
                {selectedApplication.photo_url && (
                  <Button
                    icon={<LinkOutlined />}
                    onClick={() => window.open(selectedApplication.photo_url, '_blank')}
                  >
                    View Photo
                  </Button>
                )}
                {selectedApplication.id_document_url && (
                  <Button
                    icon={<LinkOutlined />}
                    onClick={() => window.open(selectedApplication.id_document_url, '_blank')}
                  >
                    View ID Document
                  </Button>
                )}
                {selectedApplication.transcript_url && (
                  <Button
                    icon={<LinkOutlined />}
                    onClick={() => window.open(selectedApplication.transcript_url, '_blank')}
                  >
                    View Transcript
                  </Button>
                )}
                {selectedApplication.payment_receipt_url && (
                  <Button
                    icon={<LinkOutlined />}
                    onClick={() => window.open(selectedApplication.payment_receipt_url, '_blank')}
                  >
                    View Payment Receipt
                  </Button>
                )}
              </Space>
            </Card>

            {selectedApplication.review_notes && (
              <Alert
                message="Review Notes"
                description={selectedApplication.review_notes}
                type="info"
                showIcon
                style={{ marginBottom: '16px' }}
              />
            )}

            {selectedApplication.rejection_reason && (
              <Alert
                message="Rejection Reason"
                description={selectedApplication.rejection_reason}
                type="error"
                showIcon
              />
            )}
          </div>
        )}
      </Modal>

      {/* Review Modal */}
      <Modal
        title={reviewAction === 'approve' ? 'Approve Application' : 'Reject Application'}
        open={reviewModalOpen}
        onCancel={() => {
          setReviewModalOpen(false);
          reviewForm.resetFields();
        }}
        footer={null}
      >
        <Form form={reviewForm} layout="vertical" onFinish={handleReviewSubmit}>
          {reviewAction === 'reject' && (
            <Form.Item
              name="rejection_reason"
              label="Rejection Reason"
              rules={[{ required: true, message: 'Please provide a reason for rejection' }]}
            >
              <TextArea rows={4} placeholder="Enter reason for rejection" />
            </Form.Item>
          )}

          <Form.Item name="review_notes" label="Review Notes (Optional)">
            <TextArea rows={3} placeholder="Add any review notes" />
          </Form.Item>

          {reviewAction === 'approve' && (
            <Alert
              message="Approval Action"
              description="Approving this application will automatically create a student account with auto-generated credentials (Username: STU2024XXX, Password: last 6 digits of National ID)."
              type="info"
              showIcon
              style={{ marginBottom: '16px' }}
            />
          )}

          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ float: 'right' }}>
              <Button
                onClick={() => {
                  setReviewModalOpen(false);
                  reviewForm.resetFields();
                }}
              >
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={reviewMutation.isPending}
                danger={reviewAction === 'reject'}
              >
                {reviewAction === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Credentials Modal */}
      <Modal
        title="Student Account Created!"
        open={credentialsModalOpen}
        onCancel={() => setCredentialsModalOpen(false)}
        footer={[
          <Button key="copy" type="primary" onClick={copyCredentials}>
            📋 Copy Credentials
          </Button>,
          <Button key="close" onClick={() => setCredentialsModalOpen(false)}>
            Close
          </Button>,
        ]}
      >
        {generatedCredentials && (
          <div>
            <Alert
              message="Account Created Successfully!"
              description="The student account has been created. Share these credentials with the student."
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
                <Descriptions.Item label="Password">
                  <Text strong copyable>
                    {generatedCredentials.temporary_password}
                  </Text>
                </Descriptions.Item>
              </Descriptions>
            </Card>
            <Alert
              message="Important"
              description="⚠️ Save these credentials! They cannot be recovered later. The student should change their password after first login."
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

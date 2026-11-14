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
  Descriptions,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/axios';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface TimetableEntry {
  id: string;
  course_id: string;
  lecturer_id: string;
  academic_period_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_by_id: string | null;
  approved_by_id: string | null;
  approval_date: string | null;
  rejection_reason: string | null;
  created_at: string;
  course?: any;
  lecturer?: any;
  academicPeriod?: any;
  createdBy?: any;
  approvedBy?: any;
}

export default function ScheduleApprovalPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('pending');
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<TimetableEntry | null>(null);
  const [rejectForm] = Form.useForm();

  // Fetch schedules by status
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['schedules', activeTab],
    queryFn: async () => {
      const response = await api.get(`/timetable/schedules/status/${activeTab}`);
      return response.data;
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/timetable/${id}/approve`),
    onSuccess: () => {
      message.success('Schedule approved successfully!');
      qc.invalidateQueries({ queryKey: ['schedules'] });
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to approve schedule';
      message.error(msg);
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { rejection_reason: string } }) =>
      api.post(`/timetable/${id}/reject`, data),
    onSuccess: () => {
      message.success('Schedule rejected successfully!');
      setRejectModalOpen(false);
      rejectForm.resetFields();
      qc.invalidateQueries({ queryKey: ['schedules'] });
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to reject schedule';
      message.error(msg);
    },
  });

  const handleView = (record: TimetableEntry) => {
    setSelectedSchedule(record);
    setViewModalOpen(true);
  };

  const handleApprove = (record: TimetableEntry) => {
    Modal.confirm({
      title: 'Approve Schedule',
      content: 'Are you sure you want to approve this schedule?',
      okText: 'Approve',
      okType: 'primary',
      onOk: () => approveMutation.mutate(record.id),
    });
  };

  const handleReject = (record: TimetableEntry) => {
    setSelectedSchedule(record);
    setRejectModalOpen(true);
  };

  const handleRejectSubmit = (values: any) => {
    if (!selectedSchedule) return;
    rejectMutation.mutate({
      id: selectedSchedule.id,
      data: { rejection_reason: values.rejection_reason },
    });
  };

  const dayNames: Record<number, string> = {
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
    7: 'Sunday',
  };

  const columns: ColumnsType<TimetableEntry> = [
    {
      title: 'Course',
      dataIndex: ['course', 'name'],
      key: 'course',
      render: (name, record) => (
        <div>
          <div><strong>{name || 'N/A'}</strong></div>
          <Text type="secondary">{record.course?.code || ''}</Text>
        </div>
      ),
    },
    {
      title: 'Lecturer',
      dataIndex: ['lecturer', 'username'],
      key: 'lecturer',
      render: (username, record) => (
        <div>
          <div>{record.lecturer?.full_name || 'N/A'}</div>
          <Text type="secondary">{username || ''}</Text>
        </div>
      ),
    },
    {
      title: 'Day',
      dataIndex: 'day_of_week',
      key: 'day',
      render: (day: number) => dayNames[day] || day,
    },
    {
      title: 'Time',
      key: 'time',
      render: (_, record) => `${record.start_time} - ${record.end_time}`,
    },
    {
      title: 'Room',
      dataIndex: 'room',
      key: 'room',
      render: (room: string | null) => room || 'N/A',
    },
    {
      title: 'Created By',
      dataIndex: ['createdBy', 'username'],
      key: 'createdBy',
      render: (username) => username || 'System',
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => dayjs(date).format('MMM DD, YYYY HH:mm'),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EyeOutlined />} onClick={() => handleView(record)}>
            View
          </Button>
          {activeTab === 'pending' && (
            <>
              <Button
                type="link"
                icon={<CheckCircleOutlined />}
                onClick={() => handleApprove(record)}
                style={{ color: 'green' }}
              >
                Approve
              </Button>
              <Button
                type="link"
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => handleReject(record)}
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
      <Title level={2}>Schedule Approval</Title>
      <Text type="secondary">
        Review and approve schedules created by department heads before they become visible to
        students.
      </Text>

      <Card style={{ marginTop: '24px' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'pending',
              label: (
                <span>
                  <ClockCircleOutlined /> Pending
                </span>
              ),
              children: (
                <Table
                  columns={columns}
                  dataSource={schedules}
                  rowKey="id"
                  loading={isLoading}
                  pagination={{ pageSize: 15 }}
                  scroll={{ x: 'max-content' }}
                />
              ),
            },
            {
              key: 'approved',
              label: (
                <span>
                  <CheckCircleOutlined /> Approved
                </span>
              ),
              children: (
                <Table
                  columns={columns.filter((col) => col.key !== 'actions')}
                  dataSource={schedules}
                  rowKey="id"
                  loading={isLoading}
                  pagination={{ pageSize: 15 }}
                  scroll={{ x: 'max-content' }}
                />
              ),
            },
            {
              key: 'rejected',
              label: (
                <span>
                  <CloseCircleOutlined /> Rejected
                </span>
              ),
              children: (
                <Table
                  columns={columns.filter((col) => col.key !== 'actions')}
                  dataSource={schedules}
                  rowKey="id"
                  loading={isLoading}
                  pagination={{ pageSize: 15 }}
                  scroll={{ x: 'max-content' }}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* View Details Modal */}
      <Modal
        title="Schedule Details"
        open={viewModalOpen}
        onCancel={() => setViewModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setViewModalOpen(false)}>
            Close
          </Button>,
          selectedSchedule?.status === 'pending' && (
            <Button
              key="approve"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                setViewModalOpen(false);
                handleApprove(selectedSchedule);
              }}
            >
              Approve
            </Button>
          ),
          selectedSchedule?.status === 'pending' && (
            <Button
              key="reject"
              danger
              icon={<CloseCircleOutlined />}
              onClick={() => {
                setViewModalOpen(false);
                handleReject(selectedSchedule);
              }}
            >
              Reject
            </Button>
          ),
        ]}
        width={700}
      >
        {selectedSchedule && (
          <div>
            <Card style={{ marginBottom: '16px' }}>
              <Descriptions title="Schedule Information" column={2} bordered size="small">
                <Descriptions.Item label="Course" span={2}>
                  <strong>{selectedSchedule.course?.name || 'N/A'}</strong>
                  <br />
                  <Text type="secondary">{selectedSchedule.course?.code || ''}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Lecturer" span={2}>
                  {selectedSchedule.lecturer?.full_name || 'N/A'}
                  <br />
                  <Text type="secondary">{selectedSchedule.lecturer?.username || ''}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Academic Period" span={2}>
                  {selectedSchedule.academicPeriod?.name || 'N/A'}
                </Descriptions.Item>
                <Descriptions.Item label="Day">
                  {dayNames[selectedSchedule.day_of_week as any] || selectedSchedule.day_of_week}
                </Descriptions.Item>
                <Descriptions.Item label="Time">
                  {selectedSchedule.start_time} - {selectedSchedule.end_time}
                </Descriptions.Item>
                <Descriptions.Item label="Room" span={2}>
                  {selectedSchedule.room || 'Not assigned'}
                </Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag
                    color={
                      selectedSchedule.status === 'approved'
                        ? 'green'
                        : selectedSchedule.status === 'rejected'
                        ? 'red'
                        : 'gold'
                    }
                  >
                    {selectedSchedule.status.toUpperCase()}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Created By">
                  {selectedSchedule.createdBy?.username || 'System'}
                </Descriptions.Item>
                <Descriptions.Item label="Created At" span={2}>
                  {dayjs(selectedSchedule.created_at).format('MMMM DD, YYYY HH:mm')}
                </Descriptions.Item>
                {selectedSchedule.approved_by_id && (
                  <>
                    <Descriptions.Item label="Approved/Rejected By">
                      {selectedSchedule.approvedBy?.username || 'N/A'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Approval Date">
                      {selectedSchedule.approval_date
                        ? dayjs(selectedSchedule.approval_date).format('MMMM DD, YYYY HH:mm')
                        : 'N/A'}
                    </Descriptions.Item>
                  </>
                )}
              </Descriptions>
            </Card>

            {selectedSchedule.rejection_reason && (
              <Card>
                <Text strong>Rejection Reason:</Text>
                <p style={{ marginTop: '8px' }}>{selectedSchedule.rejection_reason}</p>
              </Card>
            )}
          </div>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal
        title="Reject Schedule"
        open={rejectModalOpen}
        onCancel={() => {
          setRejectModalOpen(false);
          rejectForm.resetFields();
        }}
        footer={null}
      >
        <Form form={rejectForm} layout="vertical" onFinish={handleRejectSubmit}>
          <Form.Item
            name="rejection_reason"
            label="Rejection Reason"
            rules={[{ required: true, message: 'Please provide a reason for rejection' }]}
          >
            <TextArea rows={4} placeholder="Enter reason for rejecting this schedule" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ float: 'right' }}>
              <Button
                onClick={() => {
                  setRejectModalOpen(false);
                  rejectForm.resetFields();
                }}
              >
                Cancel
              </Button>
              <Button
                type="primary"
                danger
                htmlType="submit"
                loading={rejectMutation.isPending}
              >
                Reject Schedule
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

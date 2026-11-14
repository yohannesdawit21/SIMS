import React, { useState } from 'react';
import {
  Form,
  Input,
  Button,
  Select,
  DatePicker,
  Upload,
  Steps,
  Card,
  Typography,
  message,
  Row,
  Col,
  Space,
  Result,
  Progress,
  Alert,
} from 'antd';
import {
  UserOutlined,
  PhoneOutlined,
  MailOutlined,
  UploadOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../api/axios';
import { submitApplication, uploadDocument } from '../../api/applications';
import type { CreateApplicationDto } from '../../api/applications';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { Step } = Steps;

interface Programme {
  id: string;
  name: string;
  code: string;
}

export default function ApplyPage() {
  const [current, setCurrent] = useState(0);
  const [form] = Form.useForm();
  const [applicationId, setApplicationId] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState({
    photo: 0,
    id_document: 0,
    transcript: 0,
    payment_receipt: 0,
  });
  const [uploadedFiles, setUploadedFiles] = useState({
    photo: false,
    id_document: false,
    transcript: false,
    payment_receipt: false,
  });
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);

  // Fetch programmes for dropdowns
  const { data: programmes = [] } = useQuery<Programme[]>({
    queryKey: ['programmes'],
    queryFn: async () => {
      try {
        const response = await api.get('/programmes');
        return response.data?.data || response.data || [];
      } catch (error) {
        console.error('Failed to fetch programmes:', error);
        return [];
      }
    },
  });

  // Submit application mutation
  const submitMutation = useMutation({
    mutationFn: (values: CreateApplicationDto) => submitApplication(values),
    onSuccess: (data) => {
      setApplicationId(data.id);
      message.success('Application submitted successfully!');
      setCurrent(1);
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message || 'Failed to submit application';
      message.error(msg);
    },
  });

  // Upload document mutation
  const uploadMutation = useMutation({
    mutationFn: ({
      docType,
      file,
    }: {
      docType: 'photo' | 'id_document' | 'transcript' | 'payment_receipt';
      file: File;
    }) => uploadDocument(applicationId, docType, file),
    onSuccess: (_, variables) => {
      setUploadedFiles((prev) => ({ ...prev, [variables.docType]: true }));
      setUploadProgress((prev) => ({ ...prev, [variables.docType]: 100 }));
      message.success(`${variables.docType.replace('_', ' ')} uploaded successfully!`);
    },
    onError: (error: any, variables) => {
      const msg = error.response?.data?.message || `Failed to upload ${variables.docType}`;
      message.error(msg);
      setUploadProgress((prev) => ({ ...prev, [variables.docType]: 0 }));
    },
  });

  const handleSubmit = async (values: any) => {
    const data: CreateApplicationDto = {
      ...values,
      date_of_birth: values.date_of_birth.format('YYYY-MM-DD'),
    };
    submitMutation.mutate(data);
  };

  const handleFileUpload = async (
    docType: 'photo' | 'id_document' | 'transcript' | 'payment_receipt',
    file: File
  ) => {
    setUploadProgress((prev) => ({ ...prev, [docType]: 50 }));
    uploadMutation.mutate({ docType, file });
  };

  const allFilesUploaded = Object.values(uploadedFiles).every((v) => v);

  const steps = [
    {
      title: 'Application Form',
      icon: <UserOutlined />,
    },
    {
      title: 'Upload Documents',
      icon: <UploadOutlined />,
    },
    {
      title: 'Confirmation',
      icon: <CheckCircleOutlined />,
    },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto', minHeight: '100vh', background: '#f0f2f5' }}>
      <Card>
        <Title level={2} style={{ textAlign: 'center' }}>
          Student Application Form
        </Title>
        <Paragraph style={{ textAlign: 'center', marginBottom: '32px' }}>
          Apply for admission to our TVET College
        </Paragraph>

        <Steps current={current} style={{ marginBottom: '32px' }}>
          {steps.map((item) => (
            <Step key={item.title} title={item.title} icon={item.icon} />
          ))}
        </Steps>

        {/* Step 1: Application Form */}
        {current === 0 && (
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            requiredMark="optional"
          >
            <Title level={4}>Personal Information</Title>
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="full_name"
                  label="Full Name"
                  rules={[{ required: true, message: 'Please enter your full name' }]}
                >
                  <Input prefix={<UserOutlined />} placeholder="Enter your full name" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="national_id"
                  label="National ID"
                  rules={[
                    { required: true, message: 'Please enter your national ID' },
                    { len: 6, message: 'National ID must be 6 digits' },
                  ]}
                >
                  <Input placeholder="6-digit ID (last 6 digits will be your password)" maxLength={6} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="date_of_birth"
                  label="Date of Birth"
                  rules={[{ required: true, message: 'Please select your date of birth' }]}
                >
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="gender"
                  label="Gender"
                  rules={[{ required: true, message: 'Please select your gender' }]}
                >
                  <Select placeholder="Select gender">
                    <Select.Option value="male">Male</Select.Option>
                    <Select.Option value="female">Female</Select.Option>
                    <Select.Option value="other">Other</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="phone_number"
                  label="Phone Number"
                  rules={[{ required: true, message: 'Please enter your phone number' }]}
                >
                  <Input prefix={<PhoneOutlined />} placeholder="Enter phone number" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="email_address"
                  label="Email Address"
                  rules={[
                    { required: true, message: 'Please enter your email' },
                    { type: 'email', message: 'Please enter a valid email' },
                  ]}
                >
                  <Input prefix={<MailOutlined />} placeholder="Enter email address" />
                </Form.Item>
              </Col>
            </Row>

            <Title level={4} style={{ marginTop: '24px' }}>
              Educational Background
            </Title>
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="previous_school"
                  label="Previous School"
                  rules={[{ required: true, message: 'Please enter your previous school' }]}
                >
                  <Input placeholder="Enter previous school name" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="education_level"
                  label="Education Level"
                  rules={[{ required: true, message: 'Please enter your education level' }]}
                >
                  <Input placeholder="e.g., High School, Diploma" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="graduation_year"
                  label="Graduation Year"
                  rules={[{ required: true, message: 'Please enter your graduation year' }]}
                >
                  <Input type="number" placeholder="e.g., 2024" />
                </Form.Item>
              </Col>
            </Row>

            <Title level={4} style={{ marginTop: '24px' }}>
              Emergency Contact
            </Title>
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="emergency_contact_name"
                  label="Contact Name"
                  rules={[{ required: true, message: 'Please enter emergency contact name' }]}
                >
                  <Input placeholder="Enter emergency contact name" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="emergency_contact_phone"
                  label="Contact Phone"
                  rules={[{ required: true, message: 'Please enter emergency contact phone' }]}
                >
                  <Input prefix={<PhoneOutlined />} placeholder="Enter emergency phone" />
                </Form.Item>
              </Col>
            </Row>

            <Title level={4} style={{ marginTop: '24px' }}>
              Parent/Guardian Information
            </Title>
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="parent_guardian_name"
                  label="Parent/Guardian Name"
                  rules={[{ required: true, message: 'Please enter parent/guardian name' }]}
                >
                  <Input placeholder="Enter parent/guardian name" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="parent_guardian_phone"
                  label="Parent/Guardian Phone"
                  rules={[{ required: true, message: 'Please enter parent/guardian phone' }]}
                >
                  <Input prefix={<PhoneOutlined />} placeholder="Enter parent/guardian phone" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="parent_guardian_occupation"
                  label="Parent/Guardian Occupation"
                  rules={[{ required: true, message: 'Please enter occupation' }]}
                >
                  <Input placeholder="Enter occupation" />
                </Form.Item>
              </Col>
            </Row>

            <Title level={4} style={{ marginTop: '24px' }}>
              Program Selection
            </Title>
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="first_choice_program_id"
                  label="First Choice Program"
                  rules={[{ required: true, message: 'Please select first choice program' }]}
                >
                  <Select
                    placeholder="Select first choice program"
                    showSearch
                    optionFilterProp="children"
                  >
                    {programmes.map((prog) => (
                      <Select.Option key={prog.id} value={prog.id}>
                        {prog.name} ({prog.code})
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item
                  name="second_choice_program_id"
                  label="Second Choice Program"
                  rules={[{ required: true, message: 'Please select second choice program' }]}
                >
                  <Select
                    placeholder="Select second choice program"
                    showSearch
                    optionFilterProp="children"
                  >
                    {programmes.map((prog) => (
                      <Select.Option key={prog.id} value={prog.id}>
                        {prog.name} ({prog.code})
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Form.Item style={{ marginTop: '32px' }}>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                block
                loading={submitMutation.isPending}
              >
                Submit Application
              </Button>
            </Form.Item>
          </Form>
        )}

        {/* Step 2: Upload Documents */}
        {current === 1 && (
          <div>
            <Alert
              message="Upload Required Documents"
              description="Please upload all required documents to complete your application."
              type="info"
              showIcon
              style={{ marginBottom: '24px' }}
            />

            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              {/* Photo */}
              <Card>
                <Title level={5}>1. Your Photo</Title>
                <Upload
                  accept="image/*"
                  beforeUpload={(file) => {
                    handleFileUpload('photo', file);
                    return false;
                  }}
                  showUploadList={false}
                >
                  <Button
                    icon={uploadedFiles.photo ? <CheckCircleOutlined /> : <UploadOutlined />}
                    loading={uploadMutation.isPending && uploadProgress.photo > 0}
                    disabled={uploadedFiles.photo}
                  >
                    {uploadedFiles.photo ? 'Photo Uploaded' : 'Upload Photo'}
                  </Button>
                </Upload>
                {uploadProgress.photo > 0 && uploadProgress.photo < 100 && (
                  <Progress percent={uploadProgress.photo} status="active" style={{ marginTop: '8px' }} />
                )}
              </Card>

              {/* ID Document */}
              <Card>
                <Title level={5}>2. National ID Document</Title>
                <Upload
                  accept="application/pdf,image/*"
                  beforeUpload={(file) => {
                    handleFileUpload('id_document', file);
                    return false;
                  }}
                  showUploadList={false}
                >
                  <Button
                    icon={uploadedFiles.id_document ? <CheckCircleOutlined /> : <UploadOutlined />}
                    loading={uploadMutation.isPending && uploadProgress.id_document > 0}
                    disabled={uploadedFiles.id_document}
                  >
                    {uploadedFiles.id_document ? 'ID Document Uploaded' : 'Upload ID Document'}
                  </Button>
                </Upload>
                {uploadProgress.id_document > 0 && uploadProgress.id_document < 100 && (
                  <Progress percent={uploadProgress.id_document} status="active" style={{ marginTop: '8px' }} />
                )}
              </Card>

              {/* Transcript */}
              <Card>
                <Title level={5}>3. Academic Transcript</Title>
                <Upload
                  accept="application/pdf"
                  beforeUpload={(file) => {
                    handleFileUpload('transcript', file);
                    return false;
                  }}
                  showUploadList={false}
                >
                  <Button
                    icon={uploadedFiles.transcript ? <CheckCircleOutlined /> : <UploadOutlined />}
                    loading={uploadMutation.isPending && uploadProgress.transcript > 0}
                    disabled={uploadedFiles.transcript}
                  >
                    {uploadedFiles.transcript ? 'Transcript Uploaded' : 'Upload Transcript'}
                  </Button>
                </Upload>
                {uploadProgress.transcript > 0 && uploadProgress.transcript < 100 && (
                  <Progress percent={uploadProgress.transcript} status="active" style={{ marginTop: '8px' }} />
                )}
              </Card>

              {/* Payment Receipt */}
              <Card>
                <Title level={5}>4. Payment Receipt</Title>
                <Upload
                  accept="application/pdf,image/*"
                  beforeUpload={(file) => {
                    handleFileUpload('payment_receipt', file);
                    return false;
                  }}
                  showUploadList={false}
                >
                  <Button
                    icon={uploadedFiles.payment_receipt ? <CheckCircleOutlined /> : <UploadOutlined />}
                    loading={uploadMutation.isPending && uploadProgress.payment_receipt > 0}
                    disabled={uploadedFiles.payment_receipt}
                  >
                    {uploadedFiles.payment_receipt ? 'Receipt Uploaded' : 'Upload Receipt'}
                  </Button>
                </Upload>
                {uploadProgress.payment_receipt > 0 && uploadProgress.payment_receipt < 100 && (
                  <Progress percent={uploadProgress.payment_receipt} status="active" style={{ marginTop: '8px' }} />
                )}
              </Card>
            </Space>

            <Button
              type="primary"
              size="large"
              block
              disabled={!allFilesUploaded}
              onClick={() => setCurrent(2)}
              style={{ marginTop: '32px' }}
            >
              Continue to Confirmation
            </Button>
          </div>
        )}

        {/* Step 3: Confirmation */}
        {current === 2 && (
          <Result
            status="success"
            title="Application Submitted Successfully!"
            subTitle={`Application ID: ${applicationId}`}
            extra={[
              <div key="info" style={{ textAlign: 'left', maxWidth: '500px', margin: '0 auto' }}>
                <Alert
                  message="What's Next?"
                  description={
                    <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                      <li>Your application is now under review</li>
                      <li>You will be notified via email about the status</li>
                      <li>If approved, you will receive your login credentials</li>
                      <li>Keep your Application ID safe for reference</li>
                    </ul>
                  }
                  type="info"
                  showIcon
                />
              </div>,
            ]}
          />
        )}
      </Card>
    </div>
  );
}

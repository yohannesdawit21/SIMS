import React, { useState } from 'react';
import {
  Card, Select, Button, Typography, Row, Col, Input, message, Spin
} from 'antd';
import { DownloadOutlined, FileTextOutlined } from '@ant-design/icons';
import { api } from '../../api/axios';

const REPORT_TYPES = [
  { value: 'enrollment',      label: 'Student Enrollment Report' },
  { value: 'grade',           label: 'Grade Report' },
  { value: 'attendance',      label: 'Attendance Report' },
  { value: 'fee-statement',   label: 'Fee Statement' },
  { value: 'library-loans',   label: 'Library Loan Report' },
  { value: 'hostel-occupancy',label: 'Hostel Occupancy Report' },
  { value: 'alumni',          label: 'Alumni Report' },
  { value: 'placement',       label: 'Placement Report' },
];

export default function ReportsPage() {
  const [reportType, setReportType] = useState<string>('enrollment');
  const [format, setFormat] = useState<'json' | 'csv' | 'pdf'>('json');
  const [filters, setFilters] = useState({
    departmentId: '',
    periodId: '',
    studentId: '',
    graduationYear: '',
  });
  const [loading, setLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setPdfUrl(null);
    try {
      const params = new URLSearchParams({ format });
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });

      if (format === 'csv') {
        const res = await api.get(`/reports/${reportType}?${params.toString()}`, { responseType: 'blob' });
        const url = URL.createObjectURL(res.data as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${reportType}_report.csv`;
        a.click();
        URL.revokeObjectURL(url);
        void message.success('CSV downloaded');
      } else if (format === 'pdf') {
        const res = await api.get<{ success: boolean; data: { url: string } }>(
          `/reports/${reportType}?${params.toString()}`,
        );
        setPdfUrl(res.data.data.url);
        void message.success('PDF ready');
      } else {
        const res = await api.get(`/reports/${reportType}?${params.toString()}`);
        console.info('Report data:', res.data);
        void message.success(`Report generated: ${(res.data as { data: unknown[] }).data?.length ?? 0} records`);
      }
    } catch {
      void message.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Typography.Title level={4}>Reports</Typography.Title>

      <Card>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Typography.Text strong>Report Type</Typography.Text>
            <Select
              value={reportType}
              onChange={setReportType}
              options={REPORT_TYPES}
              style={{ width: '100%', marginTop: 8 }}
            />
          </Col>
          <Col xs={24} md={4}>
            <Typography.Text strong>Format</Typography.Text>
            <Select
              value={format}
              onChange={(v) => setFormat(v as 'json' | 'csv' | 'pdf')}
              options={[
                { value: 'json', label: 'JSON (Preview)' },
                { value: 'csv', label: 'CSV Download' },
                { value: 'pdf', label: 'PDF' },
              ]}
              style={{ width: '100%', marginTop: 8 }}
            />
          </Col>
        </Row>

        <Row gutter={[16, 8]} style={{ marginTop: 16 }}>
          <Col xs={24} md={6}>
            <Typography.Text type="secondary">Department ID (optional)</Typography.Text>
            <Input
              value={filters.departmentId}
              onChange={e => setFilters(f => ({ ...f, departmentId: e.target.value }))}
              placeholder="UUID"
              style={{ marginTop: 4 }}
            />
          </Col>
          <Col xs={24} md={6}>
            <Typography.Text type="secondary">Period ID (optional)</Typography.Text>
            <Input
              value={filters.periodId}
              onChange={e => setFilters(f => ({ ...f, periodId: e.target.value }))}
              placeholder="UUID"
              style={{ marginTop: 4 }}
            />
          </Col>
          <Col xs={24} md={6}>
            <Typography.Text type="secondary">Student ID (optional)</Typography.Text>
            <Input
              value={filters.studentId}
              onChange={e => setFilters(f => ({ ...f, studentId: e.target.value }))}
              placeholder="UUID"
              style={{ marginTop: 4 }}
            />
          </Col>
          <Col xs={24} md={6}>
            <Typography.Text type="secondary">Graduation Year (optional)</Typography.Text>
            <Input
              value={filters.graduationYear}
              onChange={e => setFilters(f => ({ ...f, graduationYear: e.target.value }))}
              placeholder="2024"
              style={{ marginTop: 4 }}
            />
          </Col>
        </Row>

        <Row style={{ marginTop: 24 }} gutter={8}>
          <Col>
            <Button
              type="primary"
              icon={<FileTextOutlined />}
              onClick={generate}
              loading={loading}
              size="large"
            >
              Generate {format.toUpperCase()}
            </Button>
          </Col>
          {pdfUrl && (
            <Col>
              <Button
                icon={<DownloadOutlined />}
                href={pdfUrl}
                target="_blank"
                size="large"
              >
                Download PDF
              </Button>
            </Col>
          )}
        </Row>
      </Card>
    </div>
  );
}

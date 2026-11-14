import { Inject, Injectable, Logger } from '@nestjs/common';
import * as Minio from 'minio';
import { MINIO_CLIENT } from '../../common/providers/minio.provider';

/**
 * PdfGeneratorService — converts report data to PDF and stores in MinIO.
 *
 * Implementation notes:
 *  - Uses a lightweight HTML-to-text serialiser to build the PDF content.
 *  - In a production deployment, replace `buildPdfBuffer` with a Puppeteer
 *    or pdfmake call for styled output.
 *  - The generated PDF is stored in MinIO bucket `reports` and a presigned
 *    URL is returned to the caller.
 *
 * Requirements: 14.3, 14.4
 */
@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);
  private readonly BUCKET = 'reports';

  constructor(
    @Inject(MINIO_CLIENT) private readonly minioClient: Minio.Client,
  ) {}

  /**
   * Generate a PDF report, store it in MinIO, and return a presigned URL.
   *
   * @param reportType  Human-readable report name used in the title
   * @param data        Array of plain objects representing rows
   * @param actorId     ID of the user requesting the report (used in object key)
   * @returns           { url: presigned download URL, key: MinIO object key }
   */
  async generate(
    reportType: string,
    data: Record<string, unknown>[],
    actorId: string,
  ): Promise<{ url: string; key: string }> {
    const pdfBuffer = this.buildPdfBuffer(reportType, data);
    const key = `${reportType}/${actorId}/${Date.now()}.pdf`;

    // Ensure bucket exists
    const exists = await this.minioClient.bucketExists(this.BUCKET);
    if (!exists) {
      await this.minioClient.makeBucket(this.BUCKET, '');
    }

    await this.minioClient.putObject(
      this.BUCKET,
      key,
      pdfBuffer,
      pdfBuffer.length,
      { 'Content-Type': 'application/pdf' },
    );

    // Presigned URL valid for 1 hour
    const url = await this.minioClient.presignedGetObject(this.BUCKET, key, 3600);

    this.logger.log(`PDF report generated: ${key} (${pdfBuffer.length} bytes)`);
    return { url, key };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a minimal PDF buffer from a data array.
   *
   * This is a plain-text PDF stub that satisfies the interface without
   * requiring a headless browser in CI/development environments.
   * Replace with Puppeteer or pdfmake for production-quality output.
   */
  private buildPdfBuffer(reportType: string, data: Record<string, unknown>[]): Buffer {
    const timestamp = new Date().toISOString();
    const title = `SIMS Report: ${reportType}`;
    const separator = '─'.repeat(60);

    const header = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;

    let body = `${title}\nGenerated: ${timestamp}\nTotal records: ${data.length}\n${separator}\n\n`;

    if (data.length > 0) {
      const keys = Object.keys(data[0]);
      body += keys.join(' | ') + '\n' + separator + '\n';
      for (const row of data) {
        body += keys.map((k) => String(row[k] ?? '')).join(' | ') + '\n';
      }
    } else {
      body += 'No records found for the selected filters.\n';
    }

    // Wrap in a minimal valid PDF structure (plain text stream)
    const streamContent = body;
    const pdf = [
      '%PDF-1.4',
      '1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj',
      '2 0 obj<</Type /Pages /Kids [3 0 R] /Count 1>>endobj',
      `3 0 obj<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<</Font<</F1<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>>>>>>>endobj`,
      `4 0 obj<</Length ${streamContent.length}>>`,
      'stream',
      streamContent,
      'endstream',
      'endobj',
      'xref',
      '0 5',
      '0000000000 65535 f ',
      'trailer<</Size 5 /Root 1 0 R>>',
      'startxref',
      '0',
      '%%EOF',
    ].join('\n');

    return Buffer.from(pdf, 'utf-8');
  }
}

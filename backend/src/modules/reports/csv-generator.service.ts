import { Injectable, Logger } from '@nestjs/common';

/**
 * CsvGeneratorService — converts flat data arrays to RFC 4180 CSV strings.
 *
 * Requirements: 14.3, 14.4
 */
@Injectable()
export class CsvGeneratorService {
  private readonly logger = new Logger(CsvGeneratorService.name);

  /**
   * Generate a CSV string from an array of plain objects.
   *
   * @param data    Array of objects (each row). All rows should share the same keys.
   * @param headers Optional column header labels. If omitted, object keys are used.
   * @returns       RFC 4180 CSV string (UTF-8).
   */
  generate(data: Record<string, unknown>[], headers?: string[]): string {
    if (data.length === 0) return '';

    const keys = Object.keys(data[0]);
    const columnHeaders = headers ?? keys;

    const escape = (value: unknown): string => {
      const str = value === null || value === undefined ? '' : String(value);
      // Wrap in quotes if the value contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerRow = columnHeaders.map(escape).join(',');
    const rows = data.map((row) =>
      keys.map((key) => escape(row[key])).join(','),
    );

    const csv = [headerRow, ...rows].join('\r\n');
    this.logger.debug(`CSV generated: ${data.length} rows, ${keys.length} columns`);
    return csv;
  }

  /**
   * Flatten a nested object to one level deep for CSV export.
   * Nested objects become "parent.child" keys.
   */
  flatten(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        Object.assign(result, this.flatten(value as Record<string, unknown>, fullKey));
      } else {
        result[fullKey] = value;
      }
    }
    return result;
  }
}

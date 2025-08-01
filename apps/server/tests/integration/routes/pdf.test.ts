import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '@/server';

vi.mock('@/lib/browser', () => ({
  pdfService: {
    generatePdf: vi.fn(),
  },
}));

vi.mock('@/lib/helpers/asset-helper', () => ({
  generateShortIdentifier: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { pdfService } from '@/lib/browser';
import { generateShortIdentifier } from '@/lib/helpers/asset-helper';
import {
  HEADER_PDF_FORMAT_IDENTIFIER,
  HEADER_PDF_LANDSCAPE_IDENTIFIER,
  HEADER_PDF_PRINT_BACKGROUND_IDENTIFIER,
  HEADER_PDF_SCALE_IDENTIFIER,
} from '@ojo/libs/build/constants/request-headers';

describe('PDF Routes Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateShortIdentifier).mockReturnValue('test-pdf-123');
  });

  describe('POST /', () => {
    it('should generate PDF from HTML successfully with default options', async () => {
      const mockPdfData = Buffer.from('mock-pdf-data');
      vi.mocked(pdfService.generatePdf).mockResolvedValue({
        success: true,
        data: mockPdfData,
        error: undefined,
        logs: [],
      });

      const response = await request(app)
        .post('/v1/pdf')
        .set('Content-Type', 'text/html')
        .send('<div>Hello PDF World</div>');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toBe(
        'inline; filename="test-pdf-123.pdf"'
      );
      expect(response.headers['content-length']).toBe(
        mockPdfData.length.toString()
      );

      expect(pdfService.generatePdf).toHaveBeenCalledWith({
        html: '<div>Hello PDF World</div>',
        format: 'A4',
        landscape: false,
        printBackground: true,
        scale: 1,
      });
    });

    it('should generate PDF with custom options from headers', async () => {
      const mockPdfData = Buffer.from('mock-pdf-data');
      vi.mocked(pdfService.generatePdf).mockResolvedValue({
        success: true,
        data: mockPdfData,
        error: undefined,
        logs: [],
      });

      const response = await request(app)
        .post('/v1/pdf')
        .set('Content-Type', 'text/html')
        .set(HEADER_PDF_FORMAT_IDENTIFIER, 'Letter')
        .set(HEADER_PDF_LANDSCAPE_IDENTIFIER, 'true')
        .set(HEADER_PDF_PRINT_BACKGROUND_IDENTIFIER, 'false')
        .set(HEADER_PDF_SCALE_IDENTIFIER, '1.5')
        .send('<div>Custom PDF</div>');

      expect(response.status).toBe(200);

      expect(pdfService.generatePdf).toHaveBeenCalledWith({
        html: '<div>Custom PDF</div>',
        format: 'Letter',
        landscape: true,
        printBackground: false,
        scale: 1.5,
      });
    });

    it('should return error for invalid content type', async () => {
      const response = await request(app)
        .post('/v1/pdf')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ html: '<div>test</div>' }));

      expect(response.status).toBe(422);
      expect(response.body.error).toBe(true);
      expect(
        response.body.logs.some(
          (log: string) =>
            log ===
            'Invalid content type. Send text/html in the request headers'
        )
      ).toBe(true);
    });

    it('should return error when HTML is missing', async () => {
      const response = await request(app)
        .post('/v1/pdf')
        .set('Content-Type', 'text/html')
        .send('');

      expect(response.status).toBe(422);
      expect(response.body.error).toBe(true);
      expect(
        response.body.logs.some(
          (log: string) =>
            log === 'Template missing. Send html in the request body'
        )
      ).toBe(true);
    });

    it('should handle PDF generation service errors', async () => {
      vi.mocked(pdfService.generatePdf).mockResolvedValue({
        success: false,
        data: undefined,
        error: 'PDF generation failed',
        logs: ['Browser error occurred'],
      });

      const response = await request(app)
        .post('/v1/pdf')
        .set('Content-Type', 'text/html')
        .send('<div>Test PDF</div>');

      expect(response.status).toBe(422);
      expect(response.body.error).toBe(true);
      expect(response.body.logs).toContain('PDF generation failed');
    });

    it('should handle PDF generation service errors with no specific error message', async () => {
      vi.mocked(pdfService.generatePdf).mockResolvedValue({
        success: false,
        data: undefined,
        error: undefined,
        logs: ['Some browser logs'],
      });

      const response = await request(app)
        .post('/v1/pdf')
        .set('Content-Type', 'text/html')
        .send('<div>Test PDF</div>');

      expect(response.status).toBe(422);
      expect(response.body.error).toBe(true);
      expect(response.body.logs).toContain('Failed to generate PDF');
    });

    it('should handle unexpected errors during PDF generation', async () => {
      vi.mocked(pdfService.generatePdf).mockRejectedValue(
        new Error('Unexpected error')
      );

      const response = await request(app)
        .post('/v1/pdf')
        .set('Content-Type', 'text/html')
        .send('<div>Test PDF</div>');

      expect(response.status).toBe(422);
      expect(response.body.error).toBe(true);
      expect(response.body.logs).toContain(
        'An error occurred while generating the PDF'
      );
    });

    it('should parse scale header correctly when invalid', async () => {
      const mockPdfData = Buffer.from('mock-pdf-data');
      vi.mocked(pdfService.generatePdf).mockResolvedValue({
        success: true,
        data: mockPdfData,
        error: undefined,
        logs: [],
      });

      const response = await request(app)
        .post('/v1/pdf')
        .set('Content-Type', 'text/html')
        .set(HEADER_PDF_SCALE_IDENTIFIER, 'invalid-scale')
        .send('<div>Test PDF</div>');

      expect(response.status).toBe(200);

      expect(pdfService.generatePdf).toHaveBeenCalledWith({
        html: '<div>Test PDF</div>',
        format: 'A4',
        landscape: false,
        printBackground: true,
        scale: 1, // Should default to 1 when parseFloat returns NaN
      });
    });

    it('should handle different PDF formats', async () => {
      const mockPdfData = Buffer.from('mock-pdf-data');
      vi.mocked(pdfService.generatePdf).mockResolvedValue({
        success: true,
        data: mockPdfData,
        error: undefined,
        logs: [],
      });

      const formats = ['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid'];

      for (const format of formats) {
        await request(app)
          .post('/v1/pdf')
          .set('Content-Type', 'text/html')
          .set(HEADER_PDF_FORMAT_IDENTIFIER, format)
          .send('<div>Test PDF</div>');

        expect(pdfService.generatePdf).toHaveBeenCalledWith(
          expect.objectContaining({
            format,
          })
        );
      }
    });
  });
});

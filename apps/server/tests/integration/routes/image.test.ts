import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '@/server';

vi.mock('@ojo/database', () => ({
  queries: {
    imageGeneration: {
      getImageRecord: vi.fn(),
      getImageRecords: vi.fn(),
      recordImageGeneration: vi.fn(),
      deleteImageRecord: vi.fn(),
    },
    imageTemplate: {
      getImageTemplate: vi.fn(),
    },
  },
}));

vi.mock('@/services/storage', () => ({
  storeImage: vi.fn(),
}));

vi.mock('@/services/image-transformer', () => ({
  imageTransformService: {
    process: vi.fn(),
  },
}));

const mockStorageMethods = {
  get: vi.fn(),
  delete: vi.fn(),
  upload: vi.fn(),
};

vi.mock('@/lib/s3/storage-helper', () => ({
  Storage: vi.fn().mockImplementation(() => mockStorageMethods),
}));

vi.mock('@/lib/browser', () => ({
  screenshotService: {
    takeScreenshot: vi.fn(),
  },
}));

vi.mock('@/lib/helpers/asset-helper', () => ({
  generateShortIdentifier: vi.fn(),
}));

vi.mock('@/lib/helpers/background-task-helper', () => ({
  executeBackgroundTask: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { queries } from '@ojo/database';
import { storeImage } from '@/services/storage';
import { Storage } from '@/lib/s3/storage-helper';
import { screenshotService } from '@/lib/browser';
import { generateShortIdentifier } from '@/lib/helpers/asset-helper';
import { executeBackgroundTask } from '@/lib/helpers/background-task-helper';
import { imageTransformService } from '@/services/image-transformer';
import {
  HEADER_SCREENSHOT_TRANSPARENT_BACKGROUND_IDENTIFIER,
  HEADER_SCREENSHOT_VIEWPORT_HEIGHT_IDENTIFIER,
  HEADER_SCREENSHOT_VIEWPORT_WIDTH_IDENTIFIER,
} from '@ojo/libs/build/constants/request-headers';

describe('Image Routes Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateShortIdentifier).mockReturnValue('test-id-123');
    vi.mocked(executeBackgroundTask).mockImplementation(async (task) => {
      await task();
    });
  });

  describe('POST /template', () => {
    it('should generate image from template successfully', async () => {
      const mockTemplate = {
        created_at: new Date(),
        name: 'Test Template',
        template_id: 'template-123',
        html: '<div>{{name}}</div>',
        deleted_at: null,
        updated_at: new Date(),
        variables: { name: 'default' },
        preview_storage_path: 'templates/preview.png',
        description: 'Test template',
        default_dimensions: { width: 1280, height: 800 },
      };

      vi.mocked(queries.imageTemplate.getImageTemplate).mockResolvedValue(
        mockTemplate
      );
      vi.mocked(screenshotService.takeScreenshot).mockResolvedValue({
        success: true,
        data: Buffer.from('mock-image-data'),
        error: undefined,
        logs: [],
      });
      vi.mocked(storeImage).mockResolvedValue({
        publicImageId: 'test-id-123.png',
        filepath: 'images/test-id-123.png',
        created_at: '2023-01-01T00:00:00Z',
      });

      const response = await request(app)
        .post('/v1/image/template')
        .send({
          templateId: 'template-123',
          modify: { name: 'John' },
          viewportHeight: 800,
          viewportWidth: 1280,
          transparentBackground: true,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 'test-id-123.png',
        createdAt: expect.any(String),
      });

      expect(queries.imageTemplate.getImageTemplate).toHaveBeenCalledWith(
        'template-123'
      );
      expect(screenshotService.takeScreenshot).toHaveBeenCalledWith({
        html: '<div>John</div>',
        viewportHeight: 800,
        viewportWidth: 1280,
        transparent: true,
      });
    });

    it('should return error when templateId is missing', async () => {
      const response = await request(app).post('/v1/image/template').send({});

      expect(response.status).toBe(422);
      expect(response.body.error).toBe(true);
      expect(
        response.body.logs.some(
          (log: string) => log === "Provide 'templateId' in the request body"
        )
      ).toBe(true);
    });

    it('should return error when template not found', async () => {
      vi.mocked(queries.imageTemplate.getImageTemplate).mockResolvedValue(null);

      const response = await request(app)
        .post('/v1/image/template')
        .send({ templateId: 'non-existent' });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe(true);
      expect(
        response.body.logs.some((log: string) => log === 'Template not found')
      ).toBe(true);
    });

    it('should handle screenshot service errors', async () => {
      const mockTemplate = {
        created_at: new Date(),
        name: 'Test Template',
        template_id: 'template-123',
        html: '<div>{{name}}</div>',
        deleted_at: null,
        updated_at: new Date(),
        variables: { name: 'default' },
        preview_storage_path: 'templates/preview.png',
        description: 'Test template',
        default_dimensions: { width: 1280, height: 800 },
      };

      vi.mocked(queries.imageTemplate.getImageTemplate).mockResolvedValue(
        mockTemplate
      );
      vi.mocked(screenshotService.takeScreenshot).mockResolvedValue({
        success: false,
        data: undefined,
        error: 'Screenshot failed',
        logs: ['Browser error'],
      });

      const response = await request(app)
        .post('/v1/image/template')
        .send({ templateId: 'template-123' });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe(true);
      expect(response.body.message).toContain('Screenshot failed');
    });
  });

  describe('POST /html', () => {
    it('should generate image from HTML successfully', async () => {
      vi.mocked(screenshotService.takeScreenshot).mockResolvedValue({
        success: true,
        data: Buffer.from('mock-image-data'),
        error: undefined,
        logs: [],
      });
      vi.mocked(storeImage).mockResolvedValue({
        publicImageId: 'test-id-123.png',
        filepath: 'images/test-id-123.png',
        created_at: '2023-01-01T00:00:00Z',
      });

      const response = await request(app)
        .post('/v1/image/html')
        .set('Content-Type', 'text/html')
        .set(HEADER_SCREENSHOT_TRANSPARENT_BACKGROUND_IDENTIFIER, 'true')
        .set(HEADER_SCREENSHOT_VIEWPORT_HEIGHT_IDENTIFIER, '900')
        .set(HEADER_SCREENSHOT_VIEWPORT_WIDTH_IDENTIFIER, '1200')
        .send('<div>Hello World</div>');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 'test-id-123.png',
        createdAt: expect.any(String),
      });

      expect(screenshotService.takeScreenshot).toHaveBeenCalledWith({
        html: '<div>Hello World</div>',
        viewportHeight: 900,
        viewportWidth: 1200,
        transparent: true,
      });
    });

    it('should return error for invalid content type', async () => {
      const response = await request(app)
        .post('/v1/image/html')
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
        .post('/v1/image/html')
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
  });

  describe('GET /:imageId', () => {
    it('should return image data successfully', async () => {
      const mockRecord = {
        id: 1,
        created_at: new Date('2023-01-01T00:00:00Z'),
        payload: {},
        filepath: 'images/test-555-aaa-333.png',
        template_id: null,
        html: '<div>test</div>',
        public_id: 'test-123',
        deleted_at: null,
        delete_reason: null,
        size_bytes: 1024,
      };
      const mockImageData = Buffer.from('image-data');

      vi.mocked(queries.imageGeneration.getImageRecord).mockResolvedValue(
        mockRecord
      );

      vi.mocked(mockStorageMethods.get).mockResolvedValue(mockImageData);

      const response = await request(app).get('/v1/image/test-123');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/png');
      expect(response.headers['cache-control']).toBe('public, max-age=86400');
      expect(response.headers['content-length']).toBe(
        mockImageData.length.toString()
      );

      expect(queries.imageGeneration.getImageRecord).toHaveBeenCalledWith(
        'test-123'
      );
    });

    it('should return 404 when image not found', async () => {
      vi.mocked(queries.imageGeneration.getImageRecord).mockResolvedValue(null);

      const response = await request(app).get('/v1/image/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe(true);
      expect(response.body.message).toContain('Image not found');
    });

    it('should return 404 when image file not found in storage', async () => {
      const mockRecord = {
        id: 1,
        created_at: new Date(),
        payload: {},
        filepath: 'images/test-123.png',
        template_id: null,
        html: '<div>test</div>',
        public_id: 'test-123',
        deleted_at: null,
        delete_reason: null,
        size_bytes: 1024,
      };

      vi.mocked(queries.imageGeneration.getImageRecord).mockResolvedValue(
        mockRecord
      );
      vi.mocked(mockStorageMethods.get).mockResolvedValue(undefined);

      const response = await request(app).get('/v1/image/test-123');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe(true);
      expect(response.body.message).toContain(
        'Image file not found in storage'
      );
    });
  });

  describe('DELETE /:imageId', () => {
    it('should delete image successfully', async () => {
      const mockRecord = {
        id: 1,
        created_at: new Date('2023-01-01T00:00:00Z'),
        payload: {},
        filepath: 'images/test-123.png',
        template_id: null,
        html: '<div>test</div>',
        public_id: 'test-123',
        deleted_at: null,
        delete_reason: null,
        size_bytes: 1024,
      };

      vi.mocked(queries.imageGeneration.getImageRecord).mockResolvedValue(
        mockRecord
      );
      vi.mocked(mockStorageMethods.delete).mockResolvedValue(true);
      vi.mocked(queries.imageGeneration.deleteImageRecord).mockResolvedValue(
        mockRecord
      );

      const response = await request(app).delete('/v1/image/test-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ deleted: true });

      expect(mockStorageMethods.delete).toHaveBeenCalled();
      expect(queries.imageGeneration.deleteImageRecord).toHaveBeenCalledWith(
        'test-123'
      );
    });

    it('should return 404 when image not found', async () => {
      vi.mocked(queries.imageGeneration.getImageRecord).mockResolvedValue(null);

      const response = await request(app).delete('/v1/image/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe(true);
    });

    it('should return 500 when storage deletion fails', async () => {
      const mockRecord = {
        id: 1,
        created_at: new Date('2023-01-01T00:00:00Z'),
        payload: {},
        filepath: 'images/test-123.png',
        template_id: null,
        html: '<div>test</div>',
        public_id: 'test-123',
        deleted_at: null,
        delete_reason: null,
        size_bytes: 1024,
      };

      vi.mocked(queries.imageGeneration.getImageRecord).mockResolvedValue(
        mockRecord
      );
      vi.mocked(mockStorageMethods.delete).mockResolvedValue(false);

      const response = await request(app).delete('/v1/image/test-123');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe(true);
    });
  });

  describe('DELETE / (batch delete)', () => {
    it('should delete multiple images successfully', async () => {
      const imageIds = ['test-1', 'test-2'];
      const mockRecord = {
        id: 1,
        created_at: new Date('2023-01-01T00:00:00Z'),
        payload: {},
        filepath: 'images/test.png',
        template_id: null,
        html: '<div>test</div>',
        public_id: 'test-1',
        deleted_at: null,
        delete_reason: null,
        size_bytes: 1024,
      };

      vi.mocked(queries.imageGeneration.getImageRecord).mockResolvedValue(
        mockRecord
      );
      vi.mocked(mockStorageMethods.delete).mockResolvedValue(true);
      vi.mocked(queries.imageGeneration.deleteImageRecord).mockResolvedValue(
        mockRecord
      );

      const response = await request(app)
        .delete('/v1/image')
        .send({ imageIds });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        successful: imageIds,
        failed: [],
        totalProcessed: 2,
        successCount: 2,
        failureCount: 0,
      });
    });

    it('should return error when imageIds is missing', async () => {
      const response = await request(app).delete('/v1/image').send({});

      expect(response.status).toBe(422);
      expect(response.body.error).toBe(true);

      expect(
        response.body.logs.some(
          (log: string) => log === 'imageIds array required in request body'
        )
      ).toBe(true);
    });

    it('should return error when batch size exceeds limit', async () => {
      const imageIds = Array.from({ length: 51 }, (_, i) => `test-${i}`);

      const response = await request(app)
        .delete('/v1/image')
        .send({ imageIds });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe(true);

      expect(
        response.body.logs.some(
          (log: string) => log === 'Maximum 50 images can be deleted at once'
        )
      ).toBe(true);
    });
  });

  describe('GET /transform/:options/*', () => {
    it('should transform image successfully', async () => {
      const mockTransformedData = Buffer.from('transformed-image-data');
      vi.mocked(imageTransformService.process).mockResolvedValue({
        data: mockTransformedData,
        format: 'webp',
      });

      const sourceUrl = 'https://example.com/image.jpg';
      const response = await request(app).get(
        `/v1/image/transform/w-200,h-300,fmt-webp/${encodeURIComponent(sourceUrl)}`
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/webp');
      expect(response.headers['cache-control']).toBe('public, max-age=86400');

      expect(imageTransformService.process).toHaveBeenCalledWith(
        sourceUrl,
        expect.objectContaining({
          width: 200,
          height: 300,
          format: 'webp',
          url: sourceUrl,
        })
      );
    });

    it('should return error when transformation options are missing', async () => {
      const response = await request(app).get(
        '/v1/image/transform/https://example.com/image.jpg'
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(true);

      expect(response.body.message).toEqual('Valid source URL is required');
    });

    it('should return error when source URL is missing', async () => {
      const response = await request(app).get('/v1/image/transform/w-200');

      expect(response.status).toBe(404);
    });
  });
});

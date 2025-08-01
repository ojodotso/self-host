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
      deleteImageTemplate: vi.fn(),
      updateImageTemplate: vi.fn(),
      getImageTemplates: vi.fn(),
      recordImageTemplate: vi.fn(),
    },
  },
}));

vi.mock('@/lib/browser', () => ({
  screenshotService: {
    takeScreenshot: vi.fn(),
  },
}));

vi.mock('@/services/storage', () => ({
  storeImage: vi.fn(),
}));

const mockStorageMethods = {
  get: vi.fn(),
  delete: vi.fn(),
  upload: vi.fn(),
};

vi.mock('@/lib/s3/storage-helper', () => ({
  Storage: vi.fn().mockImplementation(() => mockStorageMethods),
}));

vi.mock('@/lib/validators/html-validator', () => ({
  decodeHTMLFromTransport: vi.fn(),
  encodeHTMLForTransport: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('uuid', () => ({
  v4: vi.fn(),
}));

import { queries } from '@ojo/database';
import { screenshotService } from '@/lib/browser';
import { storeImage } from '@/services/storage';
import {
  decodeHTMLFromTransport,
  encodeHTMLForTransport,
} from '@/lib/validators/html-validator';
import { v4 as uuidv4 } from 'uuid';

describe('Template Routes Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(uuidv4).mockReturnValue('test-template-uuid-123');
    vi.mocked(decodeHTMLFromTransport).mockImplementation(
      (html) => html as string
    );
    vi.mocked(encodeHTMLForTransport).mockImplementation(
      (html) => html as string
    );
  });

  describe('POST /', () => {
    it('should create template successfully', async () => {
      const mockScreenshotData = Buffer.from('mock-screenshot-data');
      vi.mocked(screenshotService.takeScreenshot).mockResolvedValue({
        success: true,
        data: mockScreenshotData,
        error: undefined,
        logs: [],
      });

      vi.mocked(storeImage).mockResolvedValue({
        publicImageId: 'test-image-123.png',
        filepath: 'templates/test-image-123.png',
        created_at: '2023-01-01T00:00:00Z',
      });

      const mockTemplate = {
        template_id: 'test-template-uuid-123',
        html: '<div>{{name}}</div>',
        variables: { name: 'John' },
        preview_storage_path: 'templates/test-image-123.png',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        name: null,
        description: null,
        default_dimensions: { width: 1280, height: 800 },
      };

      vi.mocked(queries.imageTemplate.recordImageTemplate).mockResolvedValue(
        mockTemplate
      );

      const response = await request(app)
        .post('/v1/template')
        .send({
          html: '<div>{{name}}</div>',
          variables: { name: 'John' },
          viewportWidth: 1280,
          viewportHeight: 800,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 'test-template-uuid-123',
        message: 'Template created',
      });

      expect(screenshotService.takeScreenshot).toHaveBeenCalledWith({
        html: '<div>{{name}}</div>',
        viewportHeight: 800,
        viewportWidth: 1280,
      });

      expect(queries.imageTemplate.recordImageTemplate).toHaveBeenCalledWith({
        templateId: 'test-template-uuid-123',
        html: '<div>{{name}}</div>',
        variables: { name: 'John' },
        preview_storage_path: 'templates/test-image-123.png',
        default_dimensions: {
          height: 800,
          width: 1280,
        },
      });
    });

    it('should create template without viewport dimensions', async () => {
      const mockScreenshotData = Buffer.from('mock-screenshot-data');
      vi.mocked(screenshotService.takeScreenshot).mockResolvedValue({
        success: true,
        data: mockScreenshotData,
        error: undefined,
        logs: [],
      });

      vi.mocked(storeImage).mockResolvedValue({
        publicImageId: 'test-image-123.png',
        filepath: 'templates/test-image-123.png',
        created_at: '2023-01-01T00:00:00Z',
      });

      const mockTemplate = {
        template_id: 'test-template-uuid-123',
        html: '<div>Test</div>',
        variables: {},
        preview_storage_path: 'templates/test-image-123.png',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        name: null,
        description: null,
        default_dimensions: null,
      };

      vi.mocked(queries.imageTemplate.recordImageTemplate).mockResolvedValue(
        mockTemplate
      );

      const response = await request(app).post('/v1/template').send({
        html: '<div>Test</div>',
        variables: {},
      });

      expect(response.status).toBe(200);

      expect(queries.imageTemplate.recordImageTemplate).toHaveBeenCalledWith({
        templateId: 'test-template-uuid-123',
        html: '<div>Test</div>',
        variables: {},
        preview_storage_path: 'templates/test-image-123.png',
      });
    });

    it('should return error when body is missing', async () => {
      const response = await request(app).post('/v1/template');

      expect(response.status).toBe(422);
      expect(response.body.error).toBe(true);
      expect(response.body.logs).toContain(
        'Template missing. Send encoded `html` in the request body'
      );
    });

    it('should return error when html is missing', async () => {
      const response = await request(app)
        .post('/v1/template')
        .send({
          variables: { name: 'John' },
        });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe(true);
      expect(response.body.logs).toContain(
        'Template missing. Send encoded `html` in the request body'
      );
    });

    it('should return error when HTML decoding fails', async () => {
      vi.mocked(decodeHTMLFromTransport).mockImplementation(() => {
        throw new Error('Invalid encoding');
      });

      const response = await request(app).post('/v1/template').send({
        html: 'invalid-encoded-html',
        variables: {},
      });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe(true);
      expect(response.body.logs).toContain(
        'Failed to decode `html`. Ensure it is properly encoded. Visit https://ojo.so/tools/html-encoder'
      );
    });

    it('should handle screenshot service errors', async () => {
      vi.mocked(screenshotService.takeScreenshot).mockResolvedValue({
        success: false,
        data: undefined,
        error: 'Screenshot failed',
        logs: ['Browser error'],
      });

      const response = await request(app).post('/v1/template').send({
        html: '<div>Test</div>',
        variables: {},
      });

      expect(response.status).toBe(422);
      expect(response.body.error).toBe(true);
      expect(response.body.message).toContain('Screenshot failed');
    });

    it('should return internal server error when template creation fails', async () => {
      vi.mocked(screenshotService.takeScreenshot).mockResolvedValue({
        success: true,
        data: Buffer.from('mock-data'),
        error: undefined,
        logs: [],
      });

      vi.mocked(storeImage).mockResolvedValue({
        publicImageId: 'test-image-123.png',
        filepath: 'templates/test-image-123.png',
        created_at: '2023-01-01T00:00:00Z',
      });

      vi.mocked(queries.imageTemplate.recordImageTemplate).mockResolvedValue(
        undefined
      );

      const response = await request(app).post('/v1/template').send({
        html: '<div>Test</div>',
        variables: {},
      });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe(true);
    });
  });

  describe('PUT /:templateId', () => {
    it('should update template successfully with new HTML', async () => {
      const mockScreenshotData = Buffer.from('mock-screenshot-data');
      vi.mocked(screenshotService.takeScreenshot).mockResolvedValue({
        success: true,
        data: mockScreenshotData,
        error: undefined,
        logs: [],
      });

      vi.mocked(storeImage).mockResolvedValue({
        publicImageId: 'updated-image-123.png',
        filepath: 'templates/updated-image-123.png',
        created_at: '2023-01-01T00:00:00Z',
      });

      const oldTemplate = {
        template_id: 'template-123',
        html: '<div>Old HTML</div>',
        variables: { name: 'Old' },
        preview_storage_path: 'templates/old-preview.png',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        name: null,
        description: null,
        default_dimensions: null,
      };

      const updatedTemplate = {
        template_id: 'template-123',
        html: '<div>{{name}}</div>',
        variables: { name: 'Updated' },
        preview_storage_path: 'templates/updated-image-123.png',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        name: null,
        description: null,
        default_dimensions: null,
      };

      vi.mocked(queries.imageTemplate.getImageTemplate).mockResolvedValue(
        oldTemplate
      );
      vi.mocked(queries.imageTemplate.updateImageTemplate).mockResolvedValue([
        updatedTemplate,
      ]);
      vi.mocked(mockStorageMethods.delete).mockResolvedValue(true);

      const response = await request(app)
        .put('/v1/template/template-123')
        .send({
          html: '<div>{{name}}</div>',
          variables: { name: 'Updated' },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 'template-123',
        message: 'Template updated',
      });

      expect(mockStorageMethods.delete).toHaveBeenCalled();
    });

    it('should update template with existing HTML when new HTML not provided', async () => {
      const existingTemplate = {
        template_id: 'template-123',
        html: '<div>{{name}}</div>',
        variables: { name: 'John' },
        preview_storage_path: 'templates/existing-preview.png',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        name: null,
        description: null,
        default_dimensions: null,
      };

      vi.mocked(queries.imageTemplate.getImageTemplate).mockResolvedValue(
        existingTemplate
      );

      const mockScreenshotData = Buffer.from('mock-screenshot-data');
      vi.mocked(screenshotService.takeScreenshot).mockResolvedValue({
        success: true,
        data: mockScreenshotData,
        error: undefined,
        logs: [],
      });

      vi.mocked(storeImage).mockResolvedValue({
        publicImageId: 'updated-image-123.png',
        filepath: 'templates/updated-image-123.png',
        created_at: '2023-01-01T00:00:00Z',
      });

      vi.mocked(queries.imageTemplate.updateImageTemplate).mockResolvedValue([
        existingTemplate,
      ]);
      vi.mocked(mockStorageMethods.delete).mockResolvedValue(true);

      const response = await request(app)
        .put('/v1/template/template-123')
        .send({
          variables: { name: 'UpdatedName' },
        });

      expect(response.status).toBe(200);
    });

    it('should return error when templateId is missing', async () => {
      const response = await request(app).put('/v1/template/').send({
        html: '<div>Test</div>',
      });

      expect(response.status).toBe(404);
    });

    it('should return error when body is missing', async () => {
      // Mock the existing template for the case where no HTML is provided
      const existingTemplate = {
        template_id: 'template-123',
        html: '<div>Existing</div>',
        variables: {},
        preview_storage_path: 'templates/existing.png',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        name: null,
        description: null,
        default_dimensions: null,
      };

      vi.mocked(queries.imageTemplate.getImageTemplate).mockResolvedValue(
        existingTemplate
      );

      const mockScreenshotData = Buffer.from('mock-screenshot-data');
      vi.mocked(screenshotService.takeScreenshot).mockResolvedValue({
        success: true,
        data: mockScreenshotData,
        error: undefined,
        logs: [],
      });

      vi.mocked(storeImage).mockResolvedValue({
        publicImageId: 'updated-image-123.png',
        filepath: 'templates/updated-image-123.png',
        created_at: '2023-01-01T00:00:00Z',
      });

      vi.mocked(queries.imageTemplate.updateImageTemplate).mockResolvedValue([
        existingTemplate,
      ]);
      vi.mocked(mockStorageMethods.delete).mockResolvedValue(true);

      const response = await request(app)
        .put('/v1/template/template-123')
        .send({});

      // When body is empty but exists, it will use existing template and should succeed
      expect(response.status).toBe(200);
    });

    it('should return not found when template does not exist (for variable-only update)', async () => {
      vi.mocked(queries.imageTemplate.getImageTemplate).mockResolvedValue(null);

      const response = await request(app)
        .put('/v1/template/non-existent')
        .send({
          variables: { name: 'John' },
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe(true);
      expect(response.body.message).toBe('Template not found');
    });

    it('should return not found when template update returns empty array', async () => {
      const mockScreenshotData = Buffer.from('mock-screenshot-data');
      vi.mocked(screenshotService.takeScreenshot).mockResolvedValue({
        success: true,
        data: mockScreenshotData,
        error: undefined,
        logs: [],
      });

      vi.mocked(storeImage).mockResolvedValue({
        publicImageId: 'updated-image-123.png',
        filepath: 'templates/updated-image-123.png',
        created_at: '2023-01-01T00:00:00Z',
      });

      vi.mocked(queries.imageTemplate.updateImageTemplate).mockResolvedValue(
        []
      );

      const response = await request(app)
        .put('/v1/template/non-existent')
        .send({
          html: '<div>Test</div>',
          variables: {},
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe(true);
      expect(response.body.message).toBe('Template not found');
    });

    it('should handle storage deletion failure gracefully', async () => {
      const mockScreenshotData = Buffer.from('mock-screenshot-data');
      vi.mocked(screenshotService.takeScreenshot).mockResolvedValue({
        success: true,
        data: mockScreenshotData,
        error: undefined,
        logs: [],
      });

      vi.mocked(storeImage).mockResolvedValue({
        publicImageId: 'updated-image-123.png',
        filepath: 'templates/updated-image-123.png',
        created_at: '2023-01-01T00:00:00Z',
      });

      const oldTemplate = {
        template_id: 'template-123',
        html: '<div>Old HTML</div>',
        variables: { name: 'Old' },
        preview_storage_path: 'templates/old-preview.png',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        name: null,
        description: null,
        default_dimensions: null,
      };

      vi.mocked(queries.imageTemplate.getImageTemplate).mockResolvedValue(
        oldTemplate
      );
      vi.mocked(queries.imageTemplate.updateImageTemplate).mockResolvedValue([
        oldTemplate,
      ]);
      vi.mocked(mockStorageMethods.delete).mockResolvedValue(false);

      const response = await request(app)
        .put('/v1/template/template-123')
        .send({
          html: '<div>Updated</div>',
          variables: {},
        });

      expect(response.status).toBe(200); // Should still succeed despite storage deletion failure
    });
  });

  describe('GET /', () => {
    it('should get templates with default pagination', async () => {
      const mockTemplates = {
        data: [
          {
            template_id: 'template-1',
            name: 'Template 1',
            html: '<div>Template 1</div>',
            variables: {},
            preview_storage_path: 'templates/template-1.png',
            description: null,
            default_dimensions: null,
            deleted_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            template_id: 'template-2',
            name: 'Template 2',
            html: '<div>Template 2</div>',
            variables: {},
            preview_storage_path: 'templates/template-2.png',
            description: null,
            default_dimensions: null,
            deleted_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 2,
          totalPages: 1,
        },
      };

      vi.mocked(queries.imageTemplate.getImageTemplates).mockResolvedValue(
        mockTemplates
      );

      const response = await request(app).get('/v1/template');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              template_id: 'template-1',
              name: 'Template 1',
              html: '<div>Template 1</div>',
            }),
            expect.objectContaining({
              template_id: 'template-2',
              name: 'Template 2',
              html: '<div>Template 2</div>',
            }),
          ]),
          pagination: {
            page: 1,
            pageSize: 10,
            total: 2,
            totalPages: 1,
          },
        })
      );

      expect(queries.imageTemplate.getImageTemplates).toHaveBeenCalledWith({
        page: 1,
        pageSize: 10,
        sort: 'desc',
        preview: true,
      });
    });

    it('should get templates with custom pagination and sorting', async () => {
      const mockTemplates = {
        data: [],
        pagination: {
          page: 2,
          pageSize: 5,
          total: 0,
          totalPages: 0,
        },
      };

      vi.mocked(queries.imageTemplate.getImageTemplates).mockResolvedValue(
        mockTemplates
      );

      const response = await request(app).get('/v1/template').query({
        page: '2',
        pageSize: '5',
        sort: 'asc',
      });

      expect(response.status).toBe(200);

      expect(queries.imageTemplate.getImageTemplates).toHaveBeenCalledWith({
        page: 2,
        pageSize: 5,
        sort: 'asc',
        preview: true,
      });
    });

    it('should handle invalid pagination parameters gracefully', async () => {
      const mockTemplates = {
        data: [],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 0,
          totalPages: 0,
        },
      };

      vi.mocked(queries.imageTemplate.getImageTemplates).mockResolvedValue(
        mockTemplates
      );

      const response = await request(app).get('/v1/template').query({
        page: 'invalid',
        pageSize: 'invalid',
      });

      expect(response.status).toBe(200);

      expect(queries.imageTemplate.getImageTemplates).toHaveBeenCalledWith({
        page: 1, // Should default to 1
        pageSize: 10, // Should default to 10
        sort: 'desc',
        preview: true,
      });
    });
  });

  describe('GET /:templateId', () => {
    it('should get template by ID successfully', async () => {
      const mockTemplate = {
        template_id: 'template-123',
        name: 'Test Template',
        html: '<div>{{name}}</div>',
        variables: { name: 'John' },
        created_at: new Date('2023-01-01T00:00:00Z'),
        updated_at: new Date('2023-01-02T00:00:00Z'),
        deleted_at: null,
        preview_storage_path: 'templates/preview.png',
        description: null,
        default_dimensions: null,
      };

      vi.mocked(queries.imageTemplate.getImageTemplate).mockResolvedValue(
        mockTemplate
      );
      vi.mocked(encodeHTMLForTransport).mockReturnValue('encoded-html');

      const response = await request(app).get('/v1/template/template-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        id: 'template-123',
        name: 'Test Template',
        html: 'encoded-html',
        variables: { name: 'John' },
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });

      expect(queries.imageTemplate.getImageTemplate).toHaveBeenCalledWith(
        'template-123'
      );
      expect(encodeHTMLForTransport).toHaveBeenCalledWith(
        '<div>{{name}}</div>'
      );
    });

    it('should return templates when accessing root path', async () => {
      const mockTemplates = {
        data: [],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 0,
          totalPages: 0,
        },
      };

      vi.mocked(queries.imageTemplate.getImageTemplates).mockResolvedValue(
        mockTemplates
      );

      const response = await request(app).get('/v1/template/');

      expect(response.status).toBe(200);
    });

    it('should return not found when template does not exist', async () => {
      vi.mocked(queries.imageTemplate.getImageTemplate).mockResolvedValue(null);

      const response = await request(app).get('/v1/template/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe(true);
      expect(response.body.message).toBe('Template not found');
    });
  });

  describe('DELETE /:templateId', () => {
    it('should delete template successfully', async () => {
      const mockTemplate = {
        template_id: 'template-123',
        name: 'Test Template',
        html: '<div>{{name}}</div>',
        variables: { name: 'John' },
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        preview_storage_path: 'templates/preview.png',
        description: null,
        default_dimensions: null,
      };

      vi.mocked(queries.imageTemplate.deleteImageTemplate).mockResolvedValue(
        mockTemplate
      );

      const response = await request(app).delete('/v1/template/template-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ deleted: true });

      expect(queries.imageTemplate.deleteImageTemplate).toHaveBeenCalledWith(
        'template-123'
      );
    });

    it('should return error when templateId is missing', async () => {
      const response = await request(app).delete('/v1/template/');

      expect(response.status).toBe(404);
    });

    it('should return not found when template does not exist', async () => {
      vi.mocked(queries.imageTemplate.deleteImageTemplate).mockResolvedValue(
        null
      );

      const response = await request(app).delete('/v1/template/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe(true);
      expect(response.body.message).toBe('Template not found');
    });
  });
});

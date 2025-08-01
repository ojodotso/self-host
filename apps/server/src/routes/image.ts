import { Router } from 'express';
import { Constants, Template } from '@ojo/libs';
import { queries } from '@ojo/database';

import { storeImage } from '@/services/storage';
import {
  imageTransformService,
  ProcessImageOptions,
} from '@/services/image-transformer';

import { handler } from '@/lib/helpers/request-handler';
import { Storage } from '@/lib/s3/storage-helper';
import { sharedResponses } from '@/lib/helpers/response-helper';
import { screenshotService } from '@/lib/browser';
import { generateShortIdentifier } from '@/lib/helpers/asset-helper';
import logger from '@/lib/logger';
import { executeBackgroundTask } from '@/lib/helpers/background-task-helper';

type OperationDetail = {
  imageId: string;
  reason: string;
};

const {
  imageGeneration: {
    getImageRecord,
    getImageRecords,
    recordImageGeneration,
    deleteImageRecord,
  },
  imageTemplate: { getImageTemplate },
} = queries;

const {
  HEADER_SCREENSHOT_VIEWPORT_HEIGHT_IDENTIFIER,
  HEADER_SCREENSHOT_VIEWPORT_WIDTH_IDENTIFIER,
  HEADER_SCREENSHOT_TRANSPARENT_BACKGROUND_IDENTIFIER,
} = Constants.RequestHeaders;

const router: Router = Router();

const imageCache = new Map<string, Buffer>();

router.post(
  '/template',
  handler(async (req, res) => {
    const { templateId, modify = {} } = req.body;

    if (!templateId) {
      return sharedResponses.FAILED_TO_PROCESS(res, [
        "Provide 'templateId' in the request body",
      ]);
    }

    const transparent = req.body?.transparentBackground as boolean;

    let viewportHeight = parseInt(req.body?.viewportHeight as string);
    let viewportWidth = parseInt(req.body?.viewportWidth as string);

    if (isNaN(viewportHeight) || isNaN(viewportWidth)) {
      viewportHeight = 800;
      viewportWidth = 1280;
    }

    const template = await getImageTemplate(templateId);

    if (!template) {
      return sharedResponses.FAILED_TO_PROCESS(res, ['Template not found']);
    }

    let html = template.html;
    let payload = {};

    if (template.variables) {
      payload = { ...template.variables, ...modify };
      html = Template.renderTemplate({
        content: template.html,
        variables: payload,
      });
    }

    const result = await screenshotService.takeScreenshot({
      html,
      viewportHeight,
      viewportWidth,
      transparent,
    });

    if (result?.error || !result?.data) {
      return sharedResponses.FAILED_TO_PROCESS(
        res,
        result.logs as Array<string>,
        result.error || 'Failed to generate image'
      );
    }
    const imageBuffer = Buffer.from(result.data);
    const publicImageId = generateShortIdentifier() + '.png';

    executeBackgroundTask(
      async () => {
        const { filepath } = await storeImage({ imageBuffer });

        await recordImageGeneration({
          filepath,
          html,
          publicImageId,
          size: imageBuffer.length,
        });
      },
      {
        taskName: `Image Upload [${publicImageId}]`,
        onSuccess: () => {
          logger.info(
            `Image upload completed successfully for ${publicImageId}`
          );
          imageCache.delete(publicImageId);
        },
        onFailure: (error, attempt) => {
          logger.warn(
            `Upload attempt ${attempt} failed for ${publicImageId}:`,
            error.message
          );
        },
      }
    );

    res.json({ id: publicImageId, createdAt: new Date().toISOString() });
  })
);

router.post(
  '/html',
  handler(async (req, res) => {
    if (req.headers['content-type'] !== 'text/html') {
      return sharedResponses.FAILED_TO_PROCESS(res, [
        'Invalid content type. Send text/html in the request headers',
      ]);
    }

    let html = req.body;

    if (!html) {
      return sharedResponses.FAILED_TO_PROCESS(res, [
        'Template missing. Send html in the request body',
      ]);
    }

    const transparent =
      req.headers[HEADER_SCREENSHOT_TRANSPARENT_BACKGROUND_IDENTIFIER] ===
      'true';

    let viewportWidth = parseInt(
      req.headers[HEADER_SCREENSHOT_VIEWPORT_WIDTH_IDENTIFIER] as string
    );
    let viewportHeight = parseInt(
      req.headers[HEADER_SCREENSHOT_VIEWPORT_HEIGHT_IDENTIFIER] as string
    );

    if (isNaN(viewportHeight) || isNaN(viewportWidth)) {
      viewportHeight = 800;
      viewportWidth = 1280;
    }

    const result = await screenshotService.takeScreenshot({
      html,
      viewportHeight,
      viewportWidth,
      transparent,
    });

    if (result?.error || !result?.data) {
      return sharedResponses.FAILED_TO_PROCESS(
        res,
        result.logs as Array<string>,
        result.error || 'Failed to generate image'
      );
    }

    const imageBuffer = Buffer.from(result.data);

    const publicImageId = generateShortIdentifier() + '.png';

    imageCache.set(publicImageId, imageBuffer);

    executeBackgroundTask(
      async () => {
        const { filepath } = await storeImage({ imageBuffer });

        await recordImageGeneration({
          filepath,
          html,
          publicImageId,
          size: imageBuffer.length,
        });
      },
      {
        taskName: `Image Upload [${publicImageId}]`,
        onSuccess: () => {
          logger.info(
            `Image upload completed successfully for ${publicImageId}`
          );
          imageCache.delete(publicImageId);
        },
        onFailure: (error, attempt) => {
          logger.warn(
            `Upload attempt ${attempt} failed for ${publicImageId}:`,
            error.message
          );
        },
      }
    );

    res.json({
      id: publicImageId,
      createdAt: new Date().toISOString(),
    });
  })
);

router.get(
  '/',
  handler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const sort = (req.query.sort as 'asc' | 'desc') || 'desc';

    const records = await getImageRecords({ page, pageSize, sort });

    return res.json(records);
  })
);

router.get(
  '/:imageId',
  handler(async (req, res) => {
    const { imageId } = req.params;

    if (!imageId) {
      return sharedResponses.FAILED_TO_PROCESS(res, ['/:imageId required']);
    }

    const record = await getImageRecord(imageId);

    if (!record || record?.deleted_at) {
      return sharedResponses.NOT_FOUND(res, 'Image not found');
    }

    const filename = record.filepath?.split('/').pop() || '';

    const storage = new Storage({
      filename,
    });

    const imageData = await storage.get();

    if (!imageData) {
      return sharedResponses.NOT_FOUND(res, 'Image file not found in storage');
    }

    let contentType = 'image/png';
    const extension = filename.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'jpg':
      case 'jpeg':
        contentType = 'image/jpeg';
        break;
      case 'png':
        contentType = 'image/png';
        break;
      case 'webp':
        contentType = 'image/webp';
        break;
      case 'avif':
        contentType = 'image/avif';
        break;
      case 'gif':
        contentType = 'image/gif';
        break;
    }

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Content-Length', imageData.length.toString());

    res.send(imageData);
  })
);

router.delete(
  '/',
  handler(async (req, res) => {
    const { imageIds } = req.body;

    if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
      return sharedResponses.FAILED_TO_PROCESS(res, [
        'imageIds array required in request body',
      ]);
    }

    const MAX_BATCH_SIZE = 50;
    if (imageIds.length > MAX_BATCH_SIZE) {
      return sharedResponses.FAILED_TO_PROCESS(res, [
        `Maximum ${MAX_BATCH_SIZE} images can be deleted at once`,
      ]);
    }

    const results: {
      successful: Array<OperationDetail>;
      failed: Array<OperationDetail>;
    } = {
      successful: [],
      failed: [],
    };

    await Promise.all(
      imageIds.map(async (imageId) => {
        try {
          const record = await getImageRecord(imageId);

          if (!record || record?.deleted_at) {
            results.failed.push({
              imageId,
              reason: 'Image not found or already deleted',
            });
            return;
          }

          const filename = record.filepath?.split('/').pop() || '';

          const storage = new Storage({
            filename,
          });
          const isDeleted = await storage.delete();
          const softDeletedRecord = await deleteImageRecord(imageId);

          if (!isDeleted || !softDeletedRecord) {
            results.failed.push({
              imageId,
              reason: 'Failed to delete image or update record',
            });
            return;
          }

          results.successful.push(imageId);
        } catch (error) {
          results.failed.push({
            imageId,
            reason: 'Unexpected error during deletion',
          });
        }
      })
    );

    if (results.successful.length === 0 && results.failed.length) {
      return sharedResponses.FAILED_TO_PROCESS(res, ['No images were deleted']);
    }

    res.json({
      successful: results.successful,
      failed: results.failed,
      totalProcessed: imageIds.length,
      successCount: results.successful.length,
      failureCount: results.failed.length,
    });
  })
);

router.delete(
  '/:imageId',
  handler(async (req, res) => {
    const { imageId } = req.params;

    if (!imageId) {
      return sharedResponses.FAILED_TO_PROCESS(res, ['/:imageId required']);
    }

    const record = await getImageRecord(imageId);

    if (!record || record?.deleted_at) {
      return sharedResponses.NOT_FOUND(res, 'Image not found');
    }

    const filename = record.filepath?.split('/').pop() || '';

    const isDeleted = await new Storage({
      filename,
    }).delete();
    const softDeletedRecord = await deleteImageRecord(imageId);

    if (!isDeleted || !softDeletedRecord) {
      return sharedResponses.INTERNAL_SERVER_ERROR(res);
    }

    res.json({ deleted: true });
  })
);

router.get(
  '/transform/:options/*',
  handler(async (req, res) => {
    const transformOptions = req.params.options;
    if (!transformOptions) {
      return sharedResponses.BAD_REQUEST(
        res,
        'Transformation options are required'
      );
    }

    const fullPath = req.originalUrl;
    const optionsIndex = fullPath.indexOf('/transform/') + '/transform/'.length;
    const afterOptions = fullPath.substring(
      optionsIndex + transformOptions.length + 1
    ); // +1 for the slash

    if (!afterOptions || !afterOptions.startsWith('http')) {
      return sharedResponses.BAD_REQUEST(res, 'Valid source URL is required');
    }

    const sourceUrl = decodeURIComponent(afterOptions);

    const options: ProcessImageOptions = {};
    transformOptions.split(',').forEach((opt) => {
      const [key, val] = opt.split('-');
      if (!val) return;
      switch (key) {
        case 'w':
          options.width = parseInt(val, 10);
          break;
        case 'h':
          options.height = parseInt(val, 10);
          break;
        case 'mw':
          options.maxWidth = parseInt(val, 10);
          break;
        case 'mh':
          options.maxHeight = parseInt(val, 10);
          break;
        case 'minw':
          options.minWidth = parseInt(val, 10);
          break;
        case 'minh':
          options.minHeight = parseInt(val, 10);
          break;
        case 'ar':
          options.aspectRatio = val;
          break;
        case 'fit':
          options.fit = val as
            | 'cover'
            | 'contain'
            | 'fill'
            | 'inside'
            | 'outside';
          break;
        case 'gray':
          options.grayscale = val === 'true';
          break;
        case 'fmt':
          options.format = val as 'jpeg' | 'png' | 'webp' | 'avif';
          break;
        case 'q':
          options.quality = parseInt(val, 10);
          break;
        case 'prog':
          options.progressive = val === 'true';
          break;
        case 'lossless':
          options.lossless = val === 'true';
          break;
        case 'crop':
          options.crop = val as 'entropy' | 'attention' | 'center';
          break;
        case 'fx':
          if (!options.focal) options.focal = { x: 0, y: 0 };
          options.focal.x = parseFloat(val);
          break;
        case 'fy':
          if (!options.focal) options.focal = { x: 0, y: 0 };
          options.focal.y = parseFloat(val);
          break;
        case 'bri':
          options.brightness = parseInt(val, 10);
          break;
        case 'con':
          options.contrast = parseInt(val, 10);
          break;
        case 'sat':
          options.saturation = parseInt(val, 10);
          break;
        case 'hue':
          options.hue = parseInt(val, 10);
          break;
        case 'gm':
          options.gamma = parseFloat(val);
          break;
        case 'blur':
          options.blur = parseFloat(val);
          break;
        case 'sharpen':
          options.sharpen = val === 'true' ? true : { sigma: parseFloat(val) };
          break;
        case 'rot':
          options.rotate = parseInt(val, 10);
          break;
        case 'flip':
          options.flip = val === 'true';
          break;
        case 'flop':
          options.flop = val === 'true';
          break;
        case 'bg':
          options.background = val;
          break;
        case 'meta':
          options.metadata = val === 'true';
          break;
        case 'strip':
          options.strip = val === 'true';
          break;
        case 'dpr':
          options.dpr = parseFloat(val);
          break;
        case 'auto':
          options.auto = val
            .split('|')
            .map((v) => v as 'format' | 'compress' | 'enhance');
          break;
      }
    });

    const rawOptions = {
      ...options,
      url: sourceUrl,
    };

    const { data, format } = await imageTransformService.process(
      sourceUrl,
      rawOptions
    );

    res.set('Content-Type', `image/${format}`);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(data);
  })
);

export default router;

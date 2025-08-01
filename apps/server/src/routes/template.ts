import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Template } from '@ojo/libs';
import { queries, type TemplateCreateUpdatePayload } from '@ojo/database';

import { handler } from '@/lib/helpers/request-handler';
import { sharedResponses } from '@/lib/helpers/response-helper';
import {
  decodeHTMLFromTransport,
  encodeHTMLForTransport,
} from '@/lib/validators/html-validator';
import { Storage } from '@/lib/s3/storage-helper';
import { screenshotService } from '@/lib/browser';

import { storeImage } from '@/services/storage';

const {
  imageTemplate: {
    getImageTemplate,
    deleteImageTemplate,
    updateImageTemplate,
    getImageTemplates,
    recordImageTemplate,
  },
} = queries;

const router: Router = Router();

router.post(
  '/',
  handler(async (req, res) => {
    const body = req.body;

    if (!body) {
      return sharedResponses.FAILED_TO_PROCESS(res, ['Body required']);
    }

    const { html: encodedHTML, variables } = body;

    if (!encodedHTML) {
      return sharedResponses.FAILED_TO_PROCESS(res, [
        'Template missing. Send encoded `html` in the request body',
      ]);
    }

    let html = '';

    try {
      html = decodeHTMLFromTransport(encodedHTML);
    } catch (error) {
      return sharedResponses.FAILED_TO_PROCESS(res, [
        'Failed to decode `html`. Ensure it is properly encoded. Visit https://ojo.so/tools/html-encoder',
      ]);
    }

    const id = uuidv4();

    const viewportHeight = parseInt(body?.viewportHeight as string);
    const viewportWidth = parseInt(body?.viewportWidth as string);

    const result = await screenshotService.takeScreenshot({
      html,
      viewportHeight,
      viewportWidth,
    });

    if (result?.error || !result?.data) {
      return sharedResponses.FAILED_TO_PROCESS(
        res,
        result.logs as Array<string>,
        result.error || 'Failed to generate image'
      );
    }

    const { filepath } = await storeImage({
      imageBuffer: Buffer.from(result.data),
    });

    const payload: TemplateCreateUpdatePayload = {
      templateId: id,
      html,
      variables,
      preview_storage_path: filepath,
    };

    if (viewportHeight && viewportWidth) {
      payload['default_dimensions'] = {
        height: viewportHeight,
        width: viewportWidth,
      };
    }

    const record = await recordImageTemplate(payload);

    if (!record) {
      return sharedResponses.INTERNAL_SERVER_ERROR(res);
    }

    res.json({ id, message: 'Template created' });
  })
);

router.put(
  '/:templateId',
  handler(async (req, res) => {
    const templateId = req.params.templateId;

    if (!templateId) {
      return sharedResponses.FAILED_TO_PROCESS(res, ['/:templateId required']);
    }

    const body = req.body;

    if (!body) {
      return sharedResponses.FAILED_TO_PROCESS(res, ['Body required']);
    }

    const { html: encodedHTML, variables } = body;

    let html = '';
    let preview_html = '';

    if (encodedHTML) {
      try {
        html = decodeHTMLFromTransport(encodedHTML);
      } catch (error) {
        return sharedResponses.FAILED_TO_PROCESS(res, [
          'Failed to decode `html`. Ensure it is properly encoded. Visit https://ojo.so/tools/html-encoder',
        ]);
      }

      preview_html = Template.renderTemplate({
        content: html,
        variables,
      });
    } else {
      const existingTemplate = await getImageTemplate(templateId);

      if (!existingTemplate) {
        return sharedResponses.NOT_FOUND(res, 'Template not found');
      }

      preview_html = Template.renderTemplate({
        content: existingTemplate.html,
        variables,
      });
    }

    const viewportHeight = parseInt(body?.viewportHeight as string);
    const viewportWidth = parseInt(body?.viewportWidth as string);

    const result = await screenshotService.takeScreenshot({
      html,
      viewportHeight,
      viewportWidth,
    });

    if (result?.error || !result?.data) {
      return sharedResponses.FAILED_TO_PROCESS(
        res,
        result.logs as Array<string>,
        result.error || 'Failed to generate image'
      );
    }

    const { filepath } = await storeImage({
      imageBuffer: Buffer.from(result.data),
    });

    const oldRecord = await getImageTemplate(templateId);

    const payload: TemplateCreateUpdatePayload = {
      templateId,
      html,
      variables,
      preview_storage_path: filepath,
    };

    if (viewportHeight && viewportWidth) {
      payload['default_dimensions'] = {
        height: viewportHeight,
        width: viewportWidth,
      };
    }

    const record = await updateImageTemplate(payload);

    if (!record) {
      return sharedResponses.INTERNAL_SERVER_ERROR(res);
    }

    if (!record?.length) {
      return sharedResponses.NOT_FOUND(res, 'Template not found');
    }

    if (oldRecord?.preview_storage_path) {
      await new Storage({
        filename: oldRecord.preview_storage_path,
      }).delete();
    }

    res.json({ id: templateId, message: 'Template updated' });
  })
);

router.get(
  '/',
  handler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const sort = (req.query.sort as 'asc' | 'desc') || 'desc';

    const records = await getImageTemplates({
      page,
      pageSize,
      sort,
      preview: true,
    });

    return res.json(records);
  })
);

router.get(
  '/:templateId',
  handler(async (req, res) => {
    const { templateId } = req.params;

    if (!templateId) {
      return sharedResponses.FAILED_TO_PROCESS(res, ['/:templateId required']);
    }

    const record = await getImageTemplate(templateId);

    if (!record) {
      return sharedResponses.NOT_FOUND(res, 'Template not found');
    }

    res.json({
      id: record.template_id,
      name: record.name,
      html: encodeHTMLForTransport(record.html),
      variables: record.variables,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    });
  })
);

router.delete(
  '/:templateId',
  handler(async (req, res) => {
    const { templateId } = req.params;

    if (!templateId) {
      return sharedResponses.FAILED_TO_PROCESS(res, ['/:templateId required']);
    }

    const record = await deleteImageTemplate(templateId);

    if (!record) {
      return sharedResponses.NOT_FOUND(res, 'Template not found');
    }

    res.json({ deleted: true });
  })
);

export default router;

import { Router } from 'express';
import { Constants } from '@ojo/libs';

import { handler } from '@/lib/helpers/request-handler';
import { sharedResponses } from '@/lib/helpers/response-helper';
import { PdfOptions, pdfService } from '@/lib/browser';
import { generateShortIdentifier } from '@/lib/helpers/asset-helper';
import logger from '@/lib/logger';

const {
  HEADER_PDF_FORMAT_IDENTIFIER,
  HEADER_PDF_LANDSCAPE_IDENTIFIER,
  HEADER_PDF_PRINT_BACKGROUND_IDENTIFIER,
  HEADER_PDF_SCALE_IDENTIFIER,
} = Constants.RequestHeaders;

const router: Router = Router();

const pdfCache = new Map<string, Buffer>();

router.post(
  '/',
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

    try {
      // Extract PDF options from headers and request body
      const format = ((req.headers[HEADER_PDF_FORMAT_IDENTIFIER] as string) ||
        'A4') as PdfOptions['format'];
      const landscape =
        req.headers[HEADER_PDF_LANDSCAPE_IDENTIFIER] === 'true' || false;
      const printBackground =
        req.headers[HEADER_PDF_PRINT_BACKGROUND_IDENTIFIER] !== 'false';
      const scale =
        parseFloat(req.headers[HEADER_PDF_SCALE_IDENTIFIER] as string) || 1;

      const result = await pdfService.generatePdf({
        html,
        format,
        landscape,
        printBackground,
        scale,
      });

      if (!result.success || !result.data) {
        logger.error('PDF generation failed:', result.error, result.logs);
        return sharedResponses.FAILED_TO_PROCESS(res, [
          result.error || 'Failed to generate PDF',
        ]);
      }

      const pdfId = generateShortIdentifier();
      pdfCache.set(pdfId, result.data);

      // Set appropriate headers for PDF response
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${pdfId}.pdf"`);
      res.setHeader('Content-Length', result.data.length);

      return res.status(200).send(result.data);
    } catch (error) {
      logger.error('Error generating PDF:', error);
      return sharedResponses.FAILED_TO_PROCESS(res, [
        'An error occurred while generating the PDF',
      ]);
    }
  })
);

export default router;

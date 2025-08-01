import { browser } from '@ojo/browser';

import { PdfOptions, PdfResult } from './types';

const { browserManager } = browser;

export class PdfService {
  private initialized = false;
  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (!this.initialized) {
      await browserManager.initializeConnections();
      this.initialized = true;
    }
  }

  async generatePdf(options: PdfOptions): Promise<PdfResult> {
    const {
      html,
      format = 'A4',
      width,
      height,
      margin,
      landscape = false,
      printBackground = true,
      scale = 1,
      displayHeaderFooter = false,
      headerTemplate,
      footerTemplate,
      preferCSSPageSize = false,
    } = options;

    if (!html) {
      return {
        success: false,
        error: 'Missing HTML content',
      };
    }

    let page = await browserManager.getAvailablePage();

    if (!page) {
      return {
        success: false,
        error: 'Failed to get available page',
      };
    }

    try {
      await page.setContent(html);

      await page.emulateMedia({ media: 'screen' });

      const pdfConfig: any = {
        format,
        landscape,
        printBackground,
        scale,
        displayHeaderFooter,
        preferCSSPageSize,
      };

      // Set custom dimensions if provided
      if (width) {
        pdfConfig.width = width;
      }
      if (height) {
        pdfConfig.height = height;
      }

      // Set margins if provided
      if (margin) {
        pdfConfig.margin = {
          top: margin.top,
          right: margin.right,
          bottom: margin.bottom,
          left: margin.left,
        };
      }

      // Set header and footer templates if provided
      if (headerTemplate) {
        pdfConfig.headerTemplate = headerTemplate;
      }
      if (footerTemplate) {
        pdfConfig.footerTemplate = footerTemplate;
      }

      const result = await page.pdf(pdfConfig);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      let errorMessage = 'An unexpected error occurred';
      const errorLogs: string[] = [];

      if (error instanceof Error) {
        if (error.name === 'TimeoutError') {
          errorMessage = 'Operation timed out';
          errorLogs.push(`Timeout::: ${error.message}`);
        } else {
          errorMessage = error.message;
          errorLogs.push(`PageError::: ${error.message}`);
        }
      }

      return {
        success: false,
        error: errorMessage,
        logs: errorLogs,
      };
    } finally {
      const isPageClosed = page.isClosed?.();
      if (!isPageClosed) {
        try {
          await browserManager.returnPage(page);
        } catch (error) {
          console.error('Error returning page to pool:', error);
        }
      }
    }
  }
}

export const pdfService = new PdfService();

import { browser } from '@ojo/browser';

import { ScreenshotOptions, ScreenshotResult } from './types';

const { browserManager } = browser;

export class ScreenshotService {
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

  async takeScreenshot(options: ScreenshotOptions): Promise<ScreenshotResult> {
    const {
      html,
      viewportWidth,
      viewportHeight,
      transparent = false,
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
      if (viewportWidth && viewportHeight) {
        await page.setViewportSize({
          width: viewportWidth,
          height: viewportHeight,
        });
      }

      if (transparent) {
        await page.addStyleTag({
          content: `html, body {
            background-color: transparent !important;
          }`,
        });
      }

      await page.setContent(html);

      const screenshotConfig: browser.PageScreenshotOptions = {
        type: 'png',
        fullPage: true,
        omitBackground: transparent,
      };

      if (viewportWidth && viewportHeight) {
        screenshotConfig.fullPage = false;
        screenshotConfig.clip = {
          x: 0,
          y: 0,
          width: viewportWidth,
          height: viewportHeight,
        };
      }

      const result = await page.screenshot(screenshotConfig);

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

export const screenshotService = new ScreenshotService();

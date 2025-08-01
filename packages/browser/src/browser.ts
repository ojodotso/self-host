import { Browser, Page, chromium } from 'playwright';

import logger from './logger';

interface BrowserInstance {
  browser: Browser;
  pagePool: Page[];
  endpoint: string;
  healthy: boolean;
  lastHealthCheck: Date;
  markedForShutdown?: boolean;
}

class BrowserManager {
  private static instance: BrowserManager;
  private browserInstances: Map<string, BrowserInstance> = new Map();

  private readonly PAGE_POOL_SIZE = 10;
  private readonly HEALTH_CHECK_INTERVAL = 5000;
  private readonly INITIAL_RECONNECT_DELAY = 1000;
  private readonly MAX_RECONNECT_MULTIPLIER = 3;
  private readonly DEFAULT_PAGE_TIMEOUT = 5000;

  private constructor() {
    this.startHealthChecks();
    this.setupProcessHandlers();
  }

  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  private getEndpoints(): string[] {
    const endpoints = process.env.BROWSER_ENDPOINTS?.split(',') || [];
    return endpoints.map((endpoint) => {
      return endpoint;
    });
  }

  async initializeConnections() {
    const endpoints = this.getEndpoints();

    if (endpoints.length === 0) {
      throw new Error('No browser endpoints configured');
    }

    for (const endpoint of endpoints) {
      try {
        await this.connectToBrowser(endpoint);
      } catch (error) {
        logger.error(`Failed to connect to browser at ${endpoint}`, error);
      }
    }

    if (this.browserInstances.size === 0) {
      throw new Error('Failed to connect to any browser instances');
    }
  }

  private async connectToBrowser(endpoint: string): Promise<void> {
    try {
      const browser = await chromium.connect(endpoint, {
        logger: {
          isEnabled(name, severity) {
            return severity === 'warning' || severity === 'error';
          },
          log(name, severity, message, args, hints) {
            if (severity === 'warning' || severity === 'error') {
              logger.warn(
                `[${name}:${severity}]= ${message} - Hints: ${hints} - Args: ${args}`
              );
            }
          },
        },
      });
      const instance: BrowserInstance = {
        browser,
        pagePool: [],
        endpoint,
        healthy: true,
        lastHealthCheck: new Date(),
      };

      this.browserInstances.set(endpoint, instance);

      const pagePool: Page[] = [];
      for (let i = 0; i < this.PAGE_POOL_SIZE; i++) {
        const page = await this.createAndSecurePage(browser, instance);

        pagePool.push(page);
      }

      instance.pagePool = pagePool;

      logger.info(
        `Connected to browser at ${endpoint} with ${pagePool.length} pages`
      );
    } catch (error) {
      const instance = this.browserInstances.get(endpoint);
      if (instance) {
        await instance.browser.close().catch(() => {});
        this.browserInstances.delete(endpoint);
      }
      logger.error(`Failed to connect to browser at ${endpoint}`, error);
      throw error;
    }
  }

  private async createBasePage(browser: Browser): Promise<Page> {
    return await browser.newPage({
      acceptDownloads: false,
      serviceWorkers: 'block',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    });
  }

  private async createAndSecurePage(
    browser: Browser,
    instance: BrowserInstance
  ): Promise<Page> {
    const page = await this.createBasePage(browser);

    await this.setupCoreSecurityControls(page, instance);
    return page;
  }

  private async setupCoreSecurityControls(
    page: Page,
    instance: BrowserInstance
  ) {
    if (!instance) {
      throw new Error('Instance not provided');
    }

    page.on('dialog', async (dialog) => {
      await dialog.dismiss();
    });

    page.on('popup', async (popup) => {
      await popup.close();
    });

    page.setDefaultTimeout(this.DEFAULT_PAGE_TIMEOUT);
  }

  private async resetPage(page: Page): Promise<Page> {
    const instance = this.findInstanceByPage(page);
    if (!instance) {
      throw new Error('Page does not belong to any known browser instance');
    }

    try {
      await page.goto('about:blank', { timeout: 500 });

      return page;
    } catch (error) {
      try {
        await page.close().catch(() => {});
        return await this.createAndSecurePage(instance.browser, instance);
      } catch (createError) {
        logger.error(
          'Failed to create new page after reset failure',
          createError
        );
        throw createError;
      }
    }
  }

  private async validatePage(page: Page): Promise<boolean> {
    try {
      if (page.isClosed()) {
        return false;
      }

      await page.evaluate(() => true);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getAvailablePage(): Promise<Page | null> {
    const healthyInstances = Array.from(this.browserInstances.values())
      .filter((instance) => instance.healthy)
      .sort((a, b) => b.pagePool.length - a.pagePool.length);

    if (healthyInstances.length === 0) {
      logger.warn('No healthy browser instances available');
      await this.attemptRecovery();
      return null;
    }

    for (const instance of healthyInstances) {
      const page = instance.pagePool.shift();
      if (page) {
        const isPageAccessible = await this.validatePage(page);
        if (isPageAccessible) {
          return page;
        }

        await page.close().catch(() => {});
      }

      try {
        return await this.createAndSecurePage(instance.browser, instance);
      } catch (error) {
        logger.error(
          `Failed to create page from instance ${instance.endpoint}`,
          error
        );
        instance.healthy = false;
      }
    }

    logger.error('All browser instances failed to provide a page');
    return null;
  }

  async returnPage(page: Page) {
    const instance = this.findInstanceByPage(page);
    if (!instance) {
      await page
        .close()
        .catch((error) => logger.error('Error closing orphaned page', error));
      return;
    }

    try {
      if (instance.pagePool.length < this.PAGE_POOL_SIZE) {
        const resetPage = await this.resetPage(page);
        instance.pagePool.push(resetPage);
      } else {
        await page.close().catch(() => {});
      }
    } catch (error) {
      logger.error('Error returning page to pool', error);

      await page.close().catch(() => {});
    }
  }

  private findInstanceByPage(page: Page): BrowserInstance | undefined {
    try {
      return Array.from(this.browserInstances.values()).find(
        (instance) => page.context()?.browser() === instance.browser
      );
    } catch (error) {
      logger.error('Error finding instance for page', error);
      return undefined;
    }
  }

  private async checkBrowserHealth(instance: BrowserInstance) {
    try {
      if (!instance.browser.isConnected()) {
        throw new Error('Browser disconnected');
      }

      const testPage = await this.createAndSecurePage(
        instance.browser,
        instance
      );
      await testPage.goto('about:blank');
      await testPage.close();

      instance.healthy = true;
      instance.lastHealthCheck = new Date();
    } catch (error) {
      instance.healthy = false;
      logger.error(`Browser instance ${instance.endpoint} is unhealthy`, error);
      await this.attemptRecovery(instance);
    }
  }

  private async attemptRecovery(instance?: BrowserInstance) {
    if (instance) {
      let currentDelay = this.INITIAL_RECONNECT_DELAY;
      let attempt = 1;

      while (true) {
        try {
          logger.info(
            `Attempting to reconnect to browser at ${instance.endpoint} (attempt ${attempt})`
          );

          this.browserInstances.delete(instance.endpoint);
          instance.pagePool.forEach((page) => page.close().catch(() => {}));
          await instance.browser.close().catch(() => {});
          await this.connectToBrowser(instance.endpoint);
          logger.info(`Successfully reconnected to ${instance.endpoint}`);

          break;
        } catch (error) {
          const exponentialDelay =
            this.INITIAL_RECONNECT_DELAY * Math.pow(2, attempt - 1);
          currentDelay = Math.min(
            exponentialDelay,
            this.INITIAL_RECONNECT_DELAY * this.MAX_RECONNECT_MULTIPLIER
          );

          logger.error(
            `Reconnection attempt ${attempt} failed for ${instance.endpoint}. Retrying in ${
              currentDelay / 1000
            } seconds...`,
            error
          );

          await new Promise((resolve) => setTimeout(resolve, currentDelay));
          attempt++;
        }
      }
    } else {
      await this.initializeConnections();
    }
  }

  private startHealthChecks() {
    setInterval(async () => {
      for (const instance of this.browserInstances.values()) {
        await this.checkBrowserHealth(instance);
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private setupProcessHandlers() {
    const cleanup = async () => {
      logger.info('Cleaning up browser connections...');
      for (const instance of this.browserInstances.values()) {
        try {
          await Promise.all(
            instance.pagePool.map((page) => page.close().catch(() => {}))
          );
          await instance.browser.close().catch(() => {});
        } catch (error) {
          logger.error('Error during cleanup', error);
        }
      }
      this.browserInstances.clear();
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGHUP', cleanup);
    process.on('SIGQUIT', cleanup);
  }

  getMetrics() {
    const metrics = {
      totalInstances: this.browserInstances.size,
      healthyInstances: 0,
      totalPages: 0,
      availablePages: 0,
    };

    for (const instance of this.browserInstances.values()) {
      if (instance.healthy) {
        metrics.healthyInstances++;
        metrics.totalPages += this.PAGE_POOL_SIZE;
        metrics.availablePages += instance.pagePool.length;
      }
    }

    return metrics;
  }
}

export const browserManager = BrowserManager.getInstance();
export type { PageScreenshotOptions } from 'playwright';

import logger from '@/lib/logger';

export interface BackgroundTaskOptions {
  maxRetries?: number;
  retryDelay?: number;
  taskName?: string;
  onSuccess?: (result?: any) => void;
  onFailure?: (error: Error, attempt: number) => void;
  onFinalFailure?: (error: Error) => void;
}

export interface BackgroundTaskResult {
  success: boolean;
  result?: any;
  error?: Error;
  attempts: number;
}

/**
 * Executes a task in the background with retry logic and comprehensive error handling
 */
export const executeBackgroundTask = async <T>(
  task: () => Promise<T>,
  options: BackgroundTaskOptions = {}
): Promise<void> => {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    taskName = 'Background Task',
    onSuccess,
    onFailure,
    onFinalFailure,
  } = options;

  setImmediate(async () => {
    let lastError: Error | null = null;
    let attempt = 0;

    const executeWithRetry = async (): Promise<BackgroundTaskResult> => {
      while (attempt < maxRetries) {
        attempt++;

        try {
          logger.info(`${taskName} started (attempt ${attempt}/${maxRetries})`);

          const result = await task();

          logger.info(
            `${taskName} completed successfully on attempt ${attempt}`
          );

          if (onSuccess) {
            try {
              onSuccess(result);
            } catch (callbackError) {
              logger.error(
                `${taskName} success callback failed:`,
                callbackError
              );
            }
          }

          return {
            success: true,
            result,
            attempts: attempt,
          };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          logger.warn(
            `${taskName} failed on attempt ${attempt}/${maxRetries}:`,
            lastError.message
          );

          if (onFailure) {
            try {
              onFailure(lastError, attempt);
            } catch (callbackError) {
              logger.error(
                `${taskName} failure callback failed:`,
                callbackError
              );
            }
          }

          // If this isn't the last attempt, wait before retrying
          if (attempt < maxRetries) {
            const delay = retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
            logger.info(`${taskName} retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      return {
        success: false,
        error: lastError!,
        attempts: attempt,
      };
    };

    try {
      const result = await executeWithRetry();

      if (!result.success) {
        logger.error(
          `${taskName} failed after ${result.attempts} attempts:`,
          result.error
        );

        if (onFinalFailure) {
          try {
            onFinalFailure(result.error!);
          } catch (callbackError) {
            logger.error(
              `${taskName} final failure callback failed:`,
              callbackError
            );
          }
        }
      }
    } catch (unexpectedError) {
      logger.error(
        `${taskName} encountered unexpected error:`,
        unexpectedError
      );

      if (onFinalFailure) {
        try {
          onFinalFailure(
            unexpectedError instanceof Error
              ? unexpectedError
              : new Error(String(unexpectedError))
          );
        } catch (callbackError) {
          logger.error(
            `${taskName} final failure callback failed:`,
            callbackError
          );
        }
      }
    }
  });
};

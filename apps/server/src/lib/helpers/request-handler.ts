import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { v4 as uuidv4 } from 'uuid';

import {
  sharedResponses,
  CustomNestedError,
} from '@/lib/helpers/response-helper';
import logger from '@/lib/logger';

export const handler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const requestId = uuidv4();
    const logPayload = {
      request: {
        requestId,
        method: req.method,
        actualPath: req.originalUrl,
        route: getFullRoutePath(req),
      },
    };

    logger.info('Processing request', logPayload);

    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    res.on('finish', () => {
      logger.info('Request completed', {
        ...logPayload,
        response: {
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          locals: res.locals,
        },
      });
    });

    try {
      await fn(req, res, next);
    } catch (error) {
      if (error instanceof ZodError) {
        return sharedResponses.FAILED_TO_PROCESS(res, formatZodError(error));
      }

      if (error instanceof CustomNestedError) {
        const { status, ...errorResponse } = error.toJSON();
        return res.status(status).json(errorResponse);
      } else {
        logger.error('Unhandled error in request handler', error);
        return sharedResponses.INTERNAL_SERVER_ERROR(res);
      }
    }
  };
};

const formatZodError = (error: ZodError): string[] => {
  return error.issues.map((issue) => {
    const path = issue.path.reduce((path, key) => {
      if (typeof key === 'number') {
        return `${path}[${key}]`;
      }
      return path ? `${path}.${key}` : key;
    }, '');

    switch (issue.code) {
      case 'invalid_enum_value':
        return `Invalid value for ${path}. Expected one of: ${issue.options?.join(', ')}, received: ${issue.received}`;

      case 'invalid_type':
        return `Invalid type for ${path}. Expected ${issue.expected}, received: ${issue.received}`;

      case 'too_small':
      case 'too_big':
        return `${path}: ${issue.message}`;

      default:
        return issue.message;
    }
  });
};

export function getFullRoutePath(req: Request): string {
  const baseUrl = req.baseUrl || '';
  const route = req.route?.path || '';

  if (!route) {
    return req.path || baseUrl || '(unknown route)';
  }

  function normalizeParams(routeSegment: string): string {
    const normalized = routeSegment
      .split('/')
      .map((segment) => {
        for (const [paramName, paramValue] of Object.entries(req.params)) {
          if (segment === paramValue) {
            return `:${paramName}`;
          }
        }
        return segment;
      })
      .join('/');

    if (normalized.endsWith('/')) {
      return normalized.slice(0, -1);
    }

    return normalized;
  }

  let fullPath = `${baseUrl}${route}`;

  fullPath = fullPath.replace(/\/+/g, '/');

  if (!fullPath.startsWith('/')) {
    fullPath = '/' + fullPath;
  }

  return normalizeParams(fullPath);
}

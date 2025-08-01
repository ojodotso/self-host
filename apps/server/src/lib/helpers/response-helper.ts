import { Response } from 'express';

export const generateHotlinkURL = ({
  domain,
  filename,
}: {
  domain: string;
  filename: string;
}) => {
  return `${domain}/${filename}`;
};

const statusMap = {
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
} as const;

const isResponseSent = (res: Response) =>
  res.writableEnded || res.writableFinished || res.headersSent;

interface JSONResponse {
  message: string;
  [key: string]: any;
}

interface ErrorJSONResponse extends JSONResponse {
  status: number;
}

interface SuccessJSONResponse extends JSONResponse {
  data: string;
}

export const errorJSONResponse = (
  res: Response,
  { status, message, ...rest }: ErrorJSONResponse
) => {
  if (isResponseSent(res)) {
    return;
  }

  res.locals = {
    ...rest,
  };

  return res.status(status).json({
    error: true,
    message,
    ...(rest || {}),
  });
};

export const successJSONResponse = (
  res: Response,
  { data, message, ...rest }: SuccessJSONResponse
) => {
  if (isResponseSent(res)) {
    return;
  }

  const payload: {
    data?: string;
    message?: string;
  } = {
    ...(rest || {}),
  };

  if (data) {
    payload.data = data;
  }

  if (message) {
    payload.message = message;
  }

  return res.json(payload);
};

export const imageResponse = (
  res: Response,
  imageBuffer: Buffer,
  mime = 'image/png'
) => {
  res.setHeader('Content-Type', mime);
  return res.send(imageBuffer);
};

export const sharedResponses = {
  BAD_REQUEST: (res: Response, message: string) => {
    return errorJSONResponse(res, {
      status: 400,
      message: message || statusMap[400],
    });
  },
  UNAUTHORIZED: (res: Response) => {
    return errorJSONResponse(res, {
      status: 401,
      message: statusMap[401],
    });
  },
  PAYMENT_REQUIRED: (res: Response) => {
    return errorJSONResponse(res, {
      status: 402,
      message: statusMap[402],
    });
  },
  NOT_FOUND: (res: Response, message: string) => {
    return errorJSONResponse(res, {
      status: 404,
      message: message || statusMap[404],
    });
  },
  INTERNAL_SERVER_ERROR: (res: Response) => {
    return errorJSONResponse(res, {
      status: 500,
      message: statusMap[500],
    });
  },
  FAILED_TO_PROCESS: (res: Response, logs: Array<string>, message?: string) => {
    return errorJSONResponse(res, {
      status: 422,
      message: message || statusMap[422],
      logs: logs.map((log) => log.replaceAll(/(\r\n|\n|\r)/gm, '')),
    });
  },
  TOO_MANY_REQUESTS: (res: Response) => {
    return errorJSONResponse(res, {
      status: 429,
      message: 'Too Many Requests',
    });
  },
};

export class CustomNestedError extends Error {
  constructor(
    public status: number,
    public message: string,
    public logs: Array<string>
  ) {
    super(message);
    this.name = 'CustomNestedError';
  }

  toJSON() {
    return {
      error: true,
      status: this.status,
      message: this.message,
      logs: this.logs.map((log) => log.replaceAll(/(\r\n|\n|\r)/gm, '')),
    };
  }
}

export const sharedNestedErrorResponses = {
  FAILED_TO_PROCESS: (logs: string[]) => {
    return new CustomNestedError(422, statusMap[422], logs);
  },
};

import { NextFunction, Request, Response } from 'express';

import { sharedResponses } from '@/lib/helpers/response-helper';

export const adminAuthorizer = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers['authorization'];

  if (!token) {
    return sharedResponses.UNAUTHORIZED(res);
  }

  const adminToken = process.env.ADMIN_TOKEN;

  if (token !== adminToken) {
    return sharedResponses.UNAUTHORIZED(res);
  }

  next();
};

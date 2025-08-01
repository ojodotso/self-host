import { Template } from '@ojo/libs';

import { isValidHTML } from './html-validator';

export type TemplateValidationResult = {
  error: boolean;
  message?: string;
  validatedBody?: Template.RenderContext;
};

export async function validateTemplateRequestBody(
  body: unknown
): Promise<TemplateValidationResult> {
  if (typeof body !== 'object' || body === null) {
    return { error: true, message: 'Invalid body' };
  }

  const renderContext = body as Partial<Template.RenderContext>;

  if (typeof renderContext.content !== 'string') {
    return {
      error: true,
      message: "HTML 'content' is required and must be a string",
    };
  }

  if (!isValidHTML(renderContext.content)) {
    return {
      error: true,
      message: 'Invalid HTML content. Please check your HTML',
    };
  }

  if (renderContext.variables !== undefined) {
    if (
      typeof renderContext.variables !== 'object' ||
      renderContext.variables === null
    ) {
      return {
        error: true,
        message: 'variables must be an object or undefined',
      };
    }

    for (const [key, value] of Object.entries(renderContext.variables)) {
      if (typeof value !== 'string') {
        return {
          error: true,
          message: `All values in variables must be strings. Invalid value for key: ${key}`,
        };
      }
    }
  }

  return {
    error: false,
    validatedBody: renderContext as Template.RenderContext,
  };
}

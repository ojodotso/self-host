import handlebars from 'handlebars';
import './handlebars-helpers';

export type RenderContext = {
  content: string;
  variables?: {
    [key: string]: any;
  };
};

export class TemplateRenderError extends Error {
  readonly isTemplateRenderError = true;
  constructor(
    message: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'TemplateRenderError';
  }
}

export function isTemplateRenderError(
  error: unknown
): error is TemplateRenderError {
  return (
    error !== null &&
    typeof error === 'object' &&
    'isTemplateRenderError' in error &&
    (error as TemplateRenderError).isTemplateRenderError === true
  );
}

export const renderTemplate = (context: RenderContext): string => {
  // Check for null/undefined content
  if (context?.content === null || context?.content === undefined) {
    throw new TemplateRenderError('Template content is required');
  }

  let html = context.content;

  if (context.variables) {
    try {
      const template = handlebars.compile(html);
      html = template(context.variables);
    } catch (error) {
      throw new TemplateRenderError(
        'Failed to render template with variables',
        error as Error
      );
    }
  }

  return html;
};

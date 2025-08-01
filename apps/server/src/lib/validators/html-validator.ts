import { JSDOM } from 'jsdom';

export function isValidHTML(html: string): boolean {
  try {
    new JSDOM(html, {
      url: 'http://localhost',
      referrer: 'http://localhost',
      contentType: 'text/html',
      runScripts: 'outside-only',
    });
    return true;
  } catch (error) {
    return false;
  }
}

export const decodeHTMLFromTransport = (
  encoded: string | undefined
): string => {
  if (!encoded) return '';

  try {
    return Buffer.from(encoded, 'base64').toString();
  } catch (error) {
    throw new Error(
      'Failed to decode HTML string. Ensure it was properly encoded.'
    );
  }
};

export const encodeHTMLForTransport = (html: string | undefined) => {
  if (!html) return undefined;

  return Buffer.from(html).toString('base64');
};

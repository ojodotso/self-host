export interface ScreenshotOptions {
  html: string;
  viewportWidth?: number;
  viewportHeight?: number;
  transparent?: boolean;
}

export interface ScreenshotResult {
  success: boolean;
  data?: Buffer;
  error?: string;
  logs?: string[];
}

export interface PdfOptions {
  html: string;
  format?:
    | 'A4'
    | 'A3'
    | 'A2'
    | 'A1'
    | 'A0'
    | 'Legal'
    | 'Letter'
    | 'Tabloid'
    | 'Ledger';
  width?: string | number;
  height?: string | number;
  margin?: {
    top?: string | number;
    right?: string | number;
    bottom?: string | number;
    left?: string | number;
  };
  landscape?: boolean;
  printBackground?: boolean;
  scale?: number;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
  preferCSSPageSize?: boolean;
}

export interface PdfResult {
  success: boolean;
  data?: Buffer;
  error?: string;
  logs?: string[];
}

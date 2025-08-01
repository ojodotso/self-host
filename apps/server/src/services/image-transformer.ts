import sharp from 'sharp';
import { z } from 'zod';

import { sharedNestedErrorResponses } from '@/lib/helpers/response-helper';

interface Position {
  x: number;
  y: number;
}

export interface ProcessImageOptions {
  width?: number;
  height?: number;
  maxWidth?: number;
  maxHeight?: number;
  minWidth?: number;
  minHeight?: number;

  aspectRatio?: string; // e.g., "16:9"
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  position?: Position;

  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  quality?: number;
  progressive?: boolean;
  lossless?: boolean;

  crop?: 'entropy' | 'attention' | 'center';
  focal?: Position;

  brightness?: number; // -100 to 100
  contrast?: number; // -100 to 100
  saturation?: number; // -100 to 100
  hue?: number; // -360 to 360
  gamma?: number; // 1.0 to 3.0
  grayscale?: boolean;

  blur?: number; // 0.3 to 1000
  sharpen?:
    | boolean
    | {
        sigma?: number; // 0.01 to 10000
        m1?: number; // 0 to 1000
        m2?: number; // 0 to 1000
      };
  rotate?: number;
  flip?: boolean;
  flop?: boolean;

  background?: string;

  metadata?: boolean;
  strip?: boolean;

  optimizeSize?: boolean;

  auto?: ('format' | 'compress' | 'enhance')[];

  dpr?: number;
}

interface ProcessResult {
  data: Buffer;
  format: string;
  metadata?: sharp.Metadata;
  stats?: sharp.Stats;
}

export class ImageTransformService {
  private readonly maxDimension = 3840;
  private hasTransparency: boolean = false;

  constructor() {
    // Configure Sharp defaults
    sharp.concurrency(1); // Avoids memory issues
    sharp.cache(true); // Limit cache to 50MB
  }

  private validateDimensions(width?: number, height?: number): void {
    if (width && (width < 1 || width > this.maxDimension)) {
      throw new Error(`Width must be between 1 and ${this.maxDimension}`);
    }
    if (height && (height < 1 || height > this.maxDimension)) {
      throw new Error(`Height must be between 1 and ${this.maxDimension}`);
    }
  }

  private parseAspectRatio(ratio: string): number {
    const [width, height] = ratio.split(':').map(Number);
    if (!width || !height) {
      throw new Error('Invalid aspect ratio format. Expected "width:height"');
    }
    return width / height;
  }

  private selectOptimalFormat(
    accept?: string,
    originalFormat?: string
  ): 'jpeg' | 'png' | 'webp' | 'avif' {
    if (accept) {
      if (accept.includes('image/avif')) return 'avif';
      if (accept.includes('image/webp')) return 'webp';
    }

    if (originalFormat === 'png' && this.hasTransparency) {
      return 'png';
    }

    return 'webp';
  }

  private async getAverageColor(imageProcess: sharp.Sharp): Promise<string> {
    const stats = await imageProcess.stats();

    const { r, g, b } = stats.dominant;

    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    return hex;
  }

  private async applyTransformations(
    imageProcess: sharp.Sharp,
    options: ProcessImageOptions,
    metadata: sharp.Metadata
  ): Promise<sharp.Sharp> {
    if (options.dpr && options.dpr !== 1) {
      if (options.width)
        options.width = Math.round(options.width * options.dpr);
      if (options.height)
        options.height = Math.round(options.height * options.dpr);
      if (options.maxWidth)
        options.maxWidth = Math.round(options.maxWidth * options.dpr);
      if (options.maxHeight)
        options.maxHeight = Math.round(options.maxHeight * options.dpr);
    }

    this.validateDimensions(options.width, options.height);
    this.validateDimensions(options.maxWidth, options.maxHeight);
    this.validateDimensions(options.minWidth, options.minHeight);

    if (options.rotate) {
      imageProcess = imageProcess.rotate(options.rotate);
    }
    if (options.flip) {
      imageProcess = imageProcess.flip();
    }
    if (options.flop) {
      imageProcess = imageProcess.flop();
    }

    if (
      options.width ||
      options.height ||
      options.maxWidth ||
      options.maxHeight ||
      options.minWidth ||
      options.minHeight ||
      options.aspectRatio
    ) {
      const resizeOptions: sharp.ResizeOptions = {
        fit: options.fit || 'cover',
        withoutEnlargement: true,
        background: undefined,
      };

      if (options.background) {
        if (options.background === 'mean') {
          options.background = await this.getAverageColor(imageProcess);
        } else {
          resizeOptions.background = `#${options.background}`;
        }
      }

      if (options.focal) {
        const x = options.focal.x;
        const y = options.focal.y;

        if (y < 0.33) {
          if (x < 0.33) resizeOptions.position = sharp.gravity.northwest;
          else if (x < 0.66) resizeOptions.position = sharp.gravity.north;
          else resizeOptions.position = sharp.gravity.northeast;
        } else if (y < 0.66) {
          if (x < 0.33) resizeOptions.position = sharp.gravity.west;
          else if (x < 0.66) resizeOptions.position = sharp.gravity.center;
          else resizeOptions.position = sharp.gravity.east;
        } else {
          if (x < 0.33) resizeOptions.position = sharp.gravity.southwest;
          else if (x < 0.66) resizeOptions.position = sharp.gravity.south;
          else resizeOptions.position = sharp.gravity.southeast;
        }
      } else if (options.crop === 'entropy') {
        resizeOptions.position = sharp.strategy.entropy;
      } else if (options.crop === 'attention') {
        resizeOptions.position = sharp.strategy.attention;
      }

      let width = options.width;
      let height = options.height;

      if (options.aspectRatio && (width || height)) {
        const ratio = this.parseAspectRatio(options.aspectRatio);

        if (width) height = Math.round(width / ratio);
        else if (height) width = Math.round(height * ratio);
      }

      imageProcess = imageProcess.resize({
        width,
        height,
        ...resizeOptions,
      });
    }

    if (
      options.brightness !== undefined ||
      options.saturation !== undefined ||
      options.hue !== undefined
    ) {
      const modulateOptions: {
        brightness?: number;
        saturation?: number;
        hue?: number;
      } = {};

      if (options.brightness !== undefined) {
        modulateOptions.brightness = 1 + options.brightness / 100;
      }
      if (options.saturation !== undefined) {
        modulateOptions.saturation = 1 + options.saturation / 100;
      }
      if (options.hue !== undefined) {
        modulateOptions.hue = options.hue;
      }

      imageProcess = imageProcess.modulate(modulateOptions);
    }

    if (options.contrast !== undefined) {
      imageProcess = imageProcess.linear(
        1 + options.contrast / 100,
        -(options.contrast * 128) / 100
      );
    }

    if (options.gamma !== undefined) {
      imageProcess = imageProcess.gamma(options.gamma);
    }

    if (options.grayscale) {
      imageProcess = imageProcess.grayscale();
    }

    if (options.blur) {
      imageProcess = imageProcess.blur(options.blur);
    }

    if (options.sharpen) {
      imageProcess = imageProcess.sharpen();
    }

    if (options.strip) {
      imageProcess = imageProcess.withMetadata();
    }

    return imageProcess;
  }

  async process(
    input: string | Buffer,
    rawOptions: ProcessImageOptions,
    acceptHeader?: string
  ): Promise<ProcessResult> {
    let processInput: string | Buffer;
    if (Buffer.isBuffer(input)) {
      processInput = input;
    } else if (typeof input === 'string') {
      processInput = input;
    } else {
      throw new Error('Invalid input type');
    }

    const parsedOptions = optionsSchema.parse(rawOptions);

    let inputBuffer: Buffer;
    if (typeof processInput === 'string') {
      const response = await fetch(processInput);

      if (!response.ok) {
        throw sharedNestedErrorResponses.FAILED_TO_PROCESS([
          `Failed to fetch image from URL. Status: ${response.status} ${response.statusText}`,
        ]);
      }
      inputBuffer = Buffer.from(await response.arrayBuffer());
    } else {
      inputBuffer = processInput;
    }

    let imageProcess = sharp(inputBuffer);
    const metadata = await imageProcess.metadata();

    if (metadata.hasAlpha) {
      this.hasTransparency = true;
    }

    let format = parsedOptions.format;
    if (parsedOptions.auto?.includes('format')) {
      format = this.selectOptimalFormat(acceptHeader, metadata.format);
    }

    imageProcess = await this.applyTransformations(
      imageProcess,
      parsedOptions,
      metadata
    );

    if (format === 'jpeg') {
      imageProcess = imageProcess.jpeg({
        quality: parsedOptions.quality || 80,
        progressive: parsedOptions.progressive,
        optimizeCoding: parsedOptions.optimizeSize,
      });
    } else if (format === 'webp') {
      imageProcess = imageProcess.webp({
        quality: parsedOptions.quality || 80,
        lossless: parsedOptions.lossless,
        nearLossless: parsedOptions.optimizeSize,
      });
    } else if (format === 'avif') {
      imageProcess = imageProcess.avif({
        quality: parsedOptions.quality || 80,
        lossless: parsedOptions.lossless,
      });
    } else if (format === 'png') {
      imageProcess = imageProcess.png({
        progressive: parsedOptions.progressive,
        palette: parsedOptions.optimizeSize,
      });
    }

    const outputBuffer = await imageProcess.toBuffer();

    let outputMetadata;
    if (parsedOptions.metadata) {
      outputMetadata = await imageProcess.metadata();
    }

    let stats;
    if (parsedOptions.optimizeSize) {
      stats = await imageProcess.stats();
    }

    const result: ProcessResult = {
      data: outputBuffer,
      format: format || metadata.format || 'jpeg',
      ...(outputMetadata && { metadata: outputMetadata }),
      ...(stats && { stats }),
    };

    return result;
  }
}

export const imageTransformService = new ImageTransformService();

const positionSchema = z.object({
  x: z.coerce.number(),
  y: z.coerce.number(),
});

const sharpenSchema = z.union([
  z.boolean(),
  z.object({
    sigma: z.coerce.number().optional(),
    m1: z.coerce.number().optional(),
    m2: z.coerce.number().optional(),
  }),
]);

const optionsSchema = z.object({
  url: z.string().url().optional(),
  width: z.coerce.number().int().min(1).max(5000).optional(),
  height: z.coerce.number().int().min(1).max(5000).optional(),
  maxWidth: z.coerce.number().int().min(1).max(5000).optional(),
  maxHeight: z.coerce.number().int().min(1).max(5000).optional(),
  minWidth: z.coerce.number().int().min(1).max(5000).optional(),
  minHeight: z.coerce.number().int().min(1).max(5000).optional(),
  aspectRatio: z.string().optional(),
  fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']).optional(),
  position: positionSchema.optional(),
  format: z.enum(['jpeg', 'png', 'webp', 'avif']).optional(),
  quality: z.coerce.number().int().min(1).max(100).optional(),
  progressive: z.boolean().optional(),
  lossless: z.boolean().optional(),
  crop: z.enum(['entropy', 'attention', 'center']).optional(),
  focal: positionSchema.optional(),
  brightness: z.coerce.number().min(-100).max(100).optional(),
  contrast: z.coerce.number().min(-100).max(100).optional(),
  saturation: z.coerce.number().min(-100).max(100).optional(),
  hue: z.coerce.number().min(-360).max(360).optional(),
  grayscale: z.boolean().optional(),
  gamma: z.coerce.number().min(1).max(3).optional(),
  blur: z.coerce.number().min(0.3).max(1000).optional(),
  sharpen: sharpenSchema.optional(),
  rotate: z.coerce.number().optional(),
  flip: z.boolean().optional(),
  flop: z.boolean().optional(),
  background: z
    .union([
      z
        .string()
        .regex(
          /^[0-9A-Fa-f]{3}$/,
          'Invalid hex color. Use 3 digits like "fff"'
        ),

      z
        .string()
        .regex(
          /^[0-9A-Fa-f]{6}$/,
          'Invalid hex color. Use 6 digits like "ff00ff"'
        ),
      z.literal('mean'),
    ])
    .optional(),
  metadata: z.boolean().optional(),
  strip: z.boolean().optional(),
  optimizeSize: z.boolean().optional(),
  auto: z.array(z.enum(['format', 'compress', 'enhance'])).optional(),
  dpr: z.coerce.number().min(0.1).max(10).optional(),
});

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import logger from '@/lib/logger';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.BLOB_STORAGE_CLIENT_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.BLOB_STORAGE_ACCESS_KEY!,
    secretAccessKey: process.env.BLOB_STORAGE_SECRET_KEY!,
  },
});

type GetPresignedUrlProps = {
  bucketName: string;
  storagePath: string;
  expiresIn?: number;
  customHostname?: string;
};

type UploadToStorageProps = {
  bucketName: string;
  imageBuffer: Buffer;
  filename: string;
  contentType: string;
};

export const uploadToStorage = async ({
  bucketName,
  imageBuffer,
  filename,
  contentType,
}: UploadToStorageProps) => {
  if (!imageBuffer) {
    throw new Error('Invalid image buffer');
  }

  const params = {
    Bucket: bucketName,
    Key: filename,
    Body: imageBuffer,
    ContentType: contentType,
  };

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      await s3Client.send(new PutObjectCommand(params));
      break;
    } catch (error) {
      attempt++;
      logger.error(`Attempt ${attempt} to upload image failed`, error);
      if (attempt >= maxRetries) {
        throw error;
      }
    }
  }
};

export const deleteFromStorage = async ({
  bucketName,
  filename,
}: {
  bucketName: string;
  filename: string;
}) => {
  try {
    const response = await s3Client.send(
      new DeleteObjectCommand({ Bucket: bucketName, Key: filename })
    );

    return response;
  } catch (error) {
    logger.error(`Failed to delete ${filename} from ${bucketName}`, error);

    return null;
  }
};

export const getFromStorage = async ({
  bucketName,
  filename,
}: {
  bucketName: string;
  filename: string;
}): Promise<Buffer | null> => {
  try {
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: filename,
    });

    const response = await s3Client.send(getObjectCommand);

    if (response.Body) {
      if (response.Body instanceof ReadableStream) {
        const reader = response.Body.getReader();
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        return Buffer.concat(chunks);
      } else {
        const chunks: Uint8Array[] = [];

        for await (const chunk of response.Body as any) {
          chunks.push(chunk);
        }

        return Buffer.concat(chunks);
      }
    }

    return null;
  } catch (error) {
    logger.error('Error getting file from S3:', error);
    return null;
  }
};

export const getPresignedURL = async ({
  bucketName,
  storagePath,
  expiresIn = 3600,
  customHostname,
}: GetPresignedUrlProps) => {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: storagePath,
  });

  // There is a weird issue that cause TS error
  // https://github.com/aws/aws-sdk-js-v3/issues/4451
  // @ts-ignore
  const presignedUrl = await getSignedUrl(s3Client, command, {
    expiresIn,
  });

  if (customHostname) {
    const url = new URL(presignedUrl);
    url.hostname = customHostname;
    return url.toString();
  }
};

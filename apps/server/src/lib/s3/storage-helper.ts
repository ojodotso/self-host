import {
  uploadToStorage,
  deleteFromStorage,
  getFromStorage,
} from '@/lib/s3/client';

export class Storage {
  bucketName: string;
  filename: string;
  userFolder: string;

  constructor({ filename }: { filename: string }) {
    if (!process.env.BLOB_STORAGE_BUCKET_NAME) {
      throw new Error('BLOB_STORAGE_BUCKET_NAME is not set');
    }

    this.bucketName = process.env.BLOB_STORAGE_BUCKET_NAME;
    this.filename = filename;
    this.userFolder = process.env.BLOB_STORAGE_BUCKET_FOLDER || 'ojo-images';
  }

  getPath = () => {
    return this.userFolder + '/' + this.filename;
  };

  async upload(imageBuffer: Buffer, contentType: string) {
    if (!imageBuffer) {
      throw new Error('Invalid image buffer');
    }

    await uploadToStorage({
      bucketName: this.bucketName,
      imageBuffer,
      filename: this.getPath(),
      contentType,
    });

    const response = {
      filepath: this.getPath(),
      created_at: new Date().toISOString(),
    };

    return response;
  }

  async get() {
    const imageBuffer = await getFromStorage({
      bucketName: this.bucketName,
      filename: this.getPath(),
    });

    if (!imageBuffer) {
      throw new Error('Image not found');
    }

    return imageBuffer;
  }

  async delete() {
    const result = await deleteFromStorage({
      bucketName: this.bucketName,
      filename: this.getPath(),
    });

    if (result) {
      return true;
    }

    return false;
  }
}

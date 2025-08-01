import { generateShortIdentifier } from '@/lib/helpers/asset-helper';

import { Storage } from '@/lib/s3/storage-helper';

export const storeImage = async ({ imageBuffer }: { imageBuffer: Buffer }) => {
  const imageType = (await import('image-type')).default;

  const imageTypeResult = await imageType(imageBuffer);

  let filename = generateShortIdentifier();

  if (imageTypeResult?.ext) {
    filename = `${filename}.${imageTypeResult.ext}`;
  } else {
    filename = `${filename}.png`;
  }

  const { created_at, filepath } = await new Storage({
    filename,
  }).upload(imageBuffer, imageTypeResult?.mime || 'image/png');

  const publicImageId = `${filename}`;

  return {
    publicImageId,
    filepath,
    created_at,
  };
};

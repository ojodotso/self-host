import { eq, desc, asc, and, isNull, count } from 'drizzle-orm';

import { db } from '../db';
import { imageGenerations } from '../schema';

export interface ImageGenerationPayload {
  publicImageId: string;
  templateId?: string;
  payload?: any;
  filepath: string;
  size: number;
  html?: string;
}

export async function recordImageGeneration(data: ImageGenerationPayload) {
  const result = await db
    .insert(imageGenerations)
    .values({
      payload: data.payload || {},
      filepath: data.filepath,
      template_id: data.templateId,
      html: data.html,
      public_id: data.publicImageId,
      size_bytes: data.size,
    })
    .returning();

  return result[0];
}

export async function recordMultipleImageGenerations(
  dataArray: ImageGenerationPayload[]
) {
  const values = dataArray.map((data) => ({
    payload: data.payload || {},
    filepath: data.filepath,
    template_id: data.templateId,
    html: data.html,
    public_id: data.publicImageId,
    size_bytes: data.size,
  }));

  const result = await db.insert(imageGenerations).values(values).returning();
  return result;
}

export async function getImageRecord(publicImageId: string) {
  const result = await db
    .select()
    .from(imageGenerations)
    .where(
      and(
        eq(imageGenerations.public_id, publicImageId),
        isNull(imageGenerations.deleted_at)
      )
    )
    .limit(1);

  return result[0] || null;
}

export async function getImageRecords({
  page,
  pageSize,
  sort = 'desc',
}: {
  page: number;
  pageSize: number;
  sort?: 'asc' | 'desc';
}) {
  const offset = (page - 1) * pageSize;
  const orderBy =
    sort === 'asc'
      ? asc(imageGenerations.created_at)
      : desc(imageGenerations.created_at);

  const [records, totalCount] = await Promise.all([
    db
      .select()
      .from(imageGenerations)
      .where(isNull(imageGenerations.deleted_at))
      .orderBy(orderBy)
      .limit(pageSize)
      .offset(offset),

    db
      .select({ count: count() })
      .from(imageGenerations)
      .where(isNull(imageGenerations.deleted_at)),
  ]);

  return {
    data: records,
    pagination: {
      page,
      pageSize,
      total: totalCount[0]?.count || 0,
      totalPages: Math.ceil((totalCount[0]?.count || 0) / pageSize),
    },
  };
}

export async function deleteImageRecord(publicImageId: string) {
  const result = await db
    .update(imageGenerations)
    .set({
      deleted_at: new Date(),
      delete_reason: 'User deleted',
    })
    .where(
      and(
        eq(imageGenerations.public_id, publicImageId),
        isNull(imageGenerations.deleted_at)
      )
    )
    .returning();

  return result[0] || null;
}

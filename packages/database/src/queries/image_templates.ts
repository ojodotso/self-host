import { eq, desc, asc, and, isNull, count } from 'drizzle-orm';

import { db } from '../db';
import { imageTemplates } from '../schema';

export interface TemplateCreateUpdatePayload {
  templateId: string;
  html: string;
  variables?: any;
  preview_storage_path: string;
  name?: string;
  description?: string;
  default_dimensions?: any;
}

export async function recordImageTemplate(data: TemplateCreateUpdatePayload) {
  const result = await db
    .insert(imageTemplates)
    .values({
      template_id: data.templateId,
      html: data.html,
      variables: data.variables,
      preview_storage_path: data.preview_storage_path,
      name: data.name,
      description: data.description,
      default_dimensions: data.default_dimensions,
    })
    .returning();

  return result[0];
}

export async function getImageTemplate(templateId: string) {
  const result = await db
    .select()
    .from(imageTemplates)
    .where(
      and(
        eq(imageTemplates.template_id, templateId),
        isNull(imageTemplates.deleted_at)
      )
    )
    .limit(1);

  return result[0] || null;
}

export async function getImageTemplates({
  page,
  pageSize,
  sort = 'desc',
  preview = false,
}: {
  page: number;
  pageSize: number;
  sort?: 'asc' | 'desc';
  preview?: boolean;
}) {
  const offset = (page - 1) * pageSize;
  const orderBy =
    sort === 'asc'
      ? asc(imageTemplates.created_at)
      : desc(imageTemplates.created_at);

  const selectFields = preview
    ? {
        template_id: imageTemplates.template_id,
        name: imageTemplates.name,
        description: imageTemplates.description,
        preview_storage_path: imageTemplates.preview_storage_path,
        created_at: imageTemplates.created_at,
        updated_at: imageTemplates.updated_at,
      }
    : undefined;

  const [records, totalCount] = await Promise.all([
    selectFields
      ? db
          .select(selectFields)
          .from(imageTemplates)
          .where(isNull(imageTemplates.deleted_at))
          .orderBy(orderBy)
          .limit(pageSize)
          .offset(offset)
      : db
          .select()
          .from(imageTemplates)
          .where(isNull(imageTemplates.deleted_at))
          .orderBy(orderBy)
          .limit(pageSize)
          .offset(offset),

    db
      .select({ count: count() })
      .from(imageTemplates)
      .where(isNull(imageTemplates.deleted_at)),
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

export async function updateImageTemplate(data: TemplateCreateUpdatePayload) {
  const updateData: any = {
    updated_at: new Date(),
    preview_storage_path: data.preview_storage_path,
  };

  if (data.html) {
    updateData.html = data.html;
  }

  if (data.variables !== undefined) {
    updateData.variables = data.variables;
  }

  if (data.name !== undefined) {
    updateData.name = data.name;
  }

  if (data.description !== undefined) {
    updateData.description = data.description;
  }

  if (data.default_dimensions !== undefined) {
    updateData.default_dimensions = data.default_dimensions;
  }

  const result = await db
    .update(imageTemplates)
    .set(updateData)
    .where(
      and(
        eq(imageTemplates.template_id, data.templateId),
        isNull(imageTemplates.deleted_at)
      )
    )
    .returning();

  return result;
}

export async function deleteImageTemplate(templateId: string) {
  const result = await db
    .update(imageTemplates)
    .set({
      deleted_at: new Date(),
    })
    .where(
      and(
        eq(imageTemplates.template_id, templateId),
        isNull(imageTemplates.deleted_at)
      )
    )
    .returning();

  return result[0] || null;
}

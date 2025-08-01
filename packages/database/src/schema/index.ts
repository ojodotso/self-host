import {
  pgTable,
  timestamp,
  text,
  serial,
  integer,
  boolean,
  jsonb,
} from 'drizzle-orm/pg-core';

export const imageGenerations = pgTable('image_generations', {
  id: serial('id').primaryKey(),
  created_at: timestamp('created_at').defaultNow(),
  payload: jsonb('payload').notNull(),
  filepath: text('filepath'),
  template_id: text('template_id'),
  html: text('html'),
  public_id: text('public_id'),
  deleted_at: timestamp('deleted_at'),
  delete_reason: text('delete_reason'),
  size_bytes: integer('size_bytes'),
});

export const imageTemplates = pgTable('image_templates', {
  template_id: text('template_id').primaryKey().notNull(),
  created_at: timestamp('created_at').defaultNow(),
  html: text('html').notNull(),
  updated_at: timestamp('updated_at').defaultNow(),
  deleted_at: timestamp('deleted_at'),
  variables: jsonb('variables'),
  preview_storage_path: text('preview_storage_path').notNull(),
  name: text('name'),
  description: text('description'),
  default_dimensions: jsonb('default_dimensions'),
});

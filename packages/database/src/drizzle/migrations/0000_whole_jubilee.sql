CREATE TABLE IF NOT EXISTS "image_generations" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"payload" jsonb NOT NULL,
	"filepath" text,
	"template_id" text,
	"html" text,
	"public_id" text,
	"deleted_at" timestamp,
	"delete_reason" text,
	"size_bytes" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "image_templates" (
	"template_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"html" text NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"variables" jsonb,
	"preview_storage_path" text NOT NULL,
	"name" text,
	"description" text,
	"default_dimensions" jsonb
);

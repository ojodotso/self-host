# oJo Self-Host AI Coding Instructions

## Architecture Overview

This is a **microservices HTML-to-image API** with two main apps:

- `apps/server/` - Express.js API server (port 3011) handling image generation requests
- `apps/browser/` - Headless Chrome service (port 53444) using Playwright for screenshot capture

Communication flow: **Client → Server API → Browser Service (WebSocket) → S3 Storage**

## Key Patterns & Conventions

### Monorepo Structure (Turborepo + pnpm workspaces)

- Use `pnpm dev` for development (starts both services)
- Shared packages in `packages/`: `@ojo/database`, `@ojo/browser`, `@ojo/libs`
- Import using workspace aliases: `import { queries } from '@ojo/database'`

### Development vs Production Environments

- **Dev**: `docker-compose -f docker-compose-dev.yml up browser -d` + `pnpm dev`
- **Prod**: `docker-compose up` (uses pre-built images)
- Environment files: `.env.development` (dev) vs `.env` (prod)

### Authentication Pattern

Simple token-based auth via `ADMIN_TOKEN` environment variable:

```typescript
// All API routes require: Authorization: Bearer <ADMIN_TOKEN>
import { adminAuthorizer } from '@/middlewares/admin-authorizer';
```

### Browser Service Architecture

The browser service uses a **page pool pattern** with health checks:

- `BrowserManager` maintains connections to multiple browser endpoints
- Pages are pre-created, secured, and reused for efficiency
- Automatic reconnection and health monitoring
- WebSocket endpoint: `ws://browser:53444/playwright`

### Database & Storage Pattern

- **PostgreSQL** for metadata (image records, templates)
- **S3-compatible storage** for actual image files
- Background tasks for async uploads (images return immediately with ID)
- Soft deletion pattern for images

### API Conventions

Two main image generation endpoints:

- `POST /v1/image/html` - Raw HTML input (Content-Type: text/html)
- `POST /v1/image/template` - Template-based with variables

Template system uses `{{variable}}` syntax processed by `@ojo/libs/Template.renderTemplate()`

## Critical Dependencies

### Browser Automation Stack

- **Playwright-core** (not full Playwright) for smaller Docker images
- Chromium runs in Docker with `--headless=new` flag
- Custom security controls: block dialogs, popups, downloads, service workers

### Image Processing

- **Sharp** for image transformations and format conversion
- URL-based transform API: `/transform/w-800,h-600,fmt-webp/https://example.com/image.png`

### Database ORM

- **Drizzle ORM** with TypeScript schema definitions
- Migrations auto-run on server startup via `initializer.ts`
- Queries exported from `@ojo/database/queries`

## Development Workflow

### Local Setup

```bash
# 1. Start dependencies
docker-compose -f docker-compose-dev.yml up postgres browser -d

# 2. Set up environment
cp apps/server/.env.example apps/server/.env.development
# Configure DATABASE_URL, BROWSER_ENDPOINTS, S3 credentials

# 3. Start development server
pnpm dev
```

### Environment Variables (Required)

- `ADMIN_TOKEN` - API authentication
- `DATABASE_URL` - PostgreSQL connection
- `BROWSER_ENDPOINTS` - Browser service WebSocket URL
- `BLOB_STORAGE_*` - S3 configuration (endpoint, keys, bucket)

### Testing & Building

- `pnpm test` - Run Vitest unit tests
- `pnpm build` - Build all packages with Turbo
- `pnpm lint` - ESLint across workspace

## Common Debugging Points

### Browser Connection Issues

Check browser health at `/health` endpoint and verify WebSocket connectivity. Browser service logs show Playwright launch configuration.

### S3 Storage Problems

Verify bucket permissions (public read required) and endpoint URLs. Images are uploaded async - check background task logs.

### Template Processing

Templates use `@ojo/libs/Template.renderTemplate()` - variables must match template schema exactly.

### TypeScript Path Aliases

Server uses `@/` prefix for internal imports via `tsconfig-paths` and `tsc-alias`.

## File Generation Conventions

### New Routes

Add to `apps/server/src/routes/` and register in `server.ts`

- Use `handler()` wrapper for error handling
- Include Swagger docs via JSDoc comments
- Apply `adminAuthorizer` middleware

### Database Changes

Add schema to `packages/database/src/schema/`

- Create migration files in `drizzle/migrations/`
- Export queries from `packages/database/src/queries/`

### Shared Libraries

Add to `packages/libs/src/` for cross-package utilities

- Export from `packages/libs/src/index.ts`
- Build with TypeScript, consumed by apps

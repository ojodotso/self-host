import 'dotenv/config';

import path from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const connectionString = process.env.DATABASE_URL as string;

const migrationClient = postgres(connectionString, { max: 1 });
const db = drizzle(migrationClient);

export async function runMigrations() {
  const migrationsPath = path.join(__dirname, 'migrations');

  console.log('Running migrations from the following path:', migrationsPath);

  await migrate(db, {
    migrationsFolder: migrationsPath,
  });

  await migrationClient.end();
  console.log('Migrations completed.');
}

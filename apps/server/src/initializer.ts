import { config } from 'dotenv';
config({
  path: process.env.NODE_ENV === 'production' ? '.env' : '.env.development',
});

import { runMigrations } from '@ojo/database';

runMigrations();

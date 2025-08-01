import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    typecheck: {
      tsconfig: path.resolve(__dirname, './tsconfig.json'),
    },
  },
});

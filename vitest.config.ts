import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'supabase/functions/**/*.test.ts', 'app/**/*.test.ts', 'tests/**/*.test.ts'],
    // Playwright specs live in e2e/ and are run by Playwright, not Vitest.
    exclude: ['e2e/**', 'node_modules/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});

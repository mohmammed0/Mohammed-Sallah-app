import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@sallah/domain': fileURLToPath(new URL('./packages/domain/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 10_000,
    environment: 'node',
  },
});

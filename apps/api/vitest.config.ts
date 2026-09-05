import { defineConfig } from 'vitest/config';

// Enable with: npm install -D vitest supertest @types/supertest
export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    hookTimeout: 30_000,
    testTimeout: 30_000,
    fileParallelism: false, // isolation tests share seeded tenants; run serially
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'apps-script/**/*.test.ts', 'cloudflare-worker/**/*.test.ts'],
  },
});

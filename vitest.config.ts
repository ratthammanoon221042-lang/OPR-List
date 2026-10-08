import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('test-build') },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'apps-script/**/*.test.ts', 'cloudflare-worker/**/*.test.ts'],
  },
});

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (p: string) => fileURLToPath(new URL(`./packages/${p}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@crishub-meta-mcp/core': src('core'),
      '@crishub-meta-mcp/facebook': src('meta-facebook'),
      '@crishub-meta-mcp/marketing': src('meta-marketing'),
      '@crishub-meta-mcp/server': src('mcp-server'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    // CI must run fully offline: no test may reach a real network host.
    env: { META_MODE: 'mock' },
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**'],
      reporter: ['text', 'lcov'],
    },
  },
});

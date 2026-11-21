import { readFileSync } from 'node:fs';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

/**
 * Coverage is held at 100% for every metric, and the files it leaves out
 * come from coverage-policy.json alone (docs/coverage-policy.md):
 * scripts/check-coverage-policy.mjs fails CI if this file grows its own list.
 */
const policy = JSON.parse(readFileSync(new URL('./coverage-policy.json', import.meta.url), 'utf8')) as {
  typescript: { glob: string }[];
};

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Pure modules run in Node, components and DOM code (`.test.tsx`) in jsdom
      projects: [
        {
          extends: true,
          test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' },
        },
        {
          extends: true,
          test: {
            name: 'dom',
            include: ['src/**/*.test.tsx'],
            environment: 'jsdom',
            setupFiles: ['src/test/setupDom.ts'],
          },
        },
      ],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: policy.typescript.map(entry => entry.glob),
        thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
        reporter: ['text', 'html', 'lcov'],
      },
    },
  })
);

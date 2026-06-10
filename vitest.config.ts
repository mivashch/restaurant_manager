import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['apps/web/src/__tests__/setup.ts'],
    css: false,
    include: [
      'api/__tests__/**/*.test.ts',
      'packages/shared/__tests__/**/*.test.ts',
      'apps/web/src/**/__tests__/**/*.test.ts',
      'apps/web/src/**/__tests__/**/*.test.tsx',
    ],
    exclude: ['node_modules'],
  },
})

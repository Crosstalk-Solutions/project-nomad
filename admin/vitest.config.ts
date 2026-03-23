import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: [
      'inertia/__tests__/**/*.test.ts',
      'tests/unit/**/*.test.ts',
    ],
    globals: true,
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, 'inertia'),
      '#app': resolve(__dirname, 'app'),
      '#validators': resolve(__dirname, 'app/validators'),
    },
  },
})

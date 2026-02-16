import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', 'tests', '*.config.*'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src/client'),
      '@shared': resolve(__dirname, './src/shared'),
    },
  },
})

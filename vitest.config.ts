import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Test-only config. The production vite.config.ts is not touched.
// `envDir` points at an empty folder so real .env / .env.local files (which may hold
// secrets) are never loaded into tests; the values below are harmless placeholders.
export default defineConfig({
  plugins: [react()],
  envDir: './tests/env',
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    css: false,
    restoreMocks: false,
    testTimeout: 15000,
    env: {
      VITE_SUPABASE_URL: 'https://example.invalid',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      VITE_ENABLE_FIXTURES: 'false',
    },
  },
})

import { defineConfig } from 'vitest/config'

/** Run package-local tests without importing DSH runtime values. */
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
  },
})

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Vitest reuses the existing Vite 5 configuration rather than introducing a
// second build pipeline. Vite itself is intentionally left at ^5.3.1 - vitest 2
// is the newest line that still supports vite 5 (vitest 5 requires vite ^6.4+).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Component styles are Tailwind class names; processing CSS in jsdom adds
    // runtime cost without asserting anything about behaviour.
    css: false,
    restoreMocks: true,
  },
})

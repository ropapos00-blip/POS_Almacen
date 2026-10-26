import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // Permite usar describe/it/expect sin importar explícitamente desde vitest
    globals: true,
    // Usa el tsconfig dedicado para tests (incluye tipos de vitest)
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
})

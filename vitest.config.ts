import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // As travas da leitura diária do meta vivem em `scripts/meta`, fora de
    // `src`, e são justamente o que não pode quebrar sem ninguém ver: quando
    // elas falham, o site publica opinião inventada.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.mjs'],
  },
});

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
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'scripts/**/*.test.mjs',
      // O pipeline do catálogo abre Pull Request sozinho. O que decide o que
      // ele pode aplicar e o que precisa de gente vive em `scripts/catalog`,
      // e é a última coisa que pode quebrar sem ninguém ver.
      'scripts/**/*.test.ts',
    ],
  },
});

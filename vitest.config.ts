import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@d4es/schema': r('./packages/schema/src/index.ts'),
      '@d4es/i18n': r('./packages/i18n-d4/src/index.ts'),
    },
  },
  test: {
    // La web tambien: sus funciones puras (el meta, el evaluador de objetos) son logica
    // de verdad y se prueban igual que las del pipeline.
    include: ['packages/**/*.test.ts', 'apps/scraper/**/*.test.ts', 'apps/web/src/lib/**/*.test.ts'],
    environment: 'node',
  },
});

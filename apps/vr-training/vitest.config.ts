import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/training/**/*.test.ts', 'src/ui/**/*.test.ts', 'scripts/*.test.mjs'] },
});

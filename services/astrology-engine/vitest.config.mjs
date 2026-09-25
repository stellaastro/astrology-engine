// Standalone use (npm test in this directory, or the published repository).
// Inside Stella's monorepo the root vitest config picks these tests up too.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.spec.ts'] },
});

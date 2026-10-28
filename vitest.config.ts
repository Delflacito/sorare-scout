import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false,
  },
});

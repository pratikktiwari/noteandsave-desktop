import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['sql.js', 'electron', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
    },
  },
  resolve: {
    conditions: ['node'],
  },
});

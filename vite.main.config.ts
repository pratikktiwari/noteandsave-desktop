import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['sql.js', 'electron', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/sql.js/dist/sql-wasm.wasm',
          dest: '.',
        },
      ],
    }),
  ],
  resolve: {
    conditions: ['node'],
  },
});

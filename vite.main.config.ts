import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      // pg-native is an optional dependency, map it to empty module
      'pg-native': 'data:text/javascript,export default {}',
    },
  },
  build: {
    rollupOptions: {
      // Externalize native / problematic modules so that Electron can load them via Node at runtime
      external: [
        'pg-native',
        'ssh2',
        'keytar',
      ],
    },
  },
  optimizeDeps: {
    // Exclude from dependency optimization so Vite doesn't try to pre-bundle these
    exclude: [
      'pg-native',
      'ssh2',
      'keytar',
    ],
  },
});

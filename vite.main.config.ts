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
      external: ['pg-native'], // Externalize pg-native
    },
  },
  optimizeDeps: {
    exclude: ['pg-native'], // Exclude from dependency optimization
  },
});

import path from 'path';
import { defineConfig } from 'vite';

// Dynamic import avoids ESM/require conflict when Electron Forge bundles this config
export default defineConfig(async () => {
  const vue = (await import('@vitejs/plugin-vue')).default;

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});

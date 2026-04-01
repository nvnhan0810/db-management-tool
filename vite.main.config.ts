import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // Force-bundle certain dependencies into the main process build.
    // Forge+Vite may not ship `node_modules` inside `app.asar`, so runtime `require('mysql2/...')`
    // would fail in packaged builds unless bundled.
    ssr: {
      noExternal: ['mysql2'],
    },
    build: {
      rollupOptions: {
        external: ['pg-native', 'ssh2', 'keytar', 'electron'],
      },
    },
    resolve: {
      alias: {
        'pg-native': 'data:text/javascript,export default {}',
        '@': path.resolve(__dirname, './src'),
      },
    },
    optimizeDeps: {
      exclude: ['pg-native', 'ssh2', 'keytar'],
    },
    define: {
      'process.env.SERVICE_NAME': JSON.stringify(env.SERVICE_NAME || 'db-management-tool'),
      'process.env.MASTER_KEY_ACCOUNT': JSON.stringify(env.MASTER_KEY_ACCOUNT || 'master-key'),
      'process.env.NODE_ENV': JSON.stringify(env.NODE_ENV || mode),
    },
  };
});

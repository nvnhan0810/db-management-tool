import path from 'path';
import { defineConfig, loadEnv } from 'vite';

// https://vitejs.dev/config
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    build: {
      rollupOptions: {
        // Externalize native / problematic modules so that Electron can load them via Node at runtime
        external: [
          'pg-native',
          'ssh2',
          'keytar',
          'electron',
        ],
      },
    },
    resolve: {
      alias: {
        // pg-native is an optional dependency, map it to empty module
        'pg-native': 'data:text/javascript,export default {}',
        // Add @ alias for src directory
        '@': path.resolve(__dirname, './src'),
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
    // Define env variables that will be available in main process
    define: {
      'process.env.SERVICE_NAME': JSON.stringify(env.SERVICE_NAME || 'db-client-app'),
      'process.env.MASTER_KEY_ACCOUNT': JSON.stringify(env.MASTER_KEY_ACCOUNT || 'master-key'),
      'process.env.NODE_ENV': JSON.stringify(env.NODE_ENV || mode),
    },
  };
});

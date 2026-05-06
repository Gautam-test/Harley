import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5181,
    host: true,
    allowedHosts: [
      'localhost',
      '.localhost',
      'harleydavidson.ciadmin.in',
      '.ciadmin.in',
    ],
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd())],
    },
    proxy: {
      '/api': { target: 'http://localhost:4001', changeOrigin: true },
    },
  },
});

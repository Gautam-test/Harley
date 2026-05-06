import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    // Bind on every interface so nginx (or any reverse proxy on the same
    // box) can reach the dev server on localhost without DNS games.
    host: true,
    // Vite 5.4+ blocks requests whose Host header isn't in this list as a
    // DNS-rebinding defence. Add the production-domain entry that fronts
    // this dev server, plus the dev defaults so local browsers still work.
    allowedHosts: [
      'localhost',
      '.localhost',
      'harleydavidson.ciadmin.in',
      '.ciadmin.in',
    ],
    fs: {
      // pnpm workspace — the entry app lives under apps/web-buyer but its
      // imports reach into packages/ui, packages/types, etc. Vite normally
      // auto-detects the workspace root, but on some Linux server setups
      // (symlinked /var/www, non-standard pnpm layouts) the auto-detect
      // misfires and /@fs requests for shared packages 500 with EACCES or
      // a path-not-allowed error. Pinning the allow list to the resolved
      // workspace root makes the dev server portable.
      allow: [searchForWorkspaceRoot(process.cwd())],
    },
    proxy: {
      '/api': { target: 'http://localhost:4001', changeOrigin: true },
      '/sitemap.xml': { target: 'http://localhost:4001', changeOrigin: true },
      '/robots.txt': { target: 'http://localhost:4001', changeOrigin: true },
    },
  },
});

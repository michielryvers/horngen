import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'esnext',
    copyPublicDir: true,
    rollupOptions: {
      external: ['/opencascade.wasm.js', '/opencascade.wasm.wasm'],
      output: {
        // Don't hash the opencascade files
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'opencascade.wasm.js' || assetInfo.name === 'opencascade.wasm.wasm') {
            return '[name][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  },
  publicDir: 'public',
  assetsInclude: ['**/*.wasm']
});

.exports = {
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: false,
    open: false,
    cors: true,
    hmr: { // Added closing bracket
      overlay: true
    } // Added closing bracket
  },
  preview: {
    port: 3000,
    host: '0.0.0.0'
  },
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'lodash'], // Added missing references
          client: ['vue-router', 'vue'] // Added missing references
        }
      }
    }
  }
};
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    cssMinify: 'lightningcss',
    outDir: 'dist',
    emptyOutDir: true,
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base is './' so the built site works when served from a subpath
// (GitHub Pages project sites live at /<repo-name>/)
export default defineConfig({
  plugins: [react()],
  base: './',
});

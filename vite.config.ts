import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

// This personal app runs in Node on the user's Mac so it can save locally.
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    host: '127.0.0.1',
    port: 4319,
    strictPort: true,
    watch: { useFsEvents: false, usePolling: true },
  },
  plugins: [vinext(), sites()],
});

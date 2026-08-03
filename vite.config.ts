import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// GitHub Pages serves this project from the repository subpath `/esdm/`.
// Keep the root base for local development and use the repository path in CI.
export default defineConfig({ plugins: [react()], base: process.env.GITHUB_ACTIONS ? '/esdm/' : '/' });

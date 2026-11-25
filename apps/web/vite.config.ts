import { defineConfig } from 'vite';

// `base: './'` keeps the build portable: it works at
// https://<user>.github.io/dodgeball-simulator/ and from any subpath.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});

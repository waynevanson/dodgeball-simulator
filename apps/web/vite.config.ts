import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import { cargo } from '@waynevanson/unplugin-cargo/vite';

// `base: './'` keeps the build portable: it works at
// https://<user>.github.io/dodgeball-simulator/ and from any subpath.
//
// `cargo()` compiles `crates/sim` to wasm whenever `crates/sim/src/lib.rs` is
// imported, generates the wasm-bindgen glue and `.d.ts`, and watches every
// `.rs` file in the crate for rebuilds.
export default defineConfig({
  base: './',
  plugins: [
    cargo({
      pattern: 'src/lib.rs',
      features: ['wasm'],
    }),
    wasm(),
  ],
  server: {
    fs: {
      // The Rust crate lives above the Vite root.
      allow: ['../..'],
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});

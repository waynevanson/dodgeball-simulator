The `deploy.yml` workflow installs Rust, builds the wasm core and the Vite
site, then publishes `apps/web/dist` to GitHub Pages. Enable it in **Settings →
Pages → Build and deployment → Source: GitHub Actions**, then push to `main`.

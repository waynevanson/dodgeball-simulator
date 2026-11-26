The `deploy.yml` workflow installs Rust and pnpm, runs the Rust tests, then
`pnpm build` (which builds the wasm client once and bundles the Vite site) and
publishes `apps/web/dist` to GitHub Pages. Enable it in **Settings → Pages →
Build and deployment → Source: GitHub Actions**, then push to `main`.

The `desktop.yml` workflow builds and packages the native client for Linux,
macOS and Windows on version tags or manual dispatch.

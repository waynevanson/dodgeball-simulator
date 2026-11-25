# Rust/Bevy migration status — paused

Last updated: after the first full browser/native render pass.

## Goal

Move all game and interface rendering out of Canvas 2D/TypeScript into a shared
Rust Bevy client with two targets:

- browser: `wasm32-unknown-unknown` + Bevy WebGL2;
- desktop: native Bevy + wgpu.

The authoritative simulation remains in `crates/sim`; the server remains the
SpacetimeDB module in `crates/server`.

---

## Completed

### Workspace / dependencies

- Added `crates/client-bindings` with Rust client bindings generated from the
  SpacetimeDB module (CLI 2.16.3).
- Added `crates/client` — shared Bevy app.
- Added `crates/client-desktop` — native binary.
- Added `crates/client-web` — wasm `cdylib` entry.
- Added `default-members = ["crates/sim", "crates/server"]`.
- Bumped SpacetimeDB module crate and Rust client SDK to `=2.16.3`.
- Added native build dependencies to `flake.nix`:
  `pkg-config`, `wayland`, `libxkbcommon`, `openssl`, `systemd`.
- Updated the Rust workspace release profile to remove the previous
  `strip = "symbols"` wasm-bindgen warning.
- Updated `pnpm-lock.yaml`; removed the old web `spacetimedb` npm dependency.

### Simulation DTOs

- `crates/sim/src/snapshot.rs` now derives `Clone`, `Serialize`, `Deserialize`.
- `ParticleOut.kind` and `DifficultyOut.label` are owned `String`s, required for
  deserializing frames in Rust.
- Server JSON shape remains compatible.

### Shared Bevy client (`crates/client`)

- `lib.rs` — app bootstrap, native/web window setup, system ordering.
- `consts.rs` — view/court/team constants.
- `color.rs` — CSS colour parser for simulation particle/floater colours.
- `model.rs` — placeholder frame, interpolation, local `isYou` decoration,
  connection/UI state.
- `input.rs` — Bevy keyboard/mouse/touch → `InputFrame`; touch stick/buttons;
  one-shot edge accumulation.
- `net.rs` — SpacetimeDB via `bevy_stdb`:
  - frame/participant/game-event subscriptions;
  - input reducer throttled at 50 ms;
  - participant owner/team/spectator tracking;
  - reconnect support;
  - local token/name persistence through `platform.rs`.
- `platform.rs` — browser `localStorage` / native config-file persistence.
- `render/textures.rs` — procedural 1280×720 court, player/ball gradients,
  particles, rings and glow; no external art assets.
- `render/world.rs` — court, stable player/ball entities, trails, glasses, charge
  arcs, catch rings, eliminated X, cursor.
- `render/effects.rs` — pooled particles/floaters, camera shake.
- `render/mod.rs` — fixed 1280×720 camera.
- `ui/mod.rs` — all UI in Bevy UI: HUD, roster/score, menu, pause, results,
  rules, top bar, touch controls, portrait/rotate overlay, flash overlay,
  name editing.
- Enabled required Bevy features: `keyboard`, `mouse`, `touch`, `png`,
  `bevy_audio` is **not** enabled (see remaining work).

### Browser shell

- `apps/web/src/main.ts` now only initializes wasm and calls
  `start(uri, db, name, muted, autostart)`.
- Deleted the old TypeScript game renderer/UI/input/online code:
  `apps/web/src/game/` and `apps/web/src/module_bindings/`.
- Replaced `apps/web` package scripts with wasm build + Vite.
- Added `scripts/build-web-wasm.sh`:
  - `cargo build -p dodgeball-client-web --target wasm32-unknown-unknown --release`
  - `wasm-bindgen 0.2.130`
  - optional `wasm-opt -Oz`.
- Added `apps/web/src/wasm` to `.gitignore`; build generates it.
- Vite production build works and serves the wasm client.

### Desktop shell

- `crates/client-desktop` uses the shared client.
- Environment configuration:
  - `DODGEBALL_SPACETIME_URI` / `SPACETIME_URI`
  - `DODGEBALL_SPACETIME_DB` / `SPACETIME_DB`
  - `DODGEBALL_PLAYER_NAME`
  - `DODGEBALL_MUTED`
  - `DODGEBALL_AUTOSTART`
- `DODGEBALL_SCREENSHOT=/path.png` saves a test screenshot after startup.

### UI/layout bugs fixed

- Menu content was positioned relative to the menu panel but used screen-space
  Y values. It is now panel-relative; the START MATCH button is at the intended
  location.
- The missing Bevy `keyboard`, `mouse`, and `touch` features were added. This
  was required for mouse/touch UI activation and keyboard input.
- `handle_actions` now receives the actual `StdbConnection` resource.
- UI button activation has been verified through headless Chromium CDP: clicking
  START MATCH emits `UiAction::StartMatch`, sends the reducer, and the server
  transitions into countdown/playing.
- Player numbers are now white with a dark text shadow and a higher z value, so
  they are readable against the team-coloured bodies.
- Trails are pooled sprites rather than outlined gizmo circles, matching the
  original filled-trail look better.
- Removed temporary web-only UI/frame debug dumps. Intentional debug aids
  remain: `DODGEBALL_AUTOSTART`, `DODGEBALL_SCREENSHOT`, `?autostart=1`,
  `RUST_LOG=debug`.

### Verification performed

- `cargo test -p dodgeball-sim -p dodgeball-server` — all tests pass.
- `cargo check -p dodgeball-client -p dodgeball-client-desktop` — passes.
- `cargo check -p dodgeball-client-web --target wasm32-unknown-unknown` —
  passes.
- The new client crates are formatted. Existing simulation files were left in their prior formatting to keep this migration diff focused.
- `pnpm typecheck` — passes.
- Native desktop launched against a local SpacetimeDB server and rendered a
  playing match (software Vulkan/llvmpipe in this environment).
- Browser launched headlessly in Chromium against the local server and rendered
  a playing match.
- Browser CDP click test successfully started a match.
- Latest production wasm build:
  - `apps/web/src/wasm/dodgeball_client_bg.wasm`: ~20.3 MB
  - Vite gzip report: ~6.3 MB
  - Vite JS bundle: ~56 KB.
- Latest successful screenshots:
  - native playing match: `/tmp/game4.png`;
  - browser playing match: `/tmp/web_click_final.png`.

### CI / docs

- `.github/workflows/deploy.yml` now installs `wasm-bindgen-cli` 0.2.130.
- Added `.github/workflows/desktop.yml` matrix for Linux/Windows/macOS native
  builds.
- README rewritten for Rust/Bevy, browser + desktop, 2.16.3, and new commands.
- Added this status file.

---

## Remaining work

### 1. Audio (largest feature gap)

The old TypeScript WebAudio synth was deleted with the Canvas client. The Bevy
client currently has **no sound**. The top-bar sound button toggles a resource
but there is no output.

Options:

- **Bevy audio + generated WAVs (recommended):**
  - enable Bevy `bevy_audio` + `wav`;
  - add `pkgs.alsa-lib` to `flake.nix` / Linux CI;
  - synthesize small WAV buffers at startup for `throw`, `hit`, `headshot`,
    `catch`, `block`, `pickup`, `bounce`, `dash`, `beep`, `whistle`,
    `roundWin`, `roundLose`, `matchWin`, `matchLose`, `ui`;
  - parse `game_event.data` as `SfxEvent` and spawn `AudioPlayer` entities;
  - apply mute through a global volume/resource;
  - browser audio unlock on first pointer/key gesture;
  - decide whether to keep browser `SpeechSynthesis` for HEADSHOT or ship a
    short voice clip.
- Or a platform-specific audio bridge:
  - web: JS WebAudio;
  - desktop: `rodio`/`cpal`.
  This avoids Bevy audio but creates two implementations.

Also update README/top-bar once sound exists or hide/remove the sound control.

### 2. Real-device / real-GPU testing

The current verification used:

- headless Chromium + SwiftShader WebGL2;
- native Bevy with llvmpipe software Vulkan.

Still needed:

- real Chrome/Firefox/Safari on a physical GPU;
- Safari/iOS and Android Chrome touch/WebGL2;
- native desktop with real Vulkan/Metal/DX12 and real keyboard/mouse;
- confirm window resize, device pixel ratio and letterboxing on all targets.

### 3. Input / UI coverage

- Native mouse activation was not fully validated because X11 injection through
  `xdotool` did not deliver button presses in this environment. Browser CDP
  click is verified.
- Test keyboard movement, dash/catch, name editing, Enter/Escape, and mute via a
  real keyboard.
- Test touch stick + simultaneous throw/dash/catch on a real touch device.
- Test browser fullscreen button; it currently toggles Bevy `WindowMode`, which
  may not be the browser Fullscreen API.
- Test IME/text composition for player names.
- Touch controls are visual only; hit testing is in `input.rs` using design-space
  coordinates. Verify under non-16:9 aspect ratios.

### 4. Build / CI / release cleanup

- Verify `.github/workflows/deploy.yml` end-to-end. It currently runs
  `pnpm typecheck` (which may trigger the wasm build through `pretypecheck`) and
  then `pnpm build` (which builds wasm again). This can be optimized to build
  wasm once.
- Verify `.github/workflows/desktop.yml` on all three runners. Linux needs the
  listed X11/Wayland/OpenSSL/udev packages; native runtime still needs GPU
  drivers on user machines.
- Decide on desktop packaging (icons, `.desktop`, macOS `.app`, Windows
  installer/console behavior). The workflow currently uploads bare binaries.
- Pin/verify the generated Rust bindings workflow:
  - `pnpm module:generate` now uses `--lang rust` and renames `mod.rs` to
    `lib.rs`;
  - `spacetime.json` no longer lists TypeScript codegen;
  - test `spacetime dev` after schema/reducer changes.
- Check `pnpm check` with the new `rust:check:wasm` package selection.
- Consider a separate client release profile to keep native Bevy optimized while
  using `opt-level="z"` for wasm.
- Remove/replace stale `docs/screenshot.png` (still an old Canvas screenshot).

### 5. Code quality / cleanup

- `ClientState.dirty_settings` and `UiAction::SubmitName` are unused.
- `TextKind::BlueName` / `RedName` are not currently spawned.
- Some UI text is approximate; compare the Bevy HUD/menu against the old Canvas
  screenshot and refine spacing/fonts/colors if desired.
- Consider moving presentation constants and team palettes into a shared
  presentation crate if other clients/tools need them.
- Add unit tests for:
  - CSS colour parser;
  - snapshot interpolation/blending;
  - input edge accumulation;
  - screen/layout calculations.
- Add committed browser smoke test instead of relying on ad-hoc `/tmp` CDP
  scripts.
- Add a native headless/screenshot smoke test if possible.

### 6. Performance / size

- 20.3 MB wasm / 6.3 MB gzip is large. Already enabled only the needed Bevy
  features, but further pruning may be possible:
  - inspect `cargo tree -e features -p dodgeball-client`;
  - consider removing gizmos if dynamic outlines are moved to sprites;
  - test `wasm-opt` flags and `opt-level="z"` for the client;
  - measure startup time and first-frame time on mobile.
- Pool sizes: 512 particles, 320 trail sprites, 32 floater texts. Measure on
  low-end devices.

### 7. Server / environment

- The local test server was installed to `/tmp/spacetime` with
  `/tmp/spacetime/spacetime --root-dir=/tmp/spacetime`.
- The published local module is at `http://localhost:3000`, database
  `dodgeball-simulator`, module version 2.16.3.
- Maincloud deployment still needs its own published module and repository
  variables.
- Native runtime on NixOS may need `LD_LIBRARY_PATH`/driver setup; this was
  handled manually during testing but should be documented or solved with a
  wrapper.

---

## Useful commands from the working session

```bash
# Native build/check (inside Nix dependency shell)
cargo build -p dodgeball-client-desktop
cargo check -p dodgeball-client
cargo test -p dodgeball-sim -p dodgeball-server

# Wasm check
cargo check -p dodgeball-client-web --target wasm32-unknown-unknown

# Browser wasm + Vite
WASM_BINDGEN=/tmp/wasm-bindgen/bin/wasm-bindgen bash scripts/build-web-wasm.sh
(cd apps/web && pnpm exec vite build)
(cd apps/web && pnpm exec vite preview --host 127.0.0.1 --port 4173)

# Native smoke test
DODGEBALL_AUTOSTART=1 DODGEBALL_SCREENSHOT=/tmp/game.png \
  cargo run -p dodgeball-client-desktop

# Browser smoke test
# chromium --headless ... 'http://127.0.0.1:4173/?autostart=1'
```

## Definition of done still to reach

- Sound is restored or intentionally removed from UI/README.
- Real browser + real desktop input/touch/fullscreen/name editing verified.
- CI browser and desktop builds are green.
- No stale Canvas/TypeScript references or dead generated artifacts remain.
- A human can run both targets from a clean checkout using documented commands.

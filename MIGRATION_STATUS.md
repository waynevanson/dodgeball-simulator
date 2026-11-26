# Rust/Bevy migration status — paused

Last updated: after restoring generated sound effects and migrating the dev
shell to devenv.

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
- Added native build dependencies to the dev shell (`devenv.nix`):
  `pkg-config`, `wayland`, `libxkbcommon`, `openssl`, `systemd`.
- Updated the Rust workspace release profile to remove the previous
  `strip = "symbols"` wasm-bindgen warning.
- Updated `pnpm-lock.yaml`; removed the old web `spacetimedb` npm dependency.

### Dev shell / devenv

- Replaced the hand-written `pkgs.mkShell` with `devenv.lib.mkShell`; the shell
  configuration lives in `devenv.nix` and `nix/spacetime.nix`.
- `.envrc` uses `use flake . --no-pure-eval` because devenv resolves
  `devenv.root` from `$PWD`.
- `services.spacetime` installs the pinned SpacetimeDB CLI/server (2.16.3) and
  `devenv up` starts a local server on port 3000.
- Restored `wasm-bindgen-cli` 0.2.130 to the dev shell (it had been dropped in
  an earlier commit), so `pnpm web:wasm`, `pnpm dev:client` and `pnpm build` work
  from a clean shell again.
- Added `alsa-lib` on Linux for native Bevy audio; the desktop CI installs
  `libasound2-dev` for the same reason.
- Updated the stale flake description that still mentioned a TypeScript canvas
  presentation.
- `scripts/build-web-wasm.sh` now maps `PROFILE=dev` to Cargo's `debug/`
  directory and no longer requires a manually supplied `WASM_BINDGEN` path when
  run inside the dev shell.

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

### Audio

- Added `crates/client/src/audio/`:
  - `synth.rs` renders tones, filtered hiss and exponential envelopes into mono
    16-bit 44.1 kHz WAV buffers, reproducing the old WebAudio synth;
  - `voices.rs` defines every game voice from `synth.rs` and pre-renders four
    loudness variants each for throws and bounces, plus both beep pitches;
  - `mod.rs` owns the `SoundBank` resource and maps each `SfxEvent` to an
    `AudioPlayer` spawned with `PlaybackSettings::DESPAWN`.
- Enabled Bevy `bevy_audio` + `wav` features; no audio files are shipped.
- `net::read_game_events` now deserialises `game_event.data` as `SfxEvent` and
  plays it, keeping the existing `DODGEBALL_LOG_EVENTS` debug log.
- UI button presses play the `ui` clip; toggling mute persists through
  `platform.rs` and skips all playback, including the headshot call.
- Browser builds keep the spoken "HEADSHOT" via `speechSynthesis`; native builds
  play the synth scream only.
- `apps/web/src/main.ts` tracks every `AudioContext` created by the wasm/rodio
  backend and resumes suspended contexts on pointer/key gestures, because
  browsers block audio until the first interaction.

### Client prediction / netcode

- Added `crates/client/src/predict.rs`:
  - local player and owned-ball prediction using the shared `dodgeball-sim`
    `step_player` / `step_ball` at fixed 120 Hz substeps;
  - input timeline and replay of inputs newer than the server's acknowledgement;
  - soft visual correction for small errors and snapping for deaths/respawns;
  - local throw prediction, including ball flight and trail, reconciled against
    the authoritative ball.
- `PlayerOut` now carries `lastInputSeq`, filled by the server from the private
  `player_input` row when it writes `frame_state`.
- Snapshot interpolation extrapolates briefly past the newest sample instead of
  freezing when a packet is late.
- Added unit tests for edge consumption and local movement prediction.

### Browser shell

- `apps/web/src/main.ts` loads the wasm glue dynamically after installing the
  audio-context tracking patch, then calls
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
  `DODGEBALL_LOG_EVENTS`, `window.__dodgeball`, `RUST_LOG=debug`.

### Verification performed

- `cargo test --workspace` — all tests pass, including 8 client tests for the
  synth, voice bank and input prediction.
- `cargo check -p dodgeball-client-web --target wasm32-unknown-unknown` —
  passes with Bevy audio enabled.
- `cargo check -p dodgeball-client -p dodgeball-client-desktop` — passes.
- `apps/web` `tsc --noEmit` — passes once the wasm glue exists (the dev shell
  now provides the matching `wasm-bindgen`).
- Dev-profile wasm build + Vite + headless Chromium rendered the menu with the
  audio plugin initialised (`/tmp/menu-audio.png`). No SpacetimeDB server was
  running, so the connection showed the expected `ONLINE | ERROR` state.
- Native builds on this machine needed `NIX_CFLAGS_LINK=` cleared because the
  host's nix-ld `/usr/lib` symlinks point at glibc 2.42 while the unstable
  `alsa-lib` needs 2.44. This is a local NixOS environment quirk, not a repo
  change.
- `cargo test -p dodgeball-sim -p dodgeball-server` — all tests pass.
- The new client crates are formatted. Existing simulation files were left in their prior formatting to keep this migration diff focused.
- `pnpm typecheck` — passes with the generated wasm glue present.
- Native desktop launched against a local SpacetimeDB server and rendered a
  playing match (software Vulkan/llvmpipe in this environment).
- Browser launched headlessly in Chromium against the local server and rendered
  a playing match.
- Browser CDP click test successfully started a match.
- Latest production wasm build:
  - `apps/web/src/wasm/dodgeball_client_bg.wasm`: ~20.7 MB
  - Vite gzip report: ~6.5 MB
  - Vite JS bundle: ~58 KB.
- Audio added roughly 0.4 MB to the wasm bundle and 0.2 MB gzip
  (`bevy_audio`, `rodio`, `hound`, `cpal`).
- Latest successful screenshots:
  - native playing match: `/tmp/game4.png`;
  - browser playing match: `/tmp/web_click_final.png`;
  - browser playing match with audio enabled: `/tmp/game-audio-playing.png`;
  - `docs/screenshot.png` replaced with the 1280x720 Bevy capture.
- Browser CDP gesture test against a local server: `AudioContext.state` was
  `suspended` at startup and became `running` after a synthetic click, while the
  playing match rendered normally.

### CI / docs

- `.github/workflows/deploy.yml` now installs `wasm-bindgen-cli` 0.2.130.
- Added `.github/workflows/desktop.yml` matrix for Linux/Windows/macOS native
  builds.
- README rewritten for Rust/Bevy, browser + desktop, 2.16.3, and new commands.
- Added this status file.
- Replaced the stale Canvas `docs/screenshot.png` with a current Bevy capture.

---

## Remaining work

### 1. Audio follow-ups (feature complete)

The Bevy client now synthesises and plays every `SfxEvent`. Remaining work is
verification and polish rather than implementation:

- confirm sound on a real audio device for native Linux/Windows/macOS;
- confirm the browser unlock flow in Chrome, Firefox and Safari, including a
  gesture that happens while the wasm module is still loading;
- check `speechSynthesis` availability/voice differences for HEADSHOT and
  decide whether to keep it or bundle a clip;
- consider a volume control (currently mute/on only) and whether `GlobalVolume`
  should be used for sounds already playing.

Measured wasm cost of audio: ~20.7 MB total / ~6.5 MB gzip, up from ~20.3 MB /
~6.3 MB before `bevy_audio`.

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

- 20.7 MB wasm / 6.5 MB gzip is large. Already enabled only the needed Bevy
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
PROFILE=dev bash scripts/build-web-wasm.sh   # fast local builds; default release
(cd apps/web && pnpm exec vite build)
(cd apps/web && pnpm exec vite preview --host 127.0.0.1 --port 4173)

# Native smoke test
DODGEBALL_AUTOSTART=1 DODGEBALL_SCREENSHOT=/tmp/game.png \
  cargo run -p dodgeball-client-desktop

# Browser smoke test
# chromium --headless ... 'http://127.0.0.1:4173/?autostart=1'
```

## Definition of done still to reach

- Sound is restored; real-device and browser-autoplay verification is still
  outstanding.
- Real browser + real desktop input/touch/fullscreen/name editing verified.
- CI browser and desktop builds are green.
- No stale Canvas/TypeScript references or dead generated artifacts remain.
- A human can run both targets from a clean checkout using documented commands.

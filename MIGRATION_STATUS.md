# Rust/Bevy migration status — paused

Last updated: after the input/UI, release and desktop-packaging cleanup pass.

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

### Input, UI and tests

- Browser fullscreen now uses the Fullscreen API (`documentElement.requestFullscreen`
  / `exitFullscreen`) through `platform::toggle_fullscreen`; native builds keep
  the Bevy `WindowMode` toggle.
- Player-name editing supports `Ime::Preedit`/`Ime::Commit`, enables
  `Window::ime_enabled` only while editing, and shows the in-progress
  composition. Enter/Escape/Backspace logic is a testable helper.
- Starting, resuming or returning to the menu commits an in-progress name and
  sends `set_name`, matching the old client's behaviour.
- Input design coordinates now subtract the letterbox offset and divide by the
  uniform scale, so mouse aim and touch hit testing agree with the fixed 1280x720
  camera on non-16:9 surfaces.
- Added tests for:
  - CSS colour parsing and malformed fallbacks;
  - snapshot blend/extrapolation, `clean_name` and `isYou` decoration;
  - keyboard movement/dash/catch mapping and edit-mode suppression;
  - Enter/Escape/Backspace/IME name editing through real Bevy messages;
  - touch hit testing, stick clamping and letterboxed coordinate mapping;
  - UI clock formatting.

### Build / release / packaging

- `pnpm build` (and the deploy workflow) now builds wasm once; the separate
  `pnpm typecheck` step and the double build are gone.
- Added a `wasm-release` Cargo profile (`inherits = "release"`, `opt-level =
  "z"`) and made it the default for `scripts/build-web-wasm.sh`. Native release
  keeps `opt-level = "s"`.
- `scripts/build-web-wasm.sh` maps `PROFILE=dev` to `debug/` for fast local
  builds.
- `crates/client-bindings` now uses generated `src/mod.rs` as its crate root.
  `pnpm module:generate` no longer needs the `mv` step. `spacetime.json` has a
  Rust `generate` target writing to `crates/client-bindings/src`, so
  `spacetime dev` regenerates the crate in place.
- `pnpm module:generate` and `pnpm module:publish` run with `--yes`.
- Added `scripts/package-desktop.sh`: Linux tar.gz with `.desktop` + icon, an
  unsigned macOS `.app` zip, and a Windows zip. The desktop workflow uploads
  those archives instead of bare binaries.
- Windows release builds use the `windows` subsystem so no console window
  appears.
- Added committed smoke tests:
  - `pnpm smoke:browser` launches headless Chromium over CDP and verifies the
    debug handle plus audio `suspended` → `running` after a gesture;
  - `pnpm smoke:native` runs the desktop client with `DODGEBALL_SCREENSHOT` and
    checks that a PNG is produced.

### Verification performed

- `cargo test --workspace` — all tests pass. The client crate has 30 unit tests
  covering audio, keyboard/touch input, snapshot interpolation, colour parsing,
  name editing/IME and layout maths.
- `pnpm check` — typecheck, Rust tests and the wasm check pass.
- `cargo check -p dodgeball-client-web --target wasm32-unknown-unknown` —
  passes with Bevy audio and the web fullscreen/speech bindings.
- `cargo check -p dodgeball-client -p dodgeball-client-desktop` — passes.
- `apps/web` `tsc --noEmit` — passes with the generated wasm glue.
- `pnpm module:generate` — runs non-interactively, regenerates
  `crates/client-bindings/src/mod.rs` and leaves it as the crate root.
- `pnpm dev` (`spacetime dev`) — publishes to the local server, reads the
  `generate` target from `spacetime.json`, regenerates the Rust bindings in place
  and starts Vite.
- `pnpm smoke:browser` — passes against Vite: `AudioContext.state` is
  `suspended` at startup and `running` after a synthetic click.
- `pnpm smoke:native` — passes using software Vulkan/llvmpipe and writes the
  requested screenshot.
- `scripts/package-desktop.sh` — produces the Linux archive with the binary,
  `.desktop` entry, icon and README (tested with the debug binary).
- Latest production wasm (`wasm-release` + `wasm-opt -Oz`):
  - `apps/web/src/wasm/dodgeball_client_bg.wasm`: ~17.0 MB
  - Vite gzip report: ~5.3 MB
  - Vite JS bundle: ~57 KB (plus a ~3 KB loader chunk).
- The wasm-release profile cut roughly 3.7 MB from the previous release build.
- Native builds on this machine need `NIX_CFLAGS_LINK=` cleared because the
  host's nix-ld `/usr/lib` symlinks point at glibc 2.42 while the unstable
  `alsa-lib` needs 2.44. The dev shell now puts the Wayland/xkbcommon/ALSA and
  Vulkan loader libraries on `LD_LIBRARY_PATH` and exports the NixOS Vulkan ICDs.
- Historical verification: native desktop and headless browser both rendered a
  playing match against the local server; browser CDP started a match; the
  audio-enabled match screenshot is `/tmp/game-audio-playing.png` and
  `docs/screenshot.png` is a current 1280×720 Bevy capture.

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

### 2. Real-device / real-GPU testing

The current verification used:

- headless Chromium + SwiftShader WebGL2;
- native Bevy with llvmpipe software Vulkan.

Still needed:

- real Chrome/Firefox/Safari on a physical GPU;
- Safari/iOS and Android Chrome touch/WebGL2;
- native desktop with real Vulkan/Metal/DX12 and real keyboard/mouse;
- confirm window resize, device pixel ratio and letterboxing on all targets.

### 3. Real input/UI validation

The event mapping, name editing/IME, fullscreen target split and touch hit testing
now have unit/app tests. Still worth checking on real hardware:

- keyboard movement, dash/catch and mute with a physical keyboard;
- touch stick plus simultaneous throw/dash/catch on a real touch device;
- the browser Fullscreen API on Chrome/Firefox/Safari;
- IME composition in a real OS input method (the system test covers
  `Ime::Preedit`/`Ime::Commit`, not the OS integration);
- non-16:9 letterboxing on actual phones/tablets.

### 4. Release verification

- Run `.github/workflows/deploy.yml` on GitHub and confirm the single-build
  `pnpm build` flow publishes the wasm client.
- Run `.github/workflows/desktop.yml` on all three runners and confirm the
  packaged archives (Linux tar.gz, macOS `.app` zip, Windows zip).
- The macOS app is unsigned/not notarized and the Windows build is a plain zip;
  signing/installers remain a product decision.
- Maincloud still needs its own published module and repository variables.

### 5. Code quality

- Some UI text is approximate; compare the Bevy HUD/menu against the old Canvas
  screenshot and refine spacing/fonts/colors if desired.
- Consider moving presentation constants and team palettes into a shared
  presentation crate if other clients/tools need them.
- Existing simulation files were left in their prior formatting; run
  `cargo fmt --all` if the whole workspace should be normalised.

### 6. Performance / size

- 17.0 MB wasm / 5.3 MB gzip is still large. Further options:
  - inspect `cargo tree -e features -p dodgeball-client`;
  - consider removing gizmos if dynamic outlines are moved to sprites;
  - measure startup time and first-frame time on mobile.
- Pool sizes: 512 particles, 320 trail sprites, 32 floater texts. Measure on
  low-end devices.

### 7. Server / environment

- The local server is provided by devenv (`services.spacetime`, `devenv up`) on
  `http://localhost:3000`, database `dodgeball-simulator`, CLI/module 2.16.3.
  `spacetime dev` expects that server to be running.
- Maincloud deployment still needs its own published module and repository
  variables.
- Native binaries packaged outside the dev shell still need the target
  machine's GPU/audio drivers; the dev shell now supplies the Linux
  Wayland/xkbcommon/ALSA/Vulkan loader runtime libraries.

---

## Useful commands from the working session

```bash
# Native build/check (inside the devenv shell)
cargo build -p dodgeball-client-desktop
cargo check -p dodgeball-client
cargo test --workspace

# Wasm check and browser build
cargo check -p dodgeball-client-web --target wasm32-unknown-unknown
pnpm web:wasm                 # wasm-release profile, size optimised
PROFILE=dev pnpm web:wasm     # fast local build
pnpm build

# Module and bindings
pnpm module:build
pnpm module:generate          # writes crates/client-bindings/src/mod.rs

# Local development (standalone server from devenv up)
pnpm dev

# Smoke tests
pnpm smoke:browser            # headless Chromium audio/render check
pnpm smoke:native /tmp/shot.png

# Desktop package for the current OS
cargo build -p dodgeball-client-desktop --release
bash scripts/package-desktop.sh
```

## Definition of done still to reach

- Sound is restored; real-device and browser-autoplay verification is still
  outstanding.
- Real browser + real desktop input/touch/fullscreen/name editing verified.
- CI browser and desktop builds are green.
- No stale executable Canvas/TypeScript code or dead generated artifacts remain.
- A human can run both targets from a clean checkout using documented commands.

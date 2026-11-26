# Dodgeball Simulator

A 6-on-6 browser and desktop dodgeball game built around the **Dodgeball
Victoria / WDBF Foam Playing Format** rules: opening rush, attack-line ball
activation, catches that bring a teammate back in, live-ball blocking, and a
ten-second advantage clock.

**[▶ Play it in your browser](https://waynevanson.github.io/dodgeball-simulator/)**

![Gameplay](docs/screenshot.png)

- 6v6 with AI teammates and opponents
- Custom display name; teams are auto-balanced and empty slots are AI-filled
- Mouse + keyboard on desktop, on-screen stick + buttons on phones
- **Rust ECS simulation** inside SpacetimeDB
- **Rust Bevy presentation** on both targets:
  - browser: `wasm32-unknown-unknown` + Bevy WebGL2;
  - desktop: native Bevy + wgpu.
- All game art and UI are rendered by Bevy. There is no Canvas 2D renderer and
  no DOM widget layer.
- Procedural textures, court art, effects and HUD; zero external art assets.
- Procedural sound: every effect is synthesised to a WAV buffer at startup, so the
  game ships with zero audio files.
- Match/round flow modelled as **ECS state** — a `phase` resource plus a
  transition table.
- Deterministic, seeded simulation: `cargo test` drives full matches headlessly.

Sound is generated at runtime and the browser unlocks audio on the first
pointer/key event; see [MIGRATION_STATUS.md](MIGRATION_STATUS.md) for the
remaining device-testing follow-ups.

---

## How to play

### Desktop

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrows | Move |
| Mouse | Aim |
| Hold **LMB** | Charge a throw, release to fire |
| `Shift` | Dash |
| `Space` / **RMB** | Catch (empty hands) / block (ball in hand) |

### Mobile

Rotate the phone to landscape, then:

- **Left stick** – move
- **THROW** – hold to charge, release to throw (auto-aims at the nearest opponent)
- **DASH** – dash in the stick direction
- **CATCH** – catch or block
- **Fullscreen / sound** – top-right

### The set in one paragraph

Both teams line up on their back line. On the whistle, sprint to the centre line
and grab one of your three balls. A ball picked up in the rush is **inactive**
until you carry it behind your 3 m attack line. Hit an opponent with a live,
armed ball to eliminate them. Catch a live ball and the thrower is out **and**
your first queued teammate re-enters over the back line. Holding a ball lets you
block instead of catch. The team with the ball advantage has ten seconds to
throw or it forfeits every ball it holds. First to 3 sets wins.

**Reading the ball colours:** a hot amber ball with a glow can still get you
out. A cold grey ball with a dashed, pulsing ring is dead (or an inactive throw)
and is safe to pick up.

---

## Rules implementation

The game follows the [Dodgeball Victoria rules](https://www.dodgeballvictoria.com.au/rules)
(WDBF Official Rules, Victorian adjustments). Rules that describe the actual
sport rather than administration are implemented:

| Rule | Implemented behaviour |
| --- | --- |
| **1.1 / 1.3.4** | 18 × 9 m court mapped to the 1280×720 arena; attack lines exactly 3 m from the centre line |
| **2.1(2) / 12.1(2)** | Six balls, three per team, placed on the centre line 1.5 m apart |
| **13.1–13.6** | Opening rush: everyone starts on the back line, may touch/cross the centre line only during the rush, and may only take their own three balls |
| **13.7** | A rushed ball must fully cross the attack line to become live; throwing it early cannot eliminate anyone, but it can still be caught |
| **15.6** | A live ball dies the moment it touches a surface (walls count) — no wall bounces |
| **16.1 / 16.3** | An attempt is valid if it passes within 1 m of an opponent or of where they stood at release; clear misses are logged as warnings rather than automatic outs |
| **17.3** | Ball advantage + 10-second shot clock; at zero the offending team forfeits every held ball and both teams line up |
| **19** | Any hit from a live, armed ball eliminates the player |
| **21.2 / 22** | A ball in hand blocks: the incoming ball deflects and **remains live**; the blocker keeps their ball (disarming simplified) |
| **23.1 / 23.4 / 25** | Catches eliminate the thrower; the catching team's first queued player re-enters over the back line with an entering grace period |
| **23.6** | A caught ball is dead and belongs to the catcher |
| **26.5** | Players are confined to their own half |
| **29.3(2)** | Simultaneous all-out voids the set |
| **9.7.1 / 10.2** | Sets are won by eliminating the opposition; first to 3 sets wins; after two minutes **sudden death** disables blocking |
| **20 / 24** | Out players leave the court and wait in a visible queue behind the back line |

### Deliberate simplifications

- **Match length.** A browser game uses “first to 3 sets”, with each set ending
  only when a team is fully eliminated, plus sudden death at 2 minutes of set
  time.
- **Roster.** Six players a side. Blue is a fixed lineup (Norris, Wayne, Alex,
  Alycia, Kurt and a custom-name slot); red gets six generated names.
- **Administration.** Uniforms, cards, referees, timeouts, substitutions, ball
  retrievers and rule challenges are out of scope.
- **Boundaries.** Court geometry keeps everyone inside their own half rather
  than calling players out for touching a line.
- **Disarming (Rule 22).** A successful block keeps the blocking ball under
  control instead of modelling the drop-and-regain sequence.

---

## Architecture

Three Rust packages and a thin Vite shell:

| Package | Owns |
| --- | --- |
| `crates/sim` | ECS, rules, physics, AI, match flow, effects, snapshot DTOs |
| `crates/server` | Authoritative SpacetimeDB tick, input validation, replication |
| `crates/client` | Shared Bevy app: world renderer, HUD, menus, input, networking |
| `crates/client-bindings` | Generated Rust client bindings for the module |
| `crates/client-web` | wasm `cdylib` entry point |
| `crates/client-desktop` | native desktop binary |
| `apps/web` | Vite shell that loads the wasm client and serves the browser build |

```
  browser input                         SpacetimeDB module
┌──────────────┐  reducers            ┌──────────────────┐  scheduled 50ms
│ Bevy client  │ ───────────────────▶ │ crates/server    │ ───────────────▶ crates/sim
│ Rust + wasm  │                      │ player_input     │                  ECS + rules
│              │ ◀─────────────────── │ frame_state      │ ◀─────────────── game::tick
└──────────────┘  subscriptions       │ game_event       │
       │                              └──────────────────┘
       │ same shared client code
       ▼
┌──────────────┐
│ Bevy native  │
│ desktop app  │
└──────────────┘
```

The simulation is server-authoritative. The client sends an `InputFrame` at
20 Hz, receives a `Frame` snapshot and interpolates presentation locally. The
renderer, HUD and menus consume only the snapshot; they never touch the ECS.

### Bevy presentation

Everything visual lives under `crates/client/src`:

- `render/textures.rs` builds a static 1280×720 court, player/ball gradients,
  particle rings and glow textures procedurally at startup.
- `render/world.rs` keeps stable sprite entities per player/ball, syncs them
  from the interpolated frame and draws dynamic outlines with Bevy gizmos.
- `render/effects.rs` pools particles/floaters and applies camera shake.
- `audio/` synthesises every sound effect as a WAV at startup and plays the
  simulation's `SfxEvent`s through Bevy audio (the browser adds the spoken
  "HEADSHOT" call via `speechSynthesis`).
- `ui/mod.rs` builds the entire interface with Bevy UI: HUD, roster, score,
  menus, pause/results/rules, touch controls, rotate overlay, name editing and
  the flash overlay.
- `input.rs` maps Bevy keyboard/mouse/touch state into the simulation's
  `InputFrame`.
- `net.rs` connects through `bevy_stdb` / `spacetimedb-sdk`, subscribes to
  `frame_state`, `participant` and `game_event`, and sends reducer calls.

There is no Canvas 2D code and no HTML UI overlay.

### Target split

The shared presentation code is target-independent. Only the entry points and
window setup differ:

- `crates/client-web` exports `start(uri, database, player_name, muted, autostart)`.
- `crates/client-desktop` reads environment variables and runs the same app natively.

---

## Multiplayer (SpacetimeDB)

Online play is server-authoritative. The Rust simulation runs inside a
SpacetimeDB module (`crates/server`) at 20 ticks per second; clients send their
latest input and render snapshots received from the database.

### What the module does

- Persists the ECS `World` in a private table between reducer calls.
- Publishes `frame_state`, `participant` rows and transient `game_event` rows.
- Runs a scheduled tick every 50 ms while players are connected.
- Autobalances teams, fills empty slots with AI, makes the 13th player a
  spectator, hands a disconnected player's slot back to the AI, and resets to
  the menu when the last human leaves.
- Inputs are private and validated against `ctx.sender()`.

### Prediction and reconciliation

The client uses the shared Rust simulation for local prediction instead of only
interpolating every actor:

- The local player and the ball they carry/throw are advanced at the simulation's
  120 Hz substep, so input, dashing, charging and throws respond immediately.
- Each snapshot carries `lastInputSeq` per player. The client keeps the inputs
  sent after the server's acknowledgement and replays them on top of the latest
  authoritative state.
- Small corrections are blended out; deaths, respawns and large corrections snap
  immediately. Remote players and balls still use the 90 ms interpolation buffer,
  with a short velocity extrapolation when a packet is late.

Prediction never decides hits, catches, eliminations or score. Those remain
server-authoritative.

### Local online play

The dev shell provides the SpacetimeDB CLI 2.16.3 pinned in `Cargo.toml`.
`devenv up` starts the local server on port 3000 (see `nix/spacetime.nix`). If
you prefer to run the server in its own terminal:

```bash
# Terminal 1: local SpacetimeDB server
spacetime start

# Terminal 2: build/publish the module and regenerate Rust bindings when needed
pnpm module:build
pnpm module:generate
spacetime publish dodgeball-simulator --bin-path target/wasm32-unknown-unknown/release/dodgeball_server.wasm

# Terminal 3: browser client
pnpm dev:client
```

`pnpm dev` runs `spacetime dev`. `spacetime.json` has a Rust `generate`
target writing to `crates/client-bindings/src` (crate root `mod.rs`) and a
`dev.run` command that starts the Vite client.

`spacetime.json` points at `crates/server` and the local server.

Open two browser windows to join the same arena. The first player to press
**START MATCH** starts the set. Team selection is automatic.

### Maincloud

```bash
pnpm module:build
spacetime login
spacetime publish <your-database-name> -s maincloud \
  --bin-path target/wasm32-unknown-unknown/release/dodgeball_server.wasm
```

Set `VITE_SPACETIME_URI=wss://maincloud.spacetimedb.com` and
`VITE_SPACETIME_DB=<your-database-name>` before building the web client. On
GitHub Pages, set the repository variables `SPACETIME_URI` and `SPACETIME_DB`.

---

## Running the clients

### Browser

Requirements: Node 20+, pnpm 10, Rust 1.97.1 with the
`wasm32-unknown-unknown` target, and `wasm-bindgen-cli` **0.2.130** matching the
lockfile. The Nix dev shell provides these, including `wasm-bindgen-cli`.

```bash
pnpm install
pnpm dev:client
```

`apps/web` checks for generated wasm glue and builds it if missing. To build it
explicitly:

```bash
pnpm web:wasm            # release-size build (wasm-release profile)
PROFILE=dev pnpm web:wasm # faster local build
pnpm build
```

The wasm build script is `scripts/build-web-wasm.sh`. It runs `wasm-opt -Oz`
when available and uses the workspace's `wasm-release` profile (`opt-level =
"z"`).

Browser configuration:

```bash
VITE_SPACETIME_URI=ws://localhost:3000
VITE_SPACETIME_DB=dodgeball-simulator
```

### Desktop

```bash
cargo run -p dodgeball-client-desktop
# or
pnpm desktop
```

Configuration:

```bash
DODGEBALL_SPACETIME_URI=ws://localhost:3000
DODGEBALL_SPACETIME_DB=dodgeball-simulator
DODGEBALL_PLAYER_NAME=Player
DODGEBALL_MUTED=0
DODGEBALL_AUTOSTART=1
```

On Linux, the desktop target needs X11/Wayland development libraries, ALSA
headers (`libasound2-dev` on Debian/Ubuntu) at build time and working GPU/audio
drivers at runtime. The Nix dev shell includes the build dependencies.

Desktop packages are produced by `scripts/package-desktop.sh`: a tar.gz with
the binary, `.desktop` entry and icon on Linux, an unsigned `Dodgeball.app` zip
on macOS, and an executable zip on Windows.

---

## Development

```bash
pnpm install
pnpm typecheck
pnpm rust:test
pnpm check
pnpm build          # browser build
pnpm desktop:build  # native build
```

Useful commands:

| Command | Purpose |
| --- | --- |
| `pnpm dev:client` | Vite dev server for the wasm client |
| `pnpm web:wasm` | Build wasm glue into `apps/web/src/wasm` |
| `pnpm module:build` | Build the SpacetimeDB module wasm |
| `pnpm module:generate` | Regenerate the Rust client bindings |
| `pnpm rust:test` | Native simulation/server tests |
| `pnpm desktop` | Run the native Bevy client |
| `pnpm check` | Typecheck + Rust tests + wasm check |
| `pnpm lint` | Biome check for the web shell and scripts |
| `pnpm smoke:browser` | Headless Chromium audio/render smoke test |
| `pnpm smoke:native` | Native screenshot smoke test |
| `scripts/package-desktop.sh` | Package the native client for the current OS |

Debugging aids:

- `DODGEBALL_AUTOSTART=1` starts a match as soon as the client joins.
- `DODGEBALL_SCREENSHOT=/tmp/shot.png` saves a native screenshot after startup.
- `?autostart=1` does the same for the browser client.
- `RUST_LOG=debug` enables client/network debug logging.

### Repository layout

```text
crates/
├── sim/                  # simulation core, no renderer
├── server/               # SpacetimeDB module
├── client/               # shared Bevy app
│   └── src/
│       ├── audio/        # generated sound effects
│       ├── render/       # court, players, balls, textures, effects
│       ├── ui/           # HUD, menus, touch controls
│       ├── input.rs
│       ├── net.rs
│       └── ...
├── client-bindings/      # generated Rust SpacetimeDB bindings
├── client-web/           # wasm-bindgen entry point
└── client-desktop/       # native binary
apps/web/                 # Vite shell only
packaging/                # desktop icon and Linux .desktop entry
scripts/build-web-wasm.sh
scripts/browser-smoke.mjs
scripts/native-smoke.sh
scripts/package-desktop.sh
```

---

## Deployment

`.github/workflows/deploy.yml` installs Rust, pnpm and a matching
`wasm-bindgen-cli`, runs the Rust tests and `pnpm build` (which builds the wasm
client once, typechecks and bundles Vite), then publishes `apps/web/dist` to
GitHub Pages on every push to `main`.

`.github/workflows/desktop.yml` builds and packages the native client for
Linux, macOS and Windows on version tags.

The deployed client needs both `SPACETIME_URI` and `SPACETIME_DB` repository
variables pointing at a published module.

Desktop builds are produced separately with `cargo build -p
dodgeball-client-desktop --release`; see [MIGRATION_STATUS.md](MIGRATION_STATUS.md)
for the current CI/packaging follow-ups.

---

## Licence

MIT. See [LICENSE](LICENSE).

## Credits

Rules based on the World Dodgeball Federation Official Rules as published by
[Dodgeball Victoria](https://www.dodgeballvictoria.com.au/rules). This is an
unofficial fan project and is not affiliated with Dodgeball Victoria or the WDBF.

# Dodgeball Simulator

A 6-on-6 browser dodgeball game built around the **Dodgeball Victoria / WDBF Foam
Playing Format** rules: opening rush, attack-line ball activation, catches that
bring a teammate back in, live-ball blocking, and a ten-second advantage clock.

**[▶ Play it in your browser](https://waynevanson.github.io/dodgeball-simulator/)**

![Gameplay](docs/screenshot.png)

- 6v6 with AI teammates and opponents, three difficulty levels
- Pick your player from the blue lineup or enter a custom name for the sixth slot
- Norris wears glasses; hit him and he yells **HEADSHOT** as they fly off
- Mouse + keyboard on desktop, on-screen stick + buttons on phones
- **Rust ECS simulation** compiled to WebAssembly, Canvas 2D presentation in TypeScript
- Canvas 2D rendering for the whole game *and* the interface — no DOM widgets
- WebAudio sound effects, zero external assets, zero runtime JavaScript dependencies
- Match/round flow modelled as **ECS state** — a `phase` resource plus a transition table
- Deterministic, seeded simulation: `cargo test` drives full matches headlessly

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
| `Esc` / `P` | Pause |
| `M` | Mute |

### Mobile

Rotate the phone to landscape, then:

- **Left stick** – move
- **THROW** – hold to charge, release to throw (auto-aims at the nearest opponent)
- **DASH** – dash in the stick direction
- **CATCH** – catch or block
- **Pause / fullscreen / sound** – top-right

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
| **1.1 / 1.3.4** | 18 × 9 m court mapped to the canvas; attack lines exactly 3 m from the centre line |
| **2.1(2) / 12.1(2)** | Six balls, three per team, placed on the centre line 1.5 m apart |
| **13.1–13.6** | Opening rush: everyone starts on the back line, may touch/cross the centre line only during the rush, and may only take their own three balls |
| **13.7** | A rushed ball must fully cross the attack line to become live; throwing it early cannot eliminate anyone, but it can still be caught |
| **15.6** | A live ball dies the moment it touches a surface (walls count) — no wall bounces |
| **16.1 / 16.3** | An attempt is valid if it passes within 1 m of an opponent or of where they stood at release; clear misses are logged as warnings rather than automatic outs |
| **17.3** | Ball advantage + 10-second shot clock with an audible countdown; at zero the offending team forfeits every held ball and both teams line up |
| **19** | Any hit from a live, armed ball eliminates the player |
| **21.2 / 22** | A ball in hand blocks: the incoming ball deflects and **remains live**; the blocker keeps their ball (disarming simplified) |
| **23.1 / 23.4 / 25** | Catches eliminate the thrower; the catching team's first queued player re-enters over the back line with an entering grace period (cannot be hit or make plays) |
| **23.6** | A caught ball is dead and belongs to the catcher |
| **26.5** | Players are confined to their own half — crossing the centre line is impossible |
| **29.3(2)** | Simultaneous all-out voids the set: no point is awarded and the set is replayed |
| **9.7.1 / 10.2** | Sets are won by eliminating the opposition (1 point); first to 3 sets wins the match; after two minutes of set time **sudden death** disables blocking |
| **20 / 24** | Out players leave the court and wait in a visible queue behind the back line |

### Deliberate simplifications

These are documented rather than hidden:

- **Match length.** VDL matches are two 20-minute halves of timed sets. A browser
  game uses “first to 3 sets”, with each set ending only when a team is fully
  eliminated (foam format), plus sudden death at 2 minutes of set time.
- **Roster.** Six players a side, matching the foam format. Blue is a fixed
  lineup (Norris, Wayne, Alex, Alycia, Kurt and a custom-name slot); the red
  team gets six randomly generated ordinary names each page load.
- **Administration.** Uniforms, cards, referees, timeouts, substitutions, ball
  retrievers and rule challenges are out of scope. Invalid throws are tracked as
  warnings, matching the referee's discretion in Rule 16.3.
- **Boundaries.** Rather than calling players out for touching a line, the court
  geometry keeps everyone inside their own half.
- **Disarming (Rule 22).** A successful block keeps the blocking ball under
  control instead of modelling the drop-and-regain sequence.

Missed attempts, catching, blocking, the shot clock and the queue are all visible
in the HUD so the state of the set is always readable.

---

## Architecture

Three packages with one presentation boundary:

| Package | Owns |
| --- | --- |
| `crates/sim` (Rust → wasm + native) | ECS, rules, physics, AI, match flow, effects, HUD view model |
| `crates/server` (SpacetimeDB module) | Authoritative online tick, input validation, persistence, replication |
| `apps/web` (TypeScript) | Canvas 2D rendering, canvas UI, input, WebAudio, settings |

The offline build runs `crates/sim` in the browser. The online build runs the same crate inside the SpacetimeDB module and replaces the transport with `apps/web/src/game/online.ts`; the renderer and canvas UI consume the identical `Frame` in both modes.

The Rust side never touches a canvas or WebAudio. Each frame the browser calls
`Game.tick(dt, input)`, receives a **snapshot** (plain objects for players,
balls, particles, floaters, glasses and the HUD), and plays the **sound events**
the simulation emitted.

```
     input                      snapshot                    Canvas 2D
  ┌──────────┐   tick(dt)   ┌──────────────┐   render   ┌────────────┐
  │ apps/web │ ───────────▶ │  crates/sim  │ ─────────▶ │ apps/web   │
  │  Input   │              │  ECS + rules │            │ renderer   │
  └──────────┘ ◀─────────── └──────────────┘            └────────────┘
                 SfxEvent[]
```

In the offline build only four things cross the wasm boundary:

1. `Game::new(seed, difficulty, humanSlot, customName)`
2. `Game::tick(dt, inputFrame) -> Frame`
3. commands: `startMatch`, `pause`, `resume`, `toMenu`, `setDifficulty`, `setLineup`
4. `Game::takeEvents() -> SfxEvent[]`

### The Rust ECS

`crates/sim/src/ecs.rs` is the whole engine: generation-tagged `Entity` handles
over a recycled index space, and a `SparseSet<T>` per component type (a sparse
`index -> dense slot` table plus a dense value column). Queries walk the dense
array, so iteration is sequential and entity order is spawn order until
something is removed.

Players and balls each have a fixed component set, so they are stored as one
owned value (`Player`, `Ball`) rather than ten separate columns. That keeps the
systems readable and lets Rust own the fields, while the ECS still stores and
queries them as entities. Particles, floaters and glasses are separate
component types.

The simulation is deterministic for a given seed. The RNG is a seeded
SplitMix64 (`rng.rs`), with no `getrandom` and no platform entropy, so native
tests and browser matches can be replayed.

### Match flow

Match flow is state, not control flow. A `phase` resource holds the current
phase, a `match` resource holds the score, and `game/flow.rs` names every legal
transition:

```
   menu ──start──▶ countdown ──3.1s──▶ playing
                      ▲                  │
                      │    setOver       │ hit / catch / all-out
                      │                  ▼
                      └───3s─── setover ──▶ matchover
   pause freezes the clock; resume returns to the phase it froze
```

Entry actions belong to the definition of the state: entering `countdown`
resets the set, entering `menu` tears it down. The simulation never calls back
into flow; a resolved set is published as `set.resolved` + `set.winner`, and the
flow step claims it on the next tick.

### The frame

`game::tick` runs the old update schedule in Rust, in order:

| Step | Job |
| --- | --- |
| `flow_step` | drain triggers, poll timers and the set result, apply the table |
| `simulate` | intents, AI, fixed 120 Hz substeps, physics, collisions |
| `update_rules` | arming, opening rush, shot clock, forfeits |
| `update_effects` | age particles, floaters and glasses |
| `World::frame` | build the presentation snapshot |

Audio calls became `SfxEvent` values: `throw`, `hit`, `headshot`, `catch`,
`block`, `pickup`, `bounce`, `dash`, `beep`, `whistle`, `roundWin`, `roundLose`,
`matchWin`, `matchLose`, `ui`. The TypeScript bridge maps them onto `Sfx`.
Phase changes, shake, slow motion and confetti stay in the simulation; the
canvas just draws the result.

### Repository layout

```
Cargo.toml                     # Cargo workspace (members = crates/*)
rust-toolchain.toml            # stable + wasm32-unknown-unknown
crates/
└── sim/                       # Rust simulation core
    ├── Cargo.toml
    ├── src/
    │   ├── lib.rs
    │   ├── wasm.rs            # the only wasm-bindgen surface
    │   ├── world.rs           # World: component sets + resources
    │   ├── ecs.rs             # entities, sparse sets, allocator
    │   ├── components.rs      # Player, Ball, Particle, Floater, Glasses
    │   ├── resources.rs       # Clock, SetState, Shot, Queues, InputFrame …
    │   ├── constants.rs       # court, physics, rules, roster, difficulty
    │   ├── types.rs           # Team, Phase, Trigger, SfxEvent, Score
    │   ├── math.rs, rng.rs
    │   ├── snapshot.rs        # serde structs for the browser frame
    │   └── game/
    │       ├── mod.rs         # tick order
    │       ├── flow.rs        # phase transition table
    │       ├── ai.rs          # target choice, threats, dodging
    │       ├── effects.rs     # particles, floaters, glasses, confetti
    │       ├── spawn.rs       # match/set/formation setup
    │       └── sim/           # player, ball, throwing, contacts, out, rules
    └── tests/                 # headless match + flow tests
apps/
└── web/                       # Vite app
    ├── index.html
    ├── vite.config.ts         # unplugin-cargo + vite-plugin-wasm
    ├── tsconfig.json          # allowArbitraryExtensions for the .rs import
    └── src/
        ├── main.ts            # settings, input, rAF loop, shortcuts
        ├── styles/global.css  # page chrome only
        └── game/
            ├── bridge.ts      # Game + InputFrame + SfxEvent mapping
            ├── frame.ts       # snapshot types + Hud
            ├── queries.ts     # players/balls/human/carriedBall over a Frame
            ├── input.ts       # keyboard, pointer, touch, InputFrame
            ├── types.ts, math.ts
            ├── constants/     # presentation copies of court/rules/roster
            ├── renderer/      # court, players, balls, fx, HUD, banners
            ├── ui/            # canvas menus, hit-testing, touch controls
            ├── audio/         # WebAudio synth + speech
            └── systems/render.ts
```

`crates/sim/src/lib.rs.d.ts` is generated by `wasm-bindgen` through
`unplugin-cargo`. It is committed so `pnpm typecheck` works from a fresh clone;
it is refreshed every time the crate is built.

---

---

## Multiplayer (SpacetimeDB)

Online play is server-authoritative. The Rust simulation runs inside a
SpacetimeDB module (`crates/server`) at 20 ticks per second; browsers send their
latest input and render snapshots received from the database. Local development
is configured for SpacetimeDB in `apps/web/.env.development`; production
builds without a SpacetimeDB URI still use the browser-only WASM simulation.

### What the module does

- Persists the ECS `World` in a private table between reducer calls.
- Publishes `frame_state` (the same `Frame` the canvas already renders),
  `participant` rows and transient `game_event` sound events.
- Runs a scheduled `tick` reducer every 50 ms while players are connected.
- Autobalances teams, fills empty slots with AI, makes the 13th player a
  spectator, hands a disconnected player's slot back to the AI, and resets to
  the menu when the last human leaves, so the next visitor does not inherit a
  frozen abandoned match. Only one start request can begin a match.
- Inputs are private and validated against `ctx.sender()`. The server consumes
  dash/catch edges exactly once and drops stale input after 1.25 s.

### Local online play

Install the CLI matching the crate version (2.16.1). The upstream installer is
the easiest route:

```bash
curl -sSf https://install.spacetimedb.com | sh
spacetime --version
```

Then, from two terminals:

```bash
# Terminal 1: local SpacetimeDB server
spacetime start

# Terminal 2: SpacetimeDB dev loop + Turbo/Vite client
pnpm dev
```

`spacetime.json` points the CLI at `crates/server`, the local server, and the
committed bindings directory. `pnpm dev` runs `spacetime dev --yes`, which
builds and publishes the module, regenerates bindings, and then runs the client
through Turborepo (`pnpm dev:client`). Vite reads
`apps/web/.env.development`, so local development always talks to the local
SpacetimeDB instance at `ws://localhost:3000`.

`spacetime dev` does not start the standalone server for an existing project,
so keep `spacetime start` running. During development, pass `-c always` (or use
`--delete-data=always` when publishing manually) if you change the persisted
`World` layout; the private state is a versioned blob inside `sim_state`.

Use `pnpm dev:offline` when you explicitly want the browser-only WASM build.

Open two browser windows and both will join the same arena. Vite binds to
localhost by default; for another device, run the client with `--host`
(`pnpm --filter @dodgeball/web dev -- --host`) and set
`VITE_SPACETIME_URI=ws://<your-LAN-IP>:3000` so the device reaches SpacetimeDB.
The menu shows the connection state; the first player to press **START MATCH**
starts the set. Team selection is automatic: the server
puts you on the team with fewer humans, in the first free slot.

### Maincloud

Publish the module once and point the static client at the database:

```bash
pnpm module:build
spacetime login
spacetime publish <your-database-name> -s maincloud --bin-path target/wasm32-unknown-unknown/release/dodgeball_server.wasm
```

Set `VITE_SPACETIME_URI=wss://maincloud.spacetimedb.com` and
`VITE_SPACETIME_DB=<your-database-name>`, then build. On GitHub Pages, set the
repository variables `SPACETIME_URI` and `SPACETIME_DB`; the deploy workflow
passes them to Vite. With either variable unset the page stays in offline mode.

SpacetimeDB is a transactional database, not a UDP game socket. The 20 Hz tick
plus client-side interpolation keeps a casual 6v6 game playable, but budget for
egress: the full presentation snapshot is currently ~12–20 KB. A production
version should split player/ball rows and derive trails/particles client-side.
Also stop the tick when no humans are connected — the module already does this
— so an idle arena does not write transactions.

### Files

| Path | Role |
| --- | --- |
| `crates/server/src/lib.rs` | Tables, scheduled tick, join/input/leave/start reducers |
| `apps/web/src/module_bindings/` | Generated TypeScript client bindings (committed) |
| `apps/web/src/game/online.ts` | SpacetimeDB transport, input throttling, interpolation |
| `apps/web/src/game/audio/events.ts` | Shared sound-event player for offline and online |
| `apps/web/src/game/frame.ts` | `Frame` snapshot, including owner/`isYou` |

## Development

Requires:

- **Node 20+** and **pnpm 10** (pinned via `packageManager`)
- **Rust 1.97.1** (pinned in `rust-toolchain.toml`) with the `wasm32-unknown-unknown` target
- **SpacetimeDB CLI 2.16.1** for local and online play (the Rust module and npm client are pinned to the same version)
- **`wasm-bindgen-cli` 0.2.121**, matching the pinned `wasm-bindgen` crate

```bash
# Option A: Nix (Rust, wasm32 target, wasm-bindgen-cli, binaryen 129)
nix develop

# Option B: rustup
rustup target add wasm32-unknown-unknown
cargo install -f wasm-bindgen-cli --version 0.2.121
# Optional: binaryen 129 for optimised SpacetimeDB modules
# (SpacetimeDB 2.16 cannot parse binaryen 133 output).
```

Then, in either shell:

```bash
pnpm install
pnpm dev         # SpacetimeDB dev loop + Turbo/Vite (requires spacetime start)
pnpm dev:offline # browser-only WASM build
pnpm dev:client  # only the Vite client, through Turbo (used by spacetime dev)
pnpm typecheck   # turbo run typecheck
pnpm rust:test   # headless ECS/rules/flow tests
pnpm build       # turbo run build (cargo wasm + typecheck + Vite)
pnpm preview     # serve the production build through Turbo
pnpm check       # Turbo typecheck + rust tests + wasm check
```

Turborepo owns task execution (`turbo.json`): `build`, `typecheck`, `preview`,
`dev:client` and `dev:offline` go through `turbo run`. `pnpm dev` is the
exception because SpacetimeDB owns the server-side dev loop and invokes the
Turbo-powered `dev:client` task through `spacetime.json`.

**unplugin-cargo.** The Vite plugin compiles `crates/sim/src/lib.rs` to wasm,
runs `wasm-bindgen`, generates the glue and watches the crate's `Cargo.toml`,
workspace `Cargo.lock`, `build.rs` and `.rs` files. The package is not published
to npm; it is installed from the prebuilt GitHub Release tarball, as documented
upstream:

```json
"@waynevanson/unplugin-cargo": "https://github.com/waynevanson/unplugin-cargo/releases/download/0.2.1/waynevanson-unplugin-cargo-0.2.1.tgz"
```

The tarball ships `dist`, so there is no install-time build step. The Vite
config enables the crate's `wasm` feature.

Vite uses a relative `base`, so the build works at any path (including
`https://<user>.github.io/dodgeball-simulator/`).

---

## Deployment

`.github/workflows/deploy.yml` installs Rust with the wasm target and
`wasm-bindgen-cli`, installs with pnpm, runs the typecheck, the Rust tests and
the Vite build, then publishes `apps/web/dist` to GitHub Pages on every push to
`main`.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub
Actions**. No branch or folder needs to be configured.

---

## Credits

Rules based on the World Dodgeball Federation Official Rules as published by
[Dodgeball Victoria](https://www.dodgeballvictoria.com.au/rules). This is an
unofficial fan project and is not affiliated with Dodgeball Victoria or the WDBF.

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
- Canvas 2D rendering for the whole game *and* the interface — no DOM widgets
- WebAudio sound effects, zero external assets, zero runtime dependencies
- Vite + strict TypeScript
- Match/round flow modelled as **ECS state** — a `phase` resource plus a transition table

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

The game is an ECS driving a single 2D canvas. Global state is a **resource**,
per-instance state is a **component**, and an ordered **system** schedule
advances everything one tick at a time. There is no engine, no UI framework and
no runtime dependency beyond Vite + TypeScript.

Match flow is state, not control flow. A `phase` resource holds the current
phase, a `match` resource holds the score, and a transition table names every
legal move between them:

```
   menu ──start──▶ countdown ──3.1s──▶ playing
                      ▲                  │
                      │    setOver       │ hit / catch / all-out
                      │                  ▼
                      └───3s─── setover ──▶ matchover
   pause freezes the clock; resume returns to the phase it froze
```

Entry actions belong to the definition of the state: entering `countdown`
resets the set, entering `menu` tears it down. A frame is one ordered pass:

| system | job |
| --- | --- |
| `ui-input` | hit-test pointer presses against the drawn interface |
| `match-flow` | drain triggers, poll timers and the world's set result, apply the table |
| `phase-effects` | screens, whistles and visual flourishes on a phase change |
| `simulation` | intents, physics, collisions, shot clock, effects |
| `countdown-audio` | count-in beeps |
| `hud` | derive the render view model from resources and queries |
| `render` | canvas drawing |
| `settings` | persist what the UI changed |
| `input-frame` | clear one-shot input edges |

Everything you can see — court, HUD, menus, buttons, the touch stick — is drawn
with the Canvas 2D API in the same 1280×720 logical space as the court. There is
no DOM UI: a button is a rectangle plus an id, the menu layout is shared by the
renderer and the input system, and a pointer press is hit-tested against the
rectangles that were just drawn.

```
src/
├── main.ts                     # boot, resources, system schedule, rAF loop
├── ecs/core.ts                 # resources, entities, components, ordered schedule
├── game/
│   ├── components.ts           # barrel: shared, player, ball, effects, world, registry
│   ├── constants.ts            # barrel: view, pitch, rules, physics, teams, roster, difficulty
│   ├── spawn.ts                # barrel: match, formation, sets
│   ├── match.ts                # barrel: state, table, flow
│   ├── sim.ts                  # barrel: intents, player, ball, throwing, contacts, out, rules, loop
│   ├── ai.ts                   # barrel: threats, targets, intent
│   ├── effects.ts              # barrel: particles, floaters, glasses, feedback, update
│   ├── systems.ts              # barrel: simulation, phase-effects, countdown-audio, hud, render, input-frame
│   ├── renderer.ts             # barrel: scene, court, queues, balls, players, fx, hud, banners, cursor
│   ├── ui.ts                   # barrel: state, layout, hit, shapes, actions, flow, menu, dialogs, rules, controls
│   ├── audio.ts                # barrel: synth, voices, instance
│   ├── input.ts                # keyboard and raw pointer samples
│   ├── queries.ts              # typed views over player and ball entities
│   ├── types.ts                # shared types, including the HUD view model
│   └── math.ts                 # small helpers
└── styles/global.css           # page chrome only — the arena is entirely canvas
```

Modules publish an `export *` barrel, and every file stays under about 200
lines: one concern per module, one concern per file.

The simulation never calls back into flow. A resolved set is published as
`set.resolved` + `set.winner`, and the flow system claims it on the next tick,
which keeps the rules free of phases and the UI and leaves the transition table
as the one readable description of match flow.

---

## Development

Requires **Node 20+** and **pnpm 10** (pinned via `packageManager`).

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm typecheck  # tsc --noEmit
pnpm build      # typecheck + Vite production build into dist/
pnpm preview    # serve the production build
```

Vite uses a relative `base`, so the build works at any path (including
`https://<user>.github.io/dodgeball-simulator/`).

---

## Deployment

`.github/workflows/deploy.yml` installs with pnpm, runs the typecheck/build and
publishes `dist/` to GitHub Pages on every push to `main`.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub
Actions**. No branch or folder needs to be configured.

---

## Credits

Rules based on the World Dodgeball Federation Official Rules as published by
[Dodgeball Victoria](https://www.dodgeballvictoria.com.au/rules). This is an
unofficial fan project and is not affiliated with Dodgeball Victoria or the WDBF.

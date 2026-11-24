import {
  DbConnection,
  type ErrorContext,
  type SubscriptionEventContext,
} from '../module_bindings';
import type { Identity } from 'spacetimedb';
import { playSfxEvents, type RawSfxEvent } from './audio/events';
import type { Frame, HudPlayerView, PlayerView, BallView } from './frame';
import type { InputFrame } from './input';
import type { DifficultyId } from './types';
import type { Commands } from './ui/actions';

const TOKEN_SUFFIX = '/auth_token';
const INPUT_INTERVAL_MS = 50;
/** Render a little behind the server so two snapshots can be blended. */
const INTERP_DELAY_MS = 90;
const SAMPLES = 8;

function readToken(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeToken(key: string, token: string): void {
  try {
    localStorage.setItem(key, token);
  } catch {
    /* private mode */
  }
}

type ConnectionState = NonNullable<Frame['connection']>;

interface OnlineSettings {
  uri: string;
  database: string;
  playerName: string;
}

interface Sample {
  at: number;
  tick: bigint;
  frame: Frame;
}

interface Me {
  ownerId: bigint;
  name: string;
  team: string | null;
  slot: number | null;
  spectator: boolean;
}

function emptyFrame(name: string, slot: number): Frame {
  return {
    phase: 'menu',
    phaseElapsed: 0,
    time: 0,
    clock: { sim: 0 },
    feedback: { shake: 0, flash: 0, slowmo: 0 },
    score: { blue: 0, red: 0 },
    set: 1,
    difficulty: { id: 'pro', label: 'Pro' },
    lineup: { humanSlot: slot, customName: name },
    lastSetWinner: null,
    matchWinner: null,
    roster: { blue: [], red: [] },
    outQueue: { blue: [], red: [] },
    shot: { team: null, timeLeft: 10 },
    suddenDeath: false,
    rushActive: false,
    setElapsed: 0,
    players: [],
    balls: [],
    particles: [],
    floaters: [],
    glasses: [],
    online: true,
    connection: 'connecting',
  };
}

function copyPlayer(player: PlayerView, from: PlayerView | undefined, t: number): PlayerView {
  if (!from) return player;
  const lerp = (a: number, b: number): number => a + (b - a) * t;
  return {
    ...player,
    transform: {
      ...player.transform,
      x: lerp(from.transform.x, player.transform.x),
      y: lerp(from.transform.y, player.transform.y),
      vx: lerp(from.transform.vx, player.transform.vx),
      vy: lerp(from.transform.vy, player.transform.vy),
      facing: player.transform.facing,
    },
  };
}

function copyBall(ball: BallView, from: BallView | undefined, t: number): BallView {
  if (!from) return ball;
  const lerp = (a: number, b: number): number => a + (b - a) * t;
  return {
    ...ball,
    transform: {
      ...ball.transform,
      x: lerp(from.transform.x, ball.transform.x),
      y: lerp(from.transform.y, ball.transform.y),
      vx: lerp(from.transform.vx, ball.transform.vx),
      vy: lerp(from.transform.vy, ball.transform.vy),
    },
  };
}

function blend(from: Frame, to: Frame, t: number): Frame {
  const previous = new Map(from.players.map((player) => [player.id, player]));
  const previousBalls = new Map(from.balls.map((ball) => [ball.id, ball]));
  return {
    ...to,
    clock: { sim: from.clock.sim + (to.clock.sim - from.clock.sim) * t },
    feedback: {
      shake: from.feedback.shake + (to.feedback.shake - from.feedback.shake) * t,
      flash: from.feedback.flash + (to.feedback.flash - from.feedback.flash) * t,
      slowmo: to.feedback.slowmo,
    },
    players: to.players.map((player) => copyPlayer(player, previous.get(player.id), t)),
    balls: to.balls.map((ball) => copyBall(ball, previousBalls.get(ball.id), t)),
  };
}

/**
 * SpacetimeDB transport. It keeps the same command surface as the offline wasm
 * bridge, so `main.ts`, the renderer and the canvas UI do not need to know
 * whether the simulation is local or remote.
 */
export class OnlineBridge implements Commands {
  readonly #settings: OnlineSettings;
  readonly #placeholder: Frame;
  #conn: DbConnection | null = null;
  #identity: Identity | null = null;
  #me: Me | null = null;
  #samples: Sample[] = [];
  #latest: Frame;
  #state: ConnectionState = 'connecting';
  #tokenKey: string;
  #seq = 0n;
  #lastInputAt = 0;
  #pendingEdges = {
    dash: false,
    catch: false,
    rightPressed: false,
    touchDash: false,
    touchCatch: false,
  };
  #pendingCharge = false;
  #pendingThrow = false;
  #closed = false;

  constructor(settings: OnlineSettings) {
    this.#settings = { ...settings, playerName: settings.playerName || 'Player' };
    this.#placeholder = emptyFrame(this.#settings.playerName, 5);
    this.#latest = this.#placeholder;
    this.#tokenKey = `${settings.uri}/${settings.database}${TOKEN_SUFFIX}`;
    this.connect();
  }

  // -------------------------------------------------------------- Commands

  startMatch(): void {
    if (!this.#conn || !this.#me || this.#me.spectator) return;
    void this.#conn.reducers.startMatch({}).catch((error: unknown) => {
      console.error('start_match failed', error);
    });
  }

  pause(): void {
    // Multiplayer matches do not pause for one client.
  }

  resume(): void {
    // Multiplayer matches do not pause for one client.
  }

  toMenu(): void {
    // The match continues; the result screen offers a rematch.
  }

  setDifficulty(_id: DifficultyId): void {
    // The server owns the match difficulty.
  }

  setLineup(_slot: number, name: string): void {
    this.#settings.playerName = name.trim().slice(0, 12) || 'Player';
    this.#placeholder.lineup.customName = this.#settings.playerName;
    this.#latest.lineup.customName = this.#settings.playerName;
    if (this.#conn && this.#me) {
      void this.#conn.reducers.setName({ name: this.#settings.playerName }).catch((error: unknown) => {
        console.error('set_name failed', error);
      });
    }
  }

  // ---------------------------------------------------------------- transport

  tick(_dt: number, input: InputFrame): Frame {
    this.#sendInput(input);
    return this.#view();
  }

  frame(): Frame {
    return this.#view();
  }

  disconnect(): void {
    this.#closed = true;
    this.#conn?.disconnect();
    this.#conn = null;
  }

  // ------------------------------------------------------------------ input

  #sendInput(input: InputFrame): void {
    this.#pendingEdges.dash ||= input.dash;
    this.#pendingEdges.catch ||= input.catch;
    this.#pendingEdges.rightPressed ||= input.rightPressed;
    this.#pendingEdges.touchDash ||= input.touchDash;
    this.#pendingEdges.touchCatch ||= input.touchCatch;
    this.#pendingCharge ||= input.leftDown;
    this.#pendingThrow ||= input.throwDown;

    const now = performance.now();
    if (!this.#conn || !this.#me || this.#me.spectator) return;
    if (now - this.#lastInputAt < INPUT_INTERVAL_MS) return;
    this.#lastInputAt = now;

    const payload: InputFrame = {
      ...input,
      dash: input.dash || this.#pendingEdges.dash,
      catch: input.catch || this.#pendingEdges.catch,
      rightPressed: input.rightPressed || this.#pendingEdges.rightPressed,
      touchDash: input.touchDash || this.#pendingEdges.touchDash,
      touchCatch: input.touchCatch || this.#pendingEdges.touchCatch,
      leftDown: input.leftDown || this.#pendingCharge,
      throwDown: input.throwDown || this.#pendingThrow,
    };
    this.#pendingEdges = {
      dash: false,
      catch: false,
      rightPressed: false,
      touchDash: false,
      touchCatch: false,
    };
    this.#pendingCharge = false;
    this.#pendingThrow = false;

    this.#seq += 1n;
    void this.#conn.reducers
      .setInput({ seq: this.#seq, data: JSON.stringify(payload) })
      .catch((error: unknown) => {
        console.error('set_input failed', error);
      });
  }

  // ------------------------------------------------------------- connection

  private connect(): void {
    if (import.meta.env.DEV) console.info('Connecting to SpacetimeDB', this.#settings.uri);
    const token = readToken(this.#tokenKey);
    this.#conn = DbConnection.builder()
      .withUri(this.#settings.uri)
      .withDatabaseName(this.#settings.database)
      .withToken(token)
      .withAutomaticReconnect()
      .onConnect((conn, identity, nextToken) => {
        this.#identity = identity;
        writeToken(this.#tokenKey, nextToken);
        this.onConnected(conn);
      })
      .onAutomaticReconnect((conn, identity, nextToken) => {
        this.#identity = identity;
        writeToken(this.#tokenKey, nextToken);
        this.setState('connecting');
        this.joinArena(conn);
      })
      .onConnectError((_ctx: ErrorContext, error: Error) => {
        console.error('SpacetimeDB connection failed', error);
        this.setState('error');
      })
      .onDisconnect((_ctx: ErrorContext, error?: Error) => {
        if (error) console.error('SpacetimeDB disconnected', error);
        if (!this.#closed) this.setState('offline');
      })
      .build();
  }

  private onConnected(conn: DbConnection): void {
    this.setState('connecting');

    conn.db.frameState.onInsert((_ctx, row) => this.onFrame(row));
    conn.db.frameState.onUpdate((_ctx, _old, row) => this.onFrame(row));

    conn.db.participant.onInsert((_ctx, row) => {
      if (this.#identity && row.identity.isEqual(this.#identity)) this.onMe(row);
    });
    conn.db.participant.onUpdate((_ctx, _old, row) => {
      if (this.#identity && row.identity.isEqual(this.#identity)) this.onMe(row);
    });
    conn.db.participant.onDelete((_ctx, row) => {
      if (this.#identity && row.identity.isEqual(this.#identity)) {
        this.#me = null;
      }
    });

    conn.db.gameEvent.onInsert((_ctx, row) => {
      try {
        playSfxEvents([JSON.parse(row.data) as RawSfxEvent]);
      } catch {
        /* ignore malformed transient event */
      }
    });

    conn.subscriptionBuilder()
      .onApplied((_ctx: SubscriptionEventContext) => {
        if (!this.#me) this.setState('connecting');
      })
      .subscribeToAllTables();

    void conn.reducers.ensureTick({}).catch(() => {
      /* older local module may not need it */
    });
    this.joinArena(conn);
  }

  private joinArena(conn: DbConnection): void {
    void conn.reducers
      .join({ name: this.#settings.playerName })
      .catch((error: unknown) => {
        console.error('join failed', error);
        this.setState('error');
      });
  }

  onFrame(row: { tick: bigint; json: string }): void {
    let frame: Frame;
    try {
      frame = JSON.parse(row.json) as Frame;
    } catch (error) {
      console.error('invalid frame from server', error);
      return;
    }
    const sample: Sample = { at: performance.now(), tick: row.tick, frame };
    this.#samples.push(sample);
    while (this.#samples.length > SAMPLES) this.#samples.shift();
    this.#latest = frame;
    if (this.#state === 'connecting') {
      this.setState(this.#me?.spectator ? 'spectating' : 'online');
    }
  }

  onMe(row: {
    ownerId: bigint;
    name: string;
    team: string | undefined;
    slot: number | undefined;
    spectator: boolean;
  }): void {
    this.#me = {
      ownerId: row.ownerId,
      name: row.name,
      team: row.team ?? null,
      slot: row.slot ?? null,
      spectator: row.spectator,
    };
    this.setState(row.spectator ? 'spectating' : 'online');

    // The name may have been committed while the join call was in flight.
    if (this.#conn && !row.spectator && row.name !== this.#settings.playerName) {
      void this.#conn.reducers
        .setName({ name: this.#settings.playerName })
        .catch(() => {
          /* the retry on the next participant update is enough */
        });
    }
  }

  setState(state: ConnectionState): void {
    this.#state = state;
  }

  // ---------------------------------------------------------------- rendering

  #view(): Frame {
    const frame = this.#interpolated();
    return this.#decorate(frame);
  }

  #interpolated(): Frame {
    if (this.#samples.length === 0) return this.#placeholder;
    if (this.#samples.length === 1) return this.#samples[0].frame;

    const target = performance.now() - INTERP_DELAY_MS;
    let index = -1;
    for (let i = 0; i < this.#samples.length - 1; i++) {
      if (this.#samples[i].at <= target && target <= this.#samples[i + 1].at) {
        index = i;
        break;
      }
    }
    if (index < 0) {
      const first = this.#samples[0];
      const last = this.#samples[this.#samples.length - 1];
      if (target < first.at) return first.frame;
      if (target > last.at) return last.frame;
      return last.frame;
    }
    const a = this.#samples[index];
    const b = this.#samples[index + 1];
    const span = Math.max(1, b.at - a.at);
    const t = Math.min(1, Math.max(0, (target - a.at) / span));
    return blend(a.frame, b.frame, t);
  }

  #decorate(frame: Frame): Frame {
    const owner = this.#me ? Number(this.#me.ownerId) : null;
    const myId =
      owner === null
        ? null
        : (frame.players.find((player) => player.tag.owner === owner)?.id ?? null);

    const players = frame.players.map((player) => {
      const isYou = myId !== null && player.id === myId;
      if (player.tag.isYou === isYou) return player;
      return { ...player, tag: { ...player.tag, isYou } };
    });
    const markRoster = (list: HudPlayerView[]): HudPlayerView[] =>
      list.map((entry) => (entry.you === (entry.id === myId) ? entry : { ...entry, you: entry.id === myId }));

    return {
      ...frame,
      players,
      roster: {
        blue: markRoster(frame.roster.blue),
        red: markRoster(frame.roster.red),
      },
      lineup: {
        humanSlot: this.#me?.slot ?? frame.lineup.humanSlot,
        customName: this.#settings.playerName,
      },
      online: true,
      connection: this.#state,
    };
  }
}

/**
 * A deliberately small ECS: resources for global state, entities + components
 * for anything that composes per instance, and an ordered schedule that
 * advances the whole thing one tick at a time.
 *
 * The rule of thumb used across the app: state that describes *the run* (which
 * phase we are in, the score, the HUD snapshot) is a resource; state that
 * describes *a thing* (this player, this ball) is a component.
 */

export type Entity = number;

/** Global state. Feature modules widen this with declaration merging. */
export interface ResourceMap {}

/** Per-entity state. Feature modules widen this with declaration merging. */
export interface ComponentMap {}

export interface TickContext {
  readonly world: EcsWorld;
  /** Seconds since the previous tick, clamped by the driver. */
  readonly dt: number;
  /** Seconds since the schedule started running. */
  readonly now: number;
  /** 1-based tick counter. */
  readonly tick: number;
}

export interface System {
  readonly name: string;
  run(context: TickContext): void;
}

export class EcsWorld {
  private readonly entities = new Set<Entity>();
  private readonly stores = new Map<string, Map<Entity, unknown>>();
  private readonly resources = new Map<string, unknown>();
  private readonly systems: System[] = [];
  private nextEntity: Entity = 1;
  private ticks = 0;
  private time = 0;

  // ------------------------------------------------------------------ resources

  setResource<K extends keyof ResourceMap>(key: K, value: ResourceMap[K]): this {
    this.resources.set(key as string, value);
    return this;
  }

  hasResource<K extends keyof ResourceMap>(key: K): boolean {
    return this.resources.has(key as string);
  }

  resource<K extends keyof ResourceMap>(key: K): ResourceMap[K] {
    const value = this.resources.get(key as string);
    if (value === undefined) {
      throw new Error(`EcsWorld: missing resource "${String(key)}"`);
    }
    return value as ResourceMap[K];
  }

  // ------------------------------------------------------------------- entities

  spawn(): Entity {
    const entity = this.nextEntity++;
    this.entities.add(entity);
    return entity;
  }

  despawn(entity: Entity): void {
    this.entities.delete(entity);
    for (const store of this.stores.values()) store.delete(entity);
  }

  isAlive(entity: Entity): boolean {
    return this.entities.has(entity);
  }

  get entityCount(): number {
    return this.entities.size;
  }

  // ----------------------------------------------------------------- components

  add<K extends keyof ComponentMap>(entity: Entity, key: K, value: ComponentMap[K]): void {
    this.store(key).set(entity, value);
  }

  remove<K extends keyof ComponentMap>(entity: Entity, key: K): void {
    this.store(key).delete(entity);
  }

  has<K extends keyof ComponentMap>(entity: Entity, key: K): boolean {
    return this.store(key).has(entity);
  }

  get<K extends keyof ComponentMap>(entity: Entity, key: K): ComponentMap[K] | undefined {
    return this.store(key).get(entity) as ComponentMap[K] | undefined;
  }

  /** Every live entity carrying all of the given components. */
  query(...keys: Array<keyof ComponentMap>): Entity[] {
    if (keys.length === 0) return [...this.entities];

    let smallest: Map<Entity, unknown> | null = null;
    for (const key of keys) {
      const store = this.store(key);
      if (smallest === null || store.size < smallest.size) smallest = store;
    }
    if (smallest === null) return [];

    const found: Entity[] = [];
    for (const entity of smallest.keys()) {
      if (this.entities.has(entity) && keys.every((key) => this.store(key).has(entity))) {
        found.push(entity);
      }
    }
    return found;
  }

  private store<K extends keyof ComponentMap>(key: K): Map<Entity, unknown> {
    const name = key as string;
    let store = this.stores.get(name);
    if (!store) {
      store = new Map<Entity, unknown>();
      this.stores.set(name, store);
    }
    return store;
  }

  // ------------------------------------------------------------------- schedule

  addSystem(system: System): this {
    this.systems.push(system);
    return this;
  }

  get systemNames(): readonly string[] {
    return this.systems.map((system) => system.name);
  }

  tick(dt: number): void {
    this.ticks += 1;
    this.time += dt;
    const context: TickContext = {
      world: this,
      dt,
      now: this.time,
      tick: this.ticks,
    };
    for (const system of this.systems) system.run(context);
  }
}

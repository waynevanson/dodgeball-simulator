export type { Entity } from './entity-allocator';
import type { Entity } from './entity-allocator';

export type ComponentKey<C> = Extract<keyof C, string>;

export type ResourceKey<R> = Extract<keyof R, string>;

export interface TickContext<C extends object, R extends object> {
  readonly world: EcsWorld<C, R>;
  readonly dt: number;
  readonly now: number;
  readonly tick: number;
}

export interface System<C extends object, R extends object> {
  readonly name: string;
  run(context: TickContext<C, R>): void;
}

export class EcsWorld<C extends object, R extends object> {
  readonly #entities = new Set<Entity>();
  readonly #stores = new Map<ComponentKey<C>, Map<Entity, unknown>>();
  readonly #resources = new Map<ResourceKey<R>, unknown>();
  readonly #startupSystems: Array<System<C, R>> = [];
  readonly #updateSystems: Array<System<C, R>> = [];
  #started = false;
  #nextEntity: Entity = 1;
  #ticks = 0;
  #time = 0;

  setResource<K extends ResourceKey<R>>(key: K, value: R[K]): this {
    this.#resources.set(key, value);
    return this;
  }

  hasResource<K extends ResourceKey<R>>(key: K): boolean {
    return this.#resources.has(key);
  }

  resource<K extends ResourceKey<R>>(key: K): R[K] {
    const value = this.#resources.get(key);
    if (value === undefined) {
      throw new Error(`EcsWorld: missing resource "${key}"`);
    }
    return value as R[K];
  }

  spawn(): Entity {
    const entity = this.#nextEntity++;
    this.#entities.add(entity);
    return entity;
  }

  despawn(entity: Entity): void {
    this.#entities.delete(entity);
    for (const store of this.#stores.values()) store.delete(entity);
  }

  isAlive(entity: Entity): boolean {
    return this.#entities.has(entity);
  }

  get entityCount(): number {
    return this.#entities.size;
  }

  add<K extends ComponentKey<C>>(entity: Entity, key: K, value: C[K]): void {
    this.#store(key).set(entity, value);
  }

  remove<K extends ComponentKey<C>>(entity: Entity, key: K): void {
    this.#store(key).delete(entity);
  }

  has<K extends ComponentKey<C>>(entity: Entity, key: K): boolean {
    return this.#store(key).has(entity);
  }

  get<K extends ComponentKey<C>>(entity: Entity, key: K): C[K] | undefined {
    return this.#store(key).get(entity) as C[K] | undefined;
  }

  query<K extends ComponentKey<C>>(...keys: K[]): Entity[] {
    if (keys.length === 0) return [...this.#entities];

    let smallest: Map<Entity, unknown> | null = null;
    for (const key of keys) {
      const store = this.#store(key);
      if (smallest === null || store.size < smallest.size) smallest = store;
    }
    if (smallest === null) return [];

    const found: Entity[] = [];
    for (const entity of smallest.keys()) {
      if (this.#entities.has(entity) && keys.every((key) => this.#store(key).has(entity))) {
        found.push(entity);
      }
    }
    return found;
  }

  /** Register a per-frame system. Update systems run in registration order. */
  addSystem(system: System<C, R>): this {
    this.#updateSystems.push(system);
    return this;
  }

  /** Register a one-shot system. Startup systems run once, before the first update. */
  addStartup(system: System<C, R>): this {
    this.#startupSystems.push(system);
    return this;
  }

  get systemNames(): readonly string[] {
    return this.#updateSystems.map((system) => system.name);
  }

  get startupSystemNames(): readonly string[] {
    return this.#startupSystems.map((system) => system.name);
  }

  /** Run the startup schedule once. `tick` calls this before the first update. */
  start(): void {
    if (this.#started) return;
    this.#started = true;
    const context: TickContext<C, R> = {
      world: this,
      dt: 0,
      now: this.#time,
      tick: this.#ticks,
    };
    for (const system of this.#startupSystems) system.run(context);
  }

  tick(dt: number): void {
    this.start();
    this.#ticks += 1;
    this.#time += dt;
    const context: TickContext<C, R> = {
      world: this,
      dt,
      now: this.#time,
      tick: this.#ticks,
    };
    for (const system of this.#updateSystems) system.run(context);
  }

  #store<K extends ComponentKey<C>>(key: K): Map<Entity, unknown> {
    let store = this.#stores.get(key);
    if (!store) {
      store = new Map<Entity, unknown>();
      this.#stores.set(key, store);
    }
    return store;
  }
}

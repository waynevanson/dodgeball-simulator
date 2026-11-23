export type { Entity } from './entity-allocator';
import { EntityAllocator, entityIndex } from './entity-allocator';
import type { Entity } from './entity-allocator';
import { ComponentStore } from './component-store';
import { SparseSet } from './sparse-set';

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

/**
 * Entities are generation-tagged handles over a recycled index space: the
 * `EntityAllocator` reissues freed indices and bumps a generation, so a stale
 * handle never aliases the entity that replaced it.
 *
 * Dense indices make array storage viable, so everything keys on the index:
 * live indices live in a `SparseSet`, and each component type is a
 * `ComponentStore` — a sparse set paired with a dense value column. Queries
 * pick the smallest matching column and walk its packed array, so membership
 * is an array read instead of a hash lookup. The public API speaks handles and
 * validates them against the allocator, so stale and double-despawned handles
 * are rejected even after their index is reused.
 */
export class EcsWorld<C extends object, R extends object> {
  readonly #entities = new EntityAllocator();
  readonly #live = new SparseSet();
  readonly #stores = new Map<ComponentKey<C>, ComponentStore<unknown>>();
  readonly #resources = new Map<ResourceKey<R>, unknown>();
  readonly #startupSystems: Array<System<C, R>> = [];
  readonly #updateSystems: Array<System<C, R>> = [];
  #started = false;
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
    const entity = this.#entities.spawn();
    this.#live.add(entityIndex(entity));
    return entity;
  }

  despawn(entity: Entity): void {
    if (!this.#entities.isAlive(entity)) return;

    const index = entityIndex(entity);
    for (const store of this.#stores.values()) store.delete(index);
    this.#live.remove(index);
    this.#entities.despawn(entity);
  }

  isAlive(entity: Entity): boolean {
    return this.#entities.isAlive(entity);
  }

  get entityCount(): number {
    return this.#live.size;
  }

  add<K extends ComponentKey<C>>(entity: Entity, key: K, value: C[K]): void {
    const index = this.#indexOf(entity);
    if (index < 0) return;
    this.#store(key).set(index, value);
  }

  remove<K extends ComponentKey<C>>(entity: Entity, key: K): void {
    const index = this.#indexOf(entity);
    if (index < 0) return;
    this.#stores.get(key)?.delete(index);
  }

  has<K extends ComponentKey<C>>(entity: Entity, key: K): boolean {
    const index = this.#indexOf(entity);
    return index >= 0 && (this.#stores.get(key)?.has(index) ?? false);
  }

  get<K extends ComponentKey<C>>(entity: Entity, key: K): C[K] | undefined {
    const index = this.#indexOf(entity);
    if (index < 0) return undefined;
    return this.#stores.get(key)?.get(index) as C[K] | undefined;
  }

  /**
   * Every live entity carrying all `keys`, ordered by the smallest matching
   * column's dense order, so players and balls keep spawn order. Fresh array:
   * despawning while iterating is safe.
   */
  query<K extends ComponentKey<C>>(...keys: K[]): Entity[] {
    if (keys.length === 0) return this.#handles(this.#live.entities());

    const columns: Array<ComponentStore<unknown>> = [];
    for (const key of keys) {
      const column = this.#stores.get(key);
      if (column === undefined || column.size === 0) return [];
      columns.push(column);
    }

    let smallest = columns[0];
    for (const column of columns) {
      if (column.size < smallest.size) smallest = column;
    }

    const found: Entity[] = [];
    search: for (const index of smallest.entities()) {
      for (const column of columns) {
        if (!column.has(index)) continue search;
      }
      found.push(this.#entities.entityAt(index));
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

  /** Live entity index for a handle, or -1 when the handle is stale or dead. */
  #indexOf(entity: Entity): number {
    return this.#entities.isAlive(entity) ? entityIndex(entity) : -1;
  }

  #handles(indices: Int32Array): Entity[] {
    const entities: Entity[] = new Array(indices.length);
    for (let i = 0; i < indices.length; i++) entities[i] = this.#entities.entityAt(indices[i]);
    return entities;
  }

  #store<K extends ComponentKey<C>>(key: K): ComponentStore<unknown> {
    let store = this.#stores.get(key);
    if (store === undefined) {
      store = new ComponentStore<unknown>();
      this.#stores.set(key, store);
    }
    return store;
  }
}

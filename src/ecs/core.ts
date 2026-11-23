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
  private readonly entities = new Set<Entity>();
  private readonly stores = new Map<ComponentKey<C>, Map<Entity, unknown>>();
  private readonly resources = new Map<ResourceKey<R>, unknown>();
  private readonly systems: Array<System<C, R>> = [];
  private nextEntity: Entity = 1;
  private ticks = 0;
  private time = 0;

  setResource<K extends ResourceKey<R>>(key: K, value: R[K]): this {
    this.resources.set(key, value);
    return this;
  }

  hasResource<K extends ResourceKey<R>>(key: K): boolean {
    return this.resources.has(key);
  }

  resource<K extends ResourceKey<R>>(key: K): R[K] {
    const value = this.resources.get(key);
    if (value === undefined) {
      throw new Error(`EcsWorld: missing resource "${key}"`);
    }
    return value as R[K];
  }

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

  add<K extends ComponentKey<C>>(entity: Entity, key: K, value: C[K]): void {
    this.store(key).set(entity, value);
  }

  remove<K extends ComponentKey<C>>(entity: Entity, key: K): void {
    this.store(key).delete(entity);
  }

  has<K extends ComponentKey<C>>(entity: Entity, key: K): boolean {
    return this.store(key).has(entity);
  }

  get<K extends ComponentKey<C>>(entity: Entity, key: K): C[K] | undefined {
    return this.store(key).get(entity) as C[K] | undefined;
  }

  query<K extends ComponentKey<C>>(...keys: K[]): Entity[] {
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

  addSystem(system: System<C, R>): this {
    this.systems.push(system);
    return this;
  }

  get systemNames(): readonly string[] {
    return this.systems.map((system) => system.name);
  }

  tick(dt: number): void {
    this.ticks += 1;
    this.time += dt;
    const context: TickContext<C, R> = {
      world: this,
      dt,
      now: this.time,
      tick: this.ticks,
    };
    for (const system of this.systems) system.run(context);
  }

  private store<K extends ComponentKey<C>>(key: K): Map<Entity, unknown> {
    let store = this.stores.get(key);
    if (!store) {
      store = new Map<Entity, unknown>();
      this.stores.set(key, store);
    }
    return store;
  }
}

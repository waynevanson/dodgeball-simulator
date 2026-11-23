const INDEX_SPACE = 2 ** 32;
const MAX_GENERATION = 2 ** 20 - 1;

export type Entity = number;

export function entityIndex(entity: Entity): number {
  return entity % INDEX_SPACE;
}

export function entityGeneration(entity: Entity): number {
  return Math.floor(entity / INDEX_SPACE);
}

export function packEntity(index: number, generation: number): Entity {
  return index + generation * INDEX_SPACE;
}

export class EntityAllocator {
  #generation: Uint32Array = new Uint32Array(0);
  #live: Uint8Array = new Uint8Array(0);
  #free: Array<number> = [];
  #nextIndex = 1;
  #liveCount = 0;

  get liveCount(): number {
    return this.#liveCount;
  }

  get highWaterMark(): number {
    return this.#nextIndex;
  }

  spawn(): Entity {
    const index =
      this.#free.length > 0 ? (this.#free.pop() as number) : this.#nextIndex++;

    if (index >= this.#generation.length) this.#grow(index);

    this.#live[index] = 1;
    this.#liveCount++;
    return packEntity(index, this.#generation[index]);
  }

  despawn(entity: Entity): boolean {
    if (!this.isAlive(entity)) return false;

    const index = entityIndex(entity);
    if (++this.#generation[index] > MAX_GENERATION) {
      throw new Error('EntityAllocator: generation exhausted');
    }

    this.#live[index] = 0;
    this.#free.push(index);
    this.#liveCount--;
    return true;
  }

  isAlive(entity: Entity): boolean {
    if (!Number.isInteger(entity) || entity < 0) return false;

    const index = entityIndex(entity);
    return (
      index < this.#nextIndex &&
      this.#live[index] === 1 &&
      this.#generation[index] === entityGeneration(entity)
    );
  }

  clear(): void {
    this.#generation = new Uint32Array(0);
    this.#live = new Uint8Array(0);
    this.#free.length = 0;
    this.#nextIndex = 1;
    this.#liveCount = 0;
  }

  #grow(index: number): void {
    const size = Math.max(index + 1, this.#generation.length * 2, 64);

    const generation = new Uint32Array(size);
    generation.set(this.#generation);
    this.#generation = generation;

    const live = new Uint8Array(size);
    live.set(this.#live);
    this.#live = live;
  }
}

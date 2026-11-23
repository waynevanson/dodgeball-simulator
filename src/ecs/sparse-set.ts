import { ABSENT, PagedSparseArray } from './paged-sparse-array';

const MAX_ENTITY_ID = 0x7fffffff;

export class SparseSet {
  #sparse = new PagedSparseArray();
  #dense: Int32Array = new Int32Array(0);
  #count = 0;

  get size(): number {
    return this.#count;
  }

  get capacity(): number {
    return this.#dense.length;
  }

  get sparseBytes(): number {
    return this.#sparse.bytes;
  }

  entities(): Int32Array {
    return this.#dense.subarray(0, this.#count);
  }

  has(entity: number): boolean {
    return this.indexOf(entity) >= 0;
  }

  indexOf(entity: number): number {
    const slot = this.#sparse.get(entity);
    return slot === ABSENT ? -1 : slot - 1;
  }

  add(entity: number): number {
    if (!Number.isInteger(entity) || entity < 0 || entity > MAX_ENTITY_ID) {
      throw new RangeError(`SparseSet.add: invalid entity id ${entity}`);
    }

    const existing = this.indexOf(entity);
    if (existing >= 0) return existing;

    if (this.#count === this.#dense.length) this.#growDense();

    const index = this.#count++;
    this.#dense[index] = entity;
    this.#sparse.set(entity, index + 1);
    return index;
  }

  remove(entity: number): boolean {
    const index = this.indexOf(entity);
    if (index < 0) return false;

    const last = --this.#count;
    if (index !== last) {
      const moved = this.#dense[last];
      this.#dense[index] = moved;
      this.#sparse.set(moved, index + 1);
    }
    this.#sparse.set(entity, ABSENT);
    return true;
  }

  clear(): void {
    this.#sparse.clear();
    this.#count = 0;
  }

  #growDense(): void {
    const next = new Int32Array(Math.max(8, this.#dense.length * 2));
    next.set(this.#dense);
    this.#dense = next;
  }
}

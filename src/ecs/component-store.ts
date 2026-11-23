import { SparseSet } from './sparse-set';

/**
 * Dense storage for one component type, keyed by entity index.
 *
 * Membership is a `SparseSet`: the sparse half answers `index -> dense slot` in
 * constant time, and the dense half lists the packed entity indices, so
 * iteration is a linear scan over a full array with no holes to branch on.
 *
 * `#values` mirrors the set's dense order, so the value for dense slot `i` is
 * `#values[i]`. `set` writes at the slot `add` returns, and `delete` moves the
 * last value into the freed slot exactly where `SparseSet.remove` moves the
 * last entity index, which keeps the two halves aligned without a lookup.
 */
export class ComponentStore<V> {
  readonly #set = new SparseSet();
  #values: V[] = [];

  get size(): number {
    return this.#set.size;
  }

  get capacity(): number {
    return this.#set.capacity;
  }

  get sparseBytes(): number {
    return this.#set.sparseBytes;
  }

  has(index: number): boolean {
    return this.#set.has(index);
  }

  /** Dense entity indices. A live view: do not mutate the store while iterating. */
  entities(): Int32Array {
    return this.#set.entities();
  }

  get(index: number): V | undefined {
    const slot = this.#set.indexOf(index);
    return slot < 0 ? undefined : this.#values[slot];
  }

  set(index: number, value: V): void {
    this.#values[this.#set.add(index)] = value;
  }

  delete(index: number): boolean {
    const slot = this.#set.indexOf(index);
    if (slot < 0) return false;

    const last = this.#set.size - 1;
    if (slot !== last) this.#values[slot] = this.#values[last];
    this.#values.pop();
    this.#set.remove(index);
    return true;
  }

  clear(): void {
    this.#set.clear();
    this.#values.length = 0;
  }
}

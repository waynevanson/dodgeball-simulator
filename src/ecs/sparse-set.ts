const ABSENT = 0;
const MAX_ID = 0x7fffffff;

export class SparseSet {
  #sparse: Int32Array = new Int32Array(0);
  #dense: Int32Array = new Int32Array(0);
  #count = 0;

  get size(): number {
    return this.#count;
  }

  get capacity(): number {
    return this.#dense.length;
  }

  get sparseBytes(): number {
    return this.#sparse.length * Int32Array.BYTES_PER_ELEMENT;
  }

  entities(): Int32Array {
    return this.#dense.subarray(0, this.#count);
  }

  reserve(id: number): void {
    if (id >= this.#sparse.length) this.#growSparse(id);
  }

  has(id: number): boolean {
    return this.indexOf(id) >= 0;
  }

  indexOf(id: number): number {
    const slot = id < this.#sparse.length ? this.#sparse[id] : ABSENT;
    return slot === ABSENT ? -1 : slot - 1;
  }

  add(id: number): number {
    if (!Number.isInteger(id) || id < 0 || id > MAX_ID) {
      throw new RangeError(`SparseSet.add: invalid id ${id}`);
    }

    const existing = this.indexOf(id);
    if (existing >= 0) return existing;

    if (id >= this.#sparse.length) this.#growSparse(id);
    if (this.#count === this.#dense.length) this.#growDense();

    const index = this.#count++;
    this.#dense[index] = id;
    this.#sparse[id] = index + 1;
    return index;
  }

  remove(id: number): boolean {
    const index = this.indexOf(id);
    if (index < 0) return false;

    const last = --this.#count;
    if (index !== last) {
      const moved = this.#dense[last];
      this.#dense[index] = moved;
      this.#sparse[moved] = index + 1;
    }
    this.#sparse[id] = ABSENT;
    return true;
  }

  clear(): void {
    for (let i = 0; i < this.#count; i++) this.#sparse[this.#dense[i]] = ABSENT;
    this.#count = 0;
  }

  #growSparse(id: number): void {
    const next = new Int32Array(Math.max(id + 1, this.#sparse.length * 2, 64));
    next.set(this.#sparse);
    this.#sparse = next;
  }

  #growDense(): void {
    const next = new Int32Array(Math.max(8, this.#dense.length * 2));
    next.set(this.#dense);
    this.#dense = next;
  }
}

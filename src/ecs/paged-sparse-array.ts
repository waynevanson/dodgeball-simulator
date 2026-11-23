export const ABSENT = 0;

const PAGE_SHIFT = 10;
const PAGE_SIZE = 1 << PAGE_SHIFT;
const PAGE_MASK = PAGE_SIZE - 1;

export class PagedSparseArray {
  #pages: Array<Int32Array | undefined> = [];
  #allocated = 0;

  get(index: number): number {
    if (index < 0) return ABSENT;
    const page = this.#pages[index >>> PAGE_SHIFT];
    return page === undefined ? ABSENT : page[index & PAGE_MASK];
  }

  set(index: number, value: number): void {
    if (!Number.isInteger(index) || index < 0) {
      throw new RangeError(`PagedSparseArray.set: invalid index ${index}`);
    }

    const pageIndex = index >>> PAGE_SHIFT;
    let page = this.#pages[pageIndex];
    if (page === undefined) {
      if (value === ABSENT) return;
      page = new Int32Array(PAGE_SIZE);
      this.#pages[pageIndex] = page;
      this.#allocated++;
    }
    page[index & PAGE_MASK] = value;
  }

  clear(): void {
    this.#pages.length = 0;
    this.#allocated = 0;
  }

  get pages(): number {
    return this.#allocated;
  }

  get bytes(): number {
    return this.#allocated * PAGE_SIZE * Int32Array.BYTES_PER_ELEMENT;
  }
}

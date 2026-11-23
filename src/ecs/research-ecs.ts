// query first, then mutations
import * as v from "valibot";

export const Id = v.pipe(v.number(), v.brand("Id"));

export const EntityId = v.pipe(Id, v.brand("EntityId"));

export const ComponentId = v.pipe(Id, v.brand("ComponentId"));

export const SystemId = v.pipe(Id, v.brand("SystemId"));

// list of components
// list of entities
// (entity) -> component

/** Placeholder: assembles entity allocation, component stores and the schedule. */
export class World {
  // dense
}

// Dense typed-array storage lives in ./dense-array — one class per file,
// each extending its native typed array.

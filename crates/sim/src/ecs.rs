//! Minimal sparse-set ECS: generation-tagged entity handles and one dense
//! column per component type.
//!
//! Entities are 64-bit handles packing a 32-bit index and a 32-bit generation.
//! Despawning bumps the generation and recycles the index, so a stale handle
//! never aliases the entity that replaced it. [`SparseSet`] stores values in
//! insertion order and answers `entity -> value` through a sparse index table.

use serde::{Deserialize, Serialize};

const ABSENT: u32 = u32::MAX;
const MAX_GENERATION: u32 = (1 << 20) - 1;

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
pub struct Entity(u64);

impl Entity {
    pub const fn pack(index: u32, generation: u32) -> Self {
        Entity((index as u64) | ((generation as u64) << 32))
    }

    pub const fn index(self) -> u32 {
        (self.0 & 0xFFFF_FFFF) as u32
    }

    pub const fn generation(self) -> u32 {
        (self.0 >> 32) as u32
    }

    pub const fn bits(self) -> u64 {
        self.0
    }
}

#[derive(Default, Serialize, Deserialize)]
pub struct EntityAllocator {
    generation: Vec<u32>,
    live: Vec<bool>,
    free: Vec<u32>,
    next_index: u32,
    live_count: usize,
}

impl EntityAllocator {
    pub fn new() -> Self {
        Self {
            next_index: 1,
            ..Self::default()
        }
    }

    pub fn spawn(&mut self) -> Entity {
        let index = match self.free.pop() {
            Some(index) => index,
            None => {
                let index = self.next_index;
                self.next_index += 1;
                index
            }
        };
        let slot = index as usize;
        if slot >= self.generation.len() {
            self.generation.resize(slot + 1, 0);
            self.live.resize(slot + 1, false);
        }
        self.live[slot] = true;
        self.live_count += 1;
        Entity::pack(index, self.generation[slot])
    }

    pub fn despawn(&mut self, entity: Entity) -> bool {
        if !self.is_alive(entity) {
            return false;
        }
        let index = entity.index() as usize;
        let next = self.generation[index] + 1;
        if next > MAX_GENERATION {
            panic!("EntityAllocator: generation exhausted");
        }
        self.generation[index] = next;
        self.live[index] = false;
        self.free.push(entity.index());
        self.live_count -= 1;
        true
    }

    pub fn entity_at(&self, index: u32) -> Entity {
        Entity::pack(index, self.generation[index as usize])
    }

    pub fn is_alive(&self, entity: Entity) -> bool {
        let index = entity.index() as usize;
        index < self.generation.len()
            && self.live[index]
            && self.generation[index] == entity.generation()
    }

    pub fn live_count(&self) -> usize {
        self.live_count
    }

    pub fn high_water_mark(&self) -> u32 {
        self.next_index
    }
}

/// Dense storage for one component type, keyed by entity index.
///
/// `sparse` answers `index -> dense slot`; `dense` lists the packed entity
/// handles in insertion order; `values` mirrors that order. Removal swaps the
/// last value into the freed slot, exactly like the original TypeScript ECS, so
/// query order stays spawn order until something dies.
#[derive(Serialize, Deserialize)]
pub struct SparseSet<T> {
    sparse: Vec<u32>,
    dense: Vec<Entity>,
    values: Vec<T>,
}

impl<T> Default for SparseSet<T> {
    fn default() -> Self {
        Self {
            sparse: Vec::new(),
            dense: Vec::new(),
            values: Vec::new(),
        }
    }
}

impl<T> SparseSet<T> {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn len(&self) -> usize {
        self.dense.len()
    }

    pub fn is_empty(&self) -> bool {
        self.dense.is_empty()
    }

    pub fn clear(&mut self) {
        self.sparse.clear();
        self.dense.clear();
        self.values.clear();
    }

    /// A copy of the dense entity list. Iterate this when the loop needs to
    /// mutate the world, since removing values reorders the dense arrays.
    pub fn entities(&self) -> Vec<Entity> {
        self.dense.clone()
    }

    pub fn values(&self) -> &[T] {
        &self.values
    }

    pub fn contains(&self, entity: Entity) -> bool {
        self.get(entity).is_some()
    }

    pub fn get(&self, entity: Entity) -> Option<&T> {
        let slot = self.slot_of(entity)?;
        self.values.get(slot)
    }

    pub fn get_mut(&mut self, entity: Entity) -> Option<&mut T> {
        let slot = self.slot_of(entity)?;
        self.values.get_mut(slot)
    }

    pub fn insert(&mut self, entity: Entity, value: T) {
        if let Some(slot) = self.slot_of(entity) {
            self.values[slot] = value;
            return;
        }

        let index = entity.index() as usize;
        if index >= self.sparse.len() {
            self.sparse.resize(index + 1, ABSENT);
        }
        let slot = self.dense.len();
        self.sparse[index] = slot as u32;
        self.dense.push(entity);
        self.values.push(value);
    }

    pub fn remove(&mut self, entity: Entity) -> Option<T> {
        let slot = self.slot_of(entity)?;
        let last = self.dense.len() - 1;

        self.dense.swap(slot, last);
        self.values.swap(slot, last);

        let moved = self.dense[slot];
        self.sparse[moved.index() as usize] = slot as u32;
        self.sparse[entity.index() as usize] = ABSENT;

        self.dense.pop();
        self.values.pop()
    }

    pub fn iter(&self) -> impl Iterator<Item = (Entity, &T)> {
        self.dense.iter().copied().zip(self.values.iter())
    }

    pub fn iter_mut(&mut self) -> impl Iterator<Item = (Entity, &mut T)> {
        self.dense.iter().copied().zip(self.values.iter_mut())
    }

    fn slot_of(&self, entity: Entity) -> Option<usize> {
        let index = entity.index() as usize;
        let slot = *self.sparse.get(index)?;
        if slot == ABSENT {
            return None;
        }
        let slot = slot as usize;
        if self.dense.get(slot).copied() != Some(entity) {
            return None;
        }
        Some(slot)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stale_handles_do_not_alias_recycled_indices() {
        let mut allocator = EntityAllocator::new();
        let a = allocator.spawn();
        assert!(allocator.is_alive(a));
        allocator.despawn(a);
        let b = allocator.spawn();
        assert_eq!(a.index(), b.index());
        assert_ne!(a, b);
        assert!(!allocator.is_alive(a));
        assert!(allocator.is_alive(b));
    }

    #[test]
    fn sparse_set_keeps_insertion_order_until_removal() {
        let mut allocator = EntityAllocator::new();
        let a = allocator.spawn();
        let b = allocator.spawn();
        let c = allocator.spawn();

        let mut set: SparseSet<u32> = SparseSet::new();
        set.insert(a, 1);
        set.insert(b, 2);
        set.insert(c, 3);
        assert_eq!(set.entities(), vec![a, b, c]);

        set.remove(b);
        assert_eq!(set.entities(), vec![a, c]);
        assert_eq!(set.get(c), Some(&3));
        assert_eq!(set.get(b), None);
    }

    #[test]
    fn replacing_a_value_keeps_the_slot() {
        let mut allocator = EntityAllocator::new();
        let a = allocator.spawn();
        let mut set: SparseSet<u32> = SparseSet::new();
        set.insert(a, 1);
        set.insert(a, 9);
        assert_eq!(set.len(), 1);
        assert_eq!(set.get(a), Some(&9));
    }
}

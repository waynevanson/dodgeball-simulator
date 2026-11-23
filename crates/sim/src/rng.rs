//! Deterministic RNG (SplitMix64).
//!
//! The browser build is seeded from JavaScript, so a match is reproducible from
//! its seed. That keeps the simulation testable without `getrandom` or any
//! platform entropy source.

#[derive(Clone, Debug)]
pub struct Rng {
    state: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self { state: seed ^ 0x9E37_79B9_7F4A_7C15 }
    }

    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in `[0, 1)`.
    pub fn f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }

    pub fn range(&mut self, lo: f64, hi: f64) -> f64 {
        lo + self.f64() * (hi - lo)
    }

    pub fn chance(&mut self, probability: f64) -> bool {
        self.f64() < probability
    }

    pub fn sign(&mut self) -> f64 {
        if self.chance(0.5) {
            -1.0
        } else {
            1.0
        }
    }

    pub fn pick_index(&mut self, len: usize) -> usize {
        if len == 0 {
            0
        } else {
            ((self.f64() * len as f64) as usize).min(len - 1)
        }
    }

    pub fn pick<'a, T>(&mut self, values: &'a [T]) -> &'a T {
        &values[self.pick_index(values.len())]
    }

    pub fn shuffle<T>(&mut self, values: &mut [T]) {
        for i in (1..values.len()).rev() {
            let j = self.pick_index(i + 1);
            values.swap(i, j);
        }
    }
}

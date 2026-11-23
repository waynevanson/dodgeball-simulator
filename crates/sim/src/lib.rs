//! Deterministic dodgeball simulation core.
//!
//! The crate owns the ECS, the rules, the AI and the match flow. It knows
//! nothing about canvases or WebAudio: the browser layer calls [`game::tick`],
//! reads a [`snapshot::Frame`], and plays the sound events the simulation
//! emits. The same code runs natively under `cargo test`.

pub mod components;
pub mod constants;
pub mod ecs;
pub mod game;
pub mod math;
pub mod resources;
pub mod rng;
pub mod snapshot;
pub mod types;
pub mod world;

#[cfg(target_arch = "wasm32")]
mod wasm;

#[cfg(target_arch = "wasm32")]
pub use wasm::Game;

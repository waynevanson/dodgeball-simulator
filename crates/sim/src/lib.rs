//! Deterministic dodgeball simulation core.
//!
//! The crate owns the ECS, the rules, the AI and the match flow. It knows
//! nothing about canvases or WebAudio: the SpacetimeDB module calls
//! [`game::tick`], stores a [`snapshot::Frame`] for subscribers, and writes
//! sound events to an event table. The same code runs natively under `cargo test`.

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

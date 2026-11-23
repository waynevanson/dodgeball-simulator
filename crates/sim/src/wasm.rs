use serde::Serialize;
use wasm_bindgen::prelude::*;

use crate::constants::CUSTOM_SLOT;
use crate::resources::InputFrame;
use crate::types::{DifficultyId, Trigger};
use crate::world::World;

fn to_js<T: Serialize>(value: &T) -> JsValue {
    value
        .serialize(&serde_wasm_bindgen::Serializer::new().serialize_missing_as_null(true))
        .unwrap_or(JsValue::NULL)
}

/// The only state the browser holds: a handle to the Rust world. Every command
/// and every snapshot crosses this boundary.
#[wasm_bindgen]
pub struct Game {
    world: World,
}

#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: f64, difficulty: &str, human_slot: f64, custom_name: &str) -> Game {
        let slot = if human_slot.is_finite() {
            human_slot.max(0.0) as usize
        } else {
            CUSTOM_SLOT
        };
        Game {
            world: World::new(seed as u64, DifficultyId::parse(difficulty), slot, custom_name),
        }
    }

    /// Advance one frame and return the presentation snapshot.
    pub fn tick(&mut self, dt: f64, input: JsValue) -> JsValue {
        let input: InputFrame = serde_wasm_bindgen::from_value(input).unwrap_or_default();
        crate::game::tick(&mut self.world, dt, &input);
        to_js(&self.world.frame())
    }

    /// Sound events produced since the last call (drained).
    #[wasm_bindgen(js_name = takeEvents)]
    pub fn take_events(&mut self) -> JsValue {
        let events = std::mem::take(&mut self.world.events);
        to_js(&events)
    }

    /// Current snapshot without advancing the world.
    pub fn frame(&self) -> JsValue {
        to_js(&self.world.frame())
    }

    #[wasm_bindgen(js_name = startMatch)]
    pub fn start_match(&mut self) {
        crate::game::flow::send(&mut self.world, Trigger::Start);
    }

    pub fn pause(&mut self) {
        crate::game::flow::send(&mut self.world, Trigger::Pause);
    }

    pub fn resume(&mut self) {
        crate::game::flow::send(&mut self.world, Trigger::Resume);
    }

    #[wasm_bindgen(js_name = toMenu)]
    pub fn to_menu(&mut self) {
        crate::game::flow::send(&mut self.world, Trigger::Menu);
    }

    #[wasm_bindgen(js_name = setDifficulty)]
    pub fn set_difficulty(&mut self, id: &str) {
        self.world.match_state.difficulty = DifficultyId::parse(id);
        crate::game::spawn::apply_difficulty(&mut self.world);
    }

    #[wasm_bindgen(js_name = setLineup)]
    pub fn set_lineup(&mut self, slot: f64, name: &str) {
        let slot = if slot.is_finite() { slot.max(0.0) as usize } else { CUSTOM_SLOT };
        crate::game::spawn::set_lineup(&mut self.world, slot, name);
    }
}

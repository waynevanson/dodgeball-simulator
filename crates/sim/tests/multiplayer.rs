use dodgeball_sim::game::{self, flow, spawn};
use dodgeball_sim::resources::InputFrame;
use dodgeball_sim::types::{DifficultyId, Phase, Team, Trigger};
use dodgeball_sim::world::World;

const DT: f64 = 1.0 / 60.0;

fn step(world: &mut World, seconds: f64, inputs: &[(dodgeball_sim::ecs::Entity, InputFrame)]) {
    for _ in 0..(seconds / DT).round() as usize {
        game::tick_with_inputs(world, DT, inputs);
    }
}

#[test]
fn two_humans_receive_their_own_inputs() {
    let mut world = World::new_headless(11, DifficultyId::Pro);
    spawn::assign_owner(&mut world, Team::Blue, 0, Some(1), Some("Alice"));
    spawn::assign_owner(&mut world, Team::Red, 0, Some(2), Some("Bob"));

    let blue = world.player_by_owner(1).expect("blue owner attached");
    let red = world.player_by_owner(2).expect("red owner attached");
    assert_eq!(world.player(blue).unwrap().tag.name, "Alice");
    assert_eq!(world.player(red).unwrap().tag.name, "Bob");
    assert!(world.player(blue).unwrap().tag.is_human);
    assert!(world.player(red).unwrap().tag.is_human);

    flow::send(&mut world, Trigger::Start);
    step(&mut world, 3.3, &[]);
    assert_eq!(world.phase.id, Phase::Playing);

    let before_blue = world.player(blue).unwrap().transform.x;
    let before_red = world.player(red).unwrap().transform.x;

    let mut move_right = InputFrame::default();
    move_right.right = true;
    let mut move_left = InputFrame::default();
    move_left.left = true;
    let inputs = [(blue, move_right), (red, move_left)];

    step(&mut world, 0.6, &inputs);

    let blue_x = world.player(blue).unwrap().transform.x;
    let red_x = world.player(red).unwrap().transform.x;
    assert!(
        blue_x > before_blue + 10.0,
        "blue did not move right: {before_blue} -> {blue_x}"
    );
    assert!(
        red_x < before_red - 10.0,
        "red did not move left: {before_red} -> {red_x}"
    );
}

#[test]
fn removing_an_owner_returns_the_slot_to_the_ai() {
    let mut world = World::new_headless(12, DifficultyId::Pro);
    spawn::assign_owner(&mut world, Team::Blue, 2, Some(7), Some("Temp"));
    let entity = world.player_by_owner(7).expect("owner attached");
    assert!(world.player(entity).unwrap().tag.is_human);

    spawn::assign_owner(&mut world, Team::Blue, 2, None, None);
    let player = world.player(entity).unwrap();
    assert!(!player.tag.is_human);
    assert!(player.tag.owner.is_none());
    assert!(player.brain.diff.is_some(), "AI brain must be re-enabled");
    assert_eq!(player.tag.name, "Alex");
}

#[test]
fn a_world_survives_the_database_round_trip() {
    let mut world = World::new_headless(21, DifficultyId::Pro);
    spawn::assign_owner(&mut world, Team::Blue, 0, Some(1), Some("Alice"));
    spawn::assign_owner(&mut world, Team::Red, 0, Some(2), Some("Bob"));
    flow::send(&mut world, Trigger::Start);
    step(&mut world, 3.3, &[]);
    assert_eq!(world.phase.id, Phase::Playing);

    // The server drains sound events into an event table before persisting.
    world.events.clear();
    let bytes = bincode::serialize(&world).expect("serialize world");
    let mut restored: World = bincode::deserialize(&bytes).expect("deserialize world");

    assert_eq!(restored.phase.id, Phase::Playing);
    assert_eq!(restored.players.len(), world.players.len());
    assert!(restored.player_by_owner(1).is_some());
    assert!(restored.player_by_owner(2).is_some());

    let blue = restored.player_by_owner(1).unwrap();
    let mut move_right = InputFrame::default();
    move_right.right = true;
    let inputs = [(blue, move_right)];
    let x = restored.player(blue).unwrap().transform.x;
    step(&mut restored, 0.5, &inputs);
    assert!(restored.player(blue).unwrap().transform.x > x + 5.0);
}

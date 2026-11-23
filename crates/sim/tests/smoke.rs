use dodgeball_sim::game::{self, flow};
use dodgeball_sim::resources::InputFrame;
use dodgeball_sim::types::{DifficultyId, Phase, Trigger};
use dodgeball_sim::world::World;

const DT: f64 = 1.0 / 60.0;

fn new_game() -> World {
    World::new(7, DifficultyId::Pro, 5, "Tester")
}

fn step(world: &mut World, seconds: f64, input: &InputFrame) {
    let frames = (seconds / DT).round() as usize;
    for _ in 0..frames {
        game::tick(world, DT, input);
    }
}

#[test]
fn boots_into_menu_with_a_full_roster() {
    let world = new_game();
    assert_eq!(world.phase.id, Phase::Menu);
    assert_eq!(world.players.len(), 12);
    assert_eq!(world.balls.len(), 6);
    assert_eq!(world.lineup.custom_name, "Tester");
    assert!(world.lineup.human_slot == 5);
    assert_eq!(world.human().map(|(_, p)| p.tag.name.as_str()), Some("Tester"));

    let frame = world.frame();
    assert_eq!(frame.roster.blue.len(), 6);
    assert_eq!(frame.roster.red.len(), 6);
    assert_eq!(frame.balls.len(), 6);
}

#[test]
fn start_runs_the_countdown_then_playing() {
    let mut input = InputFrame::default();
    let mut world = new_game();
    flow::send(&mut world, Trigger::Start);

    step(&mut world, DT * 2.0, &input);
    assert_eq!(world.phase.id, Phase::Countdown);
    assert!(world.rush.active, "the opening rush starts with the set");

    input.mouse_used = false;
    step(&mut world, 3.2, &input);
    assert_eq!(world.phase.id, Phase::Playing);
    assert!(!world.set.resolved);
}

#[test]
fn pause_freezes_simulation_time() {
    let mut world = new_game();
    let mut input = InputFrame::default();
    flow::send(&mut world, Trigger::Start);
    step(&mut world, 4.0, &input);
    assert_eq!(world.phase.id, Phase::Playing);

    flow::send(&mut world, Trigger::Pause);
    step(&mut world, DT * 2.0, &input);
    assert_eq!(world.phase.id, Phase::Paused);

    let before = world.clock.sim;
    step(&mut world, 1.0, &input);
    assert!((world.clock.sim - before).abs() < 1e-9, "paused clock must not advance");

    flow::send(&mut world, Trigger::Resume);
    step(&mut world, DT * 2.0, &input);
    assert_eq!(world.phase.id, Phase::Playing);
}

#[test]
fn ai_sets_stay_inside_the_court_and_free_of_nan() {
    let mut world = new_game();
    let input = InputFrame::default();
    flow::send(&mut world, Trigger::Start);

    for frame in 0..60 * 45 {
        game::tick(&mut world, DT, &input);

        if frame % 30 == 0 {
            for (_, player) in world.players.iter() {
                assert!(
                    player.transform.x.is_finite()
                        && player.transform.y.is_finite()
                        && player.transform.vx.is_finite()
                        && player.transform.vy.is_finite(),
                    "non-finite player transform"
                );
                let court = dodgeball_sim::constants::COURT;
                assert!(
                    player.transform.x >= court.x - 1.0
                        && player.transform.x <= court.right + 1.0,
                    "player left the court: {}",
                    player.transform.x
                );
                assert!(
                    player.transform.y >= court.y - 1.0
                        && player.transform.y <= court.bottom + 1.0,
                    "player left the court: {}",
                    player.transform.y
                );
            }
            for (_, ball) in world.balls.iter() {
                assert!(ball.transform.x.is_finite() && ball.transform.y.is_finite());
            }
        }
    }

    assert!(world.set.id >= 1, "at least one set started");
    assert!(!world.ball_owners_broken(), "ball ownership stayed consistent");
}

#[test]
fn menu_does_not_advance_the_set() {
    let mut world = new_game();
    let input = InputFrame::default();
    let before = world.ball_positions();
    step(&mut world, 2.0, &input);
    assert_eq!(world.phase.id, Phase::Menu);
    assert_eq!(world.ball_positions(), before);
    assert_eq!(world.set.id, 0);
}

#[test]
fn deterministic_for_the_same_seed() {
    let input = InputFrame::default();
    let mut a = World::new(99, DifficultyId::Allstar, 4, "Wayne");
    let mut b = World::new(99, DifficultyId::Allstar, 4, "Wayne");
    flow::send(&mut a, Trigger::Start);
    flow::send(&mut b, Trigger::Start);

    for _ in 0..60 * 20 {
        game::tick(&mut a, DT, &input);
        game::tick(&mut b, DT, &input);
    }

    assert_eq!(a.players.len(), b.players.len());
    for (name, player) in a.players.iter() {
        let other = b.players.get(name).expect("same entity layout");
        assert!((player.transform.x - other.transform.x).abs() < 1e-9);
        assert!((player.transform.y - other.transform.y).abs() < 1e-9);
    }
}

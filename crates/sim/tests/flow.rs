use dodgeball_sim::game::{self, flow, sim::out::Cause};
use dodgeball_sim::resources::InputFrame;
use dodgeball_sim::types::{DifficultyId, Phase, Team, Trigger};
use dodgeball_sim::world::World;

const DT: f64 = 1.0 / 60.0;

fn step(world: &mut World, seconds: f64) {
    let input = InputFrame::default();
    for _ in 0..(seconds / DT).round() as usize {
        game::tick(world, DT, &input);
    }
}

fn wipe(world: &mut World, team: Team) {
    let losers: Vec<_> = world
        .players
        .iter()
        .filter(|(_, player)| player.tag.team == team && player.condition.alive)
        .map(|(entity, _)| entity)
        .collect();
    for entity in losers {
        dodgeball_sim::game::sim::out::eliminate(world, entity, Cause::Hit);
    }
}

#[test]
fn wiping_a_team_scores_the_set_and_starts_the_next() {
    let mut world = World::new(1, DifficultyId::Pro, 5, "Tester");
    flow::send(&mut world, Trigger::Start);
    step(&mut world, 3.2);
    assert_eq!(world.phase.id, Phase::Playing);

    wipe(&mut world, Team::Red);
    assert!(world.set.resolved);
    assert_eq!(world.set.winner, Some(Team::Blue));

    // The flow system claims the resolved set on the next tick.
    step(&mut world, DT * 2.0);
    assert_eq!(world.phase.id, Phase::SetOver);
    assert_eq!(world.score().blue, 1);

    step(&mut world, 3.1);
    assert_eq!(world.phase.id, Phase::Countdown);
    assert_eq!(world.match_state.set, 2);
}

#[test]
fn three_sets_end_the_match() {
    let mut world = World::new(2, DifficultyId::Rookie, 5, "Tester");
    flow::send(&mut world, Trigger::Start);

    for set in 1..=3 {
        step(&mut world, 3.2);
        assert_eq!(world.phase.id, Phase::Playing, "set {set} started");

        wipe(&mut world, Team::Red);
        step(&mut world, DT * 2.0);
        assert_eq!(world.phase.id, Phase::SetOver);

        if set < 3 {
            step(&mut world, 3.1);
            assert_eq!(world.phase.id, Phase::Countdown);
        }
    }

    step(&mut world, 3.1);
    assert_eq!(world.phase.id, Phase::MatchOver);
    assert_eq!(world.score().blue, 3);
    assert_eq!(world.match_state.match_winner, Some(Team::Blue));
}

#[test]
fn a_voided_set_awards_no_point() {
    let mut world = World::new(3, DifficultyId::Pro, 5, "Tester");
    flow::send(&mut world, Trigger::Start);
    step(&mut world, 3.2);

    // Simulate a simultaneous all-out: both teams hit zero in one step.
    for (_, player) in world.players.iter_mut() {
        player.condition.alive = false;
    }
    dodgeball_sim::game::sim::out::check_set_end(&mut world);
    step(&mut world, DT * 2.0);

    assert_eq!(world.phase.id, Phase::SetOver);
    assert_eq!(world.score().blue, 0);
    assert_eq!(world.score().red, 0);
    assert_eq!(world.set.winner, None);
}

#[test]
fn shot_clock_forfeits_the_held_balls() {
    let mut world = World::new(4, DifficultyId::Pro, 5, "Tester");
    flow::send(&mut world, Trigger::Start);
    step(&mut world, 3.2);

    // Give blue a ball advantage by hand: one player picks a ball up.
    let (player, ball) = world
        .players
        .iter()
        .find(|(_, player)| player.tag.team == Team::Blue)
        .map(|(entity, _)| entity)
        .and_then(|entity| {
            let ball = world.balls.iter().map(|(ball_entity, _)| ball_entity).next()?;
            Some((entity, ball))
        })
        .expect("player and ball");

    let x = world.player(player).unwrap().transform.x;
    let y = world.player(player).unwrap().transform.y;
    world.ball_mut(ball).unwrap().transform.x = x;
    world.ball_mut(ball).unwrap().transform.y = y;
    world.ball_mut(ball).unwrap().state.rush = false;

    // Simulate enough for a pickup collision, then burn the shot clock.
    step(&mut world, 0.5);
    step(&mut world, 10.5);

    assert!(world.carried_ball(player).is_none(), "possession was forfeited");
}

/// The count-in is a rule, so it is observable from the simulation alone:
/// three beeps, one per second, the last one flagged, never repeated.
#[test]
fn countdown_announces_each_second_exactly_once() {
    use dodgeball_sim::constants::COUNTDOWN_SECONDS;
    use dodgeball_sim::types::SfxEvent;

    let mut world = World::new(1, DifficultyId::Pro, 5, "Tester");
    flow::send(&mut world, Trigger::Start);

    let mut beeps: Vec<(bool, f64)> = Vec::new();
    let frames = (COUNTDOWN_SECONDS / DT).ceil() as usize + 4;
    for _ in 0..frames {
        game::tick(&mut world, DT, &InputFrame::default());
        for event in std::mem::take(&mut world.events) {
            if let SfxEvent::Beep(last) = event {
                beeps.push((last, world.phase.elapsed));
            }
        }
    }

    let flags: Vec<bool> = beeps.iter().map(|(last, _)| *last).collect();
    assert_eq!(flags, vec![false, false, true], "beeps: {beeps:?}");

    // Ascending timestamps: no duplicates, no replays after a pause.
    assert!(
        beeps.windows(2).all(|pair| pair[1].1 > pair[0].1),
        "beeps: {beeps:?}"
    );
}

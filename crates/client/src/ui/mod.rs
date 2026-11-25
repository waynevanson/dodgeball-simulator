#![allow(deprecated)]

//! All interface rendering lives here: HUD, menus, dialogs, touch controls and
//! the full-screen flash overlay. Everything is Bevy UI; there are no DOM
//! widgets.

use bevy::color::Alpha;
use bevy::input::keyboard::KeyboardInput;
use bevy::input::ButtonState;
use bevy::prelude::*;
use bevy::window::{MonitorSelection, PrimaryWindow, WindowMode};
use bevy_stdb::prelude::StdbConnection;
use dodgeball_bindings::DbConnection;
use dodgeball_sim::types::{Phase, Team};

use crate::consts::*;
use crate::input::{ui_offset, ui_scale, InputState};
use crate::model::{clean_name, ClientState, ConnectionState, UiScreen, ViewFrame};
use crate::net::{request_set_name, request_start_match};
use crate::platform;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UiAction {
    StartMatch,
    Rules,
    Back,
    Resume,
    Pause,
    Rematch,
    Menu,
    Fullscreen,
    ToggleMute,
    EditName,
    SubmitName,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextKind {
    Connection,
    PlayerName,
    SetLabel,
    Clock,
    ShotLabel,
    Rush,
    Sudden,
    Hint,
    BlueName,
    RedName,
    Result,
    Banner,
    Sound,
    Roster { team: Team, index: usize },
}

#[derive(Component, Clone, Copy)]
pub struct UiText(pub TextKind);

#[derive(Component, Clone, Copy)]
pub struct UiActionButton(pub UiAction);

#[derive(Component)]
pub struct ButtonBase(pub Color);

#[derive(Component)]
pub struct ScoreDot {
    pub team: Team,
    pub index: usize,
}

#[derive(Component)]
pub struct RosterDot {
    pub team: Team,
    pub index: usize,
}

#[derive(Component)]
pub struct HudRoot;

#[derive(Component)]
pub struct ScreenRoot(pub UiScreen);

#[derive(Component)]
pub struct TopBarRoot;

#[derive(Component)]
pub struct TouchRoot;

#[derive(Component)]
pub struct RotateRoot;

#[derive(Component)]
pub struct NameField;

#[derive(Component)]
pub struct StickKnob;

#[derive(Component)]
pub struct FlashOverlay;

#[derive(Component)]
pub struct HudBar;

pub fn setup_ui(mut commands: Commands, mut ui_scale: ResMut<UiScale>) {
    ui_scale.0 = 1.0;
    let root = commands
        .spawn((
            Node {
                width: percent(100),
                height: percent(100),
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                ..default()
            },
            GlobalZIndex(0),
        ))
        .id();
    let design = commands
        .spawn((
            Node {
                width: Val::Px(UI_W),
                height: Val::Px(UI_H),
                position_type: PositionType::Relative,
                ..default()
            },
            ChildOf(root),
        ))
        .id();

    spawn_hud(&mut commands, design);
    spawn_menu(&mut commands, design);
    spawn_pause(&mut commands, design);
    spawn_results(&mut commands, design);
    spawn_rules(&mut commands, design);
    spawn_topbar(&mut commands, design);
    spawn_touch(&mut commands, design);
    spawn_rotate(&mut commands, design);
    spawn_flash(&mut commands, root);
}

fn text_node(
    commands: &mut Commands,
    parent: Entity,
    text: &str,
    x: f32,
    y: f32,
    width: f32,
    size: f32,
    color: Color,
    justify: Justify,
) -> Entity {
    commands
        .spawn((
            Text::new(text),
            TextFont {
                font_size: FontSize::Px(size),
                ..default()
            },
            TextColor(color),
            TextLayout::new(justify, LineBreak::WordBoundary),
            Node {
                position_type: PositionType::Absolute,
                left: Val::Px(x),
                top: Val::Px(y),
                width: Val::Px(width),
                ..default()
            },
            ChildOf(parent),
        ))
        .id()
}

fn ui_text(
    commands: &mut Commands,
    parent: Entity,
    kind: TextKind,
    text: &str,
    x: f32,
    y: f32,
    width: f32,
    size: f32,
    color: Color,
) -> Entity {
    let entity = text_node(
        commands,
        parent,
        text,
        x,
        y,
        width,
        size,
        color,
        Justify::Center,
    );
    commands.entity(entity).insert(UiText(kind));
    entity
}

fn button(
    commands: &mut Commands,
    parent: Entity,
    action: UiAction,
    label: &str,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    size: f32,
    base: Color,
    border: Color,
) -> Entity {
    let entity = commands
        .spawn((
            Interaction::default(),
            UiActionButton(action),
            ButtonBase(base),
            Node {
                position_type: PositionType::Absolute,
                left: Val::Px(x),
                top: Val::Px(y),
                width: Val::Px(w),
                height: Val::Px(h),
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                border: UiRect::all(Val::Px(1.0)),
                border_radius: BorderRadius::all(Val::Px(9.0)),
                ..default()
            },
            BackgroundColor(base),
            BorderColor::all(border),
            ChildOf(parent),
        ))
        .id();
    text_node(
        commands,
        entity,
        label,
        0.0,
        (h - size * 1.25) * 0.5,
        w,
        size,
        if base == Color::NONE { INK } else { INK },
        Justify::Center,
    );
    entity
}

fn panel(commands: &mut Commands, parent: Entity, x: f32, y: f32, w: f32, h: f32) -> Entity {
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                left: Val::Px(x),
                top: Val::Px(y),
                width: Val::Px(w),
                height: Val::Px(h),
                border: UiRect::all(Val::Px(1.0)),
                border_radius: BorderRadius::all(Val::Px(18.0)),
                ..default()
            },
            BackgroundColor(PANEL_FILL),
            BorderColor::all(PANEL_LINE),
            ChildOf(parent),
        ))
        .id()
}

fn overlay(commands: &mut Commands, parent: Entity, screen: UiScreen) -> Entity {
    commands
        .spawn((
            ScreenRoot(screen),
            Node {
                position_type: PositionType::Absolute,
                left: Val::Px(0.0),
                top: Val::Px(0.0),
                width: Val::Px(UI_W),
                height: Val::Px(UI_H),
                ..default()
            },
            BackgroundColor(Color::srgba(4.0 / 255.0, 7.0 / 255.0, 12.0 / 255.0, 0.62)),
            Visibility::Hidden,
            GlobalZIndex(10),
            ChildOf(parent),
        ))
        .id()
}

fn spawn_hud(commands: &mut Commands, design: Entity) {
    let hud = commands
        .spawn((
            HudRoot,
            Node {
                position_type: PositionType::Absolute,
                left: Val::Px(0.0),
                top: Val::Px(0.0),
                width: Val::Px(UI_W),
                height: Val::Px(UI_H),
                ..default()
            },
            ChildOf(design),
        ))
        .id();

    commands.spawn((
        HudBar,
        Node {
            position_type: PositionType::Absolute,
            left: Val::Px(0.0),
            top: Val::Px(0.0),
            width: Val::Px(UI_W),
            height: Val::Px(118.0),
            ..default()
        },
        BackgroundColor(Color::srgba(5.0 / 255.0, 8.0 / 255.0, 14.0 / 255.0, 0.62)),
        ChildOf(hud),
    ));

    text_node(
        commands,
        hud,
        "BLUE",
        42.0,
        18.0,
        220.0,
        18.0,
        BLUE.main,
        Justify::Left,
    );
    text_node(
        commands,
        hud,
        "RED",
        1018.0,
        18.0,
        220.0,
        18.0,
        RED.main,
        Justify::Right,
    );

    for i in 0..WINS as usize {
        score_dot(commands, hud, Team::Blue, i, 118.0 + i as f32 * 16.0);
        score_dot(commands, hud, Team::Red, i, 1162.0 - i as f32 * 16.0);
    }

    for i in 0..6 {
        roster_dot(
            commands,
            hud,
            Team::Blue,
            i,
            42.0 + 10.0 + i as f32 * 30.0,
            64.0,
        );
        roster_dot(
            commands,
            hud,
            Team::Red,
            i,
            1238.0 - 10.0 - i as f32 * 30.0,
            64.0,
        );
    }

    ui_text(
        commands,
        hud,
        TextKind::SetLabel,
        "SET 1 | PRO",
        440.0,
        8.0,
        400.0,
        10.0,
        INK_DIM,
    );
    let clock = ui_text(
        commands,
        hud,
        TextKind::Clock,
        "--",
        490.0,
        24.0,
        300.0,
        34.0,
        INK,
    );
    commands
        .entity(clock)
        .insert(TextLayout::new(Justify::Center, LineBreak::NoWrap));
    ui_text(
        commands,
        hud,
        TextKind::ShotLabel,
        "SET TIME",
        490.0,
        74.0,
        300.0,
        8.0,
        INK_FAINT,
    );
    ui_text(
        commands,
        hud,
        TextKind::Rush,
        "OPENING RUSH",
        490.0,
        94.0,
        300.0,
        9.0,
        AMBER.with_alpha(0.0),
    );
    ui_text(
        commands,
        hud,
        TextKind::Sudden,
        "SUDDEN DEATH | NO BLOCKING",
        490.0,
        94.0,
        300.0,
        9.0,
        DANGER.with_alpha(0.0),
    );
    ui_text(
        commands,
        hud,
        TextKind::Banner,
        "",
        390.0,
        160.0,
        500.0,
        34.0,
        INK.with_alpha(0.0),
    );
    ui_text(
        commands,
        hud,
        TextKind::Hint,
        "",
        20.0,
        686.0,
        1240.0,
        10.0,
        INK_DIM.with_alpha(0.65),
    );
    ui_text(
        commands,
        hud,
        TextKind::Connection,
        "",
        440.0,
        108.0,
        400.0,
        9.0,
        DANGER.with_alpha(0.0),
    );
}

fn score_dot(commands: &mut Commands, parent: Entity, team: Team, index: usize, cx: f32) {
    commands.spawn((
        ScoreDot { team, index },
        Node {
            position_type: PositionType::Absolute,
            left: Val::Px(cx - 4.5),
            top: Val::Px(24.0),
            width: Val::Px(9.0),
            height: Val::Px(9.0),
            border: UiRect::all(Val::Px(1.0)),
            border_radius: BorderRadius::MAX,
            ..default()
        },
        BackgroundColor(Color::NONE),
        BorderColor::all(INK_FAINT.with_alpha(0.35)),
        ChildOf(parent),
    ));
}

fn roster_dot(commands: &mut Commands, parent: Entity, team: Team, index: usize, x: f32, y: f32) {
    let dot = commands
        .spawn((
            RosterDot { team, index },
            Node {
                position_type: PositionType::Absolute,
                left: Val::Px(x - 9.0),
                top: Val::Px(y - 9.0),
                width: Val::Px(18.0),
                height: Val::Px(18.0),
                border: UiRect::all(Val::Px(1.0)),
                border_radius: BorderRadius::MAX,
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                ..default()
            },
            BackgroundColor(Color::NONE),
            BorderColor::all(INK_FAINT.with_alpha(0.3)),
            ChildOf(parent),
        ))
        .id();
    let label = text_node(
        commands,
        dot,
        "",
        -4.0,
        -6.0,
        26.0,
        9.0,
        INK_DIM,
        Justify::Center,
    );
    commands
        .entity(label)
        .insert(UiText(TextKind::Roster { team, index }));
}

fn spawn_menu(commands: &mut Commands, design: Entity) {
    let root = overlay(commands, design, UiScreen::Menu);
    let p = panel(commands, root, 300.0, 40.0, 680.0, 640.0);

    text_node(
        commands,
        p,
        "DODGE",
        210.0,
        38.0,
        170.0,
        52.0,
        INK,
        Justify::Right,
    );
    text_node(
        commands,
        p,
        "BALL",
        390.0,
        38.0,
        170.0,
        52.0,
        AMBER,
        Justify::Left,
    );
    text_node(
        commands,
        p,
        "SIMULATOR",
        240.0,
        102.0,
        200.0,
        12.0,
        INK_DIM,
        Justify::Center,
    );

    text_node(
        commands,
        p,
        "Six a side. Six balls on the centre line. One hit and you're out.",
        40.0,
        144.0,
        600.0,
        12.5,
        INK_DIM,
        Justify::Center,
    );
    text_node(
        commands,
        p,
        "Catch a live ball to send the thrower out and bring a teammate back in.",
        40.0,
        164.0,
        600.0,
        12.5,
        INK_DIM,
        Justify::Center,
    );

    ui_text(
        commands,
        p,
        TextKind::Connection,
        "ONLINE | CONNECTING",
        40.0,
        206.0,
        600.0,
        11.0,
        INK_DIM,
    );
    text_node(
        commands,
        p,
        "You will be placed on the team with fewer players.",
        40.0,
        230.0,
        600.0,
        12.5,
        INK_DIM,
        Justify::Center,
    );
    text_node(
        commands,
        p,
        "CUSTOM PLAYER NAME",
        40.0,
        300.0,
        600.0,
        9.5,
        INK_FAINT,
        Justify::Center,
    );

    let name = commands
        .spawn((
            NameField,
            Node {
                position_type: PositionType::Absolute,
                left: Val::Px(170.0),
                top: Val::Px(326.0),
                width: Val::Px(340.0),
                height: Val::Px(36.0),
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                border: UiRect::all(Val::Px(1.0)),
                border_radius: BorderRadius::all(Val::Px(9.0)),
                ..default()
            },
            BackgroundColor(Color::srgba(4.0 / 255.0, 8.0 / 255.0, 16.0 / 255.0, 0.8)),
            BorderColor::all(INK_FAINT.with_alpha(0.24)),
            Interaction::default(),
            UiActionButton(UiAction::EditName),
            ChildOf(p),
        ))
        .id();
    ui_text(
        commands,
        name,
        TextKind::PlayerName,
        "Crispy",
        0.0,
        8.0,
        340.0,
        14.0,
        INK,
    );

    button(
        commands,
        p,
        UiAction::StartMatch,
        "START MATCH",
        240.0,
        402.0,
        200.0,
        50.0,
        13.0,
        BLUE.main.with_alpha(0.9),
        BLUE.light.with_alpha(0.45),
    );
    button(
        commands,
        p,
        UiAction::Rules,
        "Read the rules — VDL / WDBF Foam format",
        200.0,
        472.0,
        280.0,
        22.0,
        11.0,
        Color::NONE,
        Color::NONE,
    );

    text_node(
        commands,
        p,
        "WASD  MOVE      Mouse  AIM      Hold LMB  CHARGE & THROW",
        100.0,
        512.0,
        480.0,
        10.0,
        INK_FAINT,
        Justify::Center,
    );
    text_node(
        commands,
        p,
        "Shift  DASH      Space / RMB  CATCH / BLOCK      Esc  PAUSE",
        100.0,
        534.0,
        480.0,
        10.0,
        INK_FAINT,
        Justify::Center,
    );
    text_node(commands, p, "First to 3 sets wins. Grab a ball in the opening rush and carry it behind the attack line to arm it.", 80.0, 580.0, 520.0, 10.5, INK_FAINT, Justify::Center);
}

fn spawn_pause(commands: &mut Commands, design: Entity) {
    let root = overlay(commands, design, UiScreen::Pause);
    let p = panel(commands, root, 420.0, 200.0, 440.0, 320.0);
    text_node(
        commands,
        p,
        "PAUSED",
        40.0,
        42.0,
        360.0,
        28.0,
        INK,
        Justify::Center,
    );
    button(
        commands,
        p,
        UiAction::Resume,
        "RESUME",
        100.0,
        130.0,
        240.0,
        46.0,
        12.0,
        BLUE.main.with_alpha(0.9),
        BLUE.light.with_alpha(0.4),
    );
    button(
        commands,
        p,
        UiAction::StartMatch,
        "RESTART MATCH",
        100.0,
        188.0,
        240.0,
        38.0,
        11.0,
        Color::srgba(0.1, 0.16, 0.27, 0.9),
        PANEL_LINE,
    );
    button(
        commands,
        p,
        UiAction::Menu,
        "BACK TO MENU",
        100.0,
        236.0,
        240.0,
        38.0,
        11.0,
        Color::NONE,
        PANEL_LINE,
    );
}

fn spawn_results(commands: &mut Commands, design: Entity) {
    let root = overlay(commands, design, UiScreen::Results);
    let p = panel(commands, root, 400.0, 160.0, 480.0, 400.0);
    ui_text(
        commands,
        p,
        TextKind::Result,
        "MATCH OVER",
        40.0,
        44.0,
        400.0,
        30.0,
        INK,
    );
    text_node(
        commands,
        p,
        "The final score is shown above.",
        40.0,
        100.0,
        400.0,
        12.0,
        INK_DIM,
        Justify::Center,
    );
    button(
        commands,
        p,
        UiAction::Rematch,
        "PLAY AGAIN",
        120.0,
        230.0,
        240.0,
        46.0,
        12.0,
        BLUE.main.with_alpha(0.9),
        BLUE.light.with_alpha(0.4),
    );
    button(
        commands,
        p,
        UiAction::Menu,
        "BACK TO MENU",
        120.0,
        288.0,
        240.0,
        38.0,
        11.0,
        Color::NONE,
        PANEL_LINE,
    );
}

fn spawn_rules(commands: &mut Commands, design: Entity) {
    let root = overlay(commands, design, UiScreen::Rules);
    let p = panel(commands, root, 250.0, 40.0, 780.0, 560.0);
    text_node(
        commands,
        p,
        "THE RULES",
        40.0,
        24.0,
        700.0,
        28.0,
        INK,
        Justify::Center,
    );
    let body = "Both teams line up on their back line. On the whistle, sprint to the centre line and grab one of your three balls. A ball picked up in the rush is inactive until you carry it behind your 3 m attack line.\n\nHit an opponent with a live, armed ball to eliminate them. Catch a live ball and the thrower is out and your first queued teammate re-enters over the back line. Holding a ball lets you block instead of catch.\n\nThe team with the ball advantage has ten seconds to throw or it forfeits every ball it holds. First to 3 sets wins.\n\nBall colours: hot amber with a glow can still get you out. Cold grey with a dashed ring is dead or inactive and safe to pick up.\n\nWASD move | Mouse aim | Hold LMB charge | Shift dash | Space / RMB catch or block";
    commands.spawn((
        Text::new(body),
        TextFont {
            font_size: FontSize::Px(13.0),
            ..default()
        },
        TextColor(INK_DIM),
        TextLayout::new(Justify::Left, LineBreak::WordBoundary),
        Node {
            position_type: PositionType::Absolute,
            left: Val::Px(40.0),
            top: Val::Px(86.0),
            width: Val::Px(700.0),
            ..default()
        },
        ChildOf(p),
    ));
    button(
        commands,
        p,
        UiAction::Back,
        "BACK",
        290.0,
        506.0,
        200.0,
        38.0,
        11.0,
        BLUE.main.with_alpha(0.85),
        BLUE.light.with_alpha(0.4),
    );
}

fn spawn_topbar(commands: &mut Commands, design: Entity) {
    let root = commands
        .spawn((
            TopBarRoot,
            Node {
                position_type: PositionType::Absolute,
                left: Val::Px(0.0),
                top: Val::Px(0.0),
                width: Val::Px(UI_W),
                height: Val::Px(UI_H),
                ..default()
            },
            Visibility::Hidden,
            ChildOf(design),
        ))
        .id();
    for (index, (action, label)) in [
        (UiAction::Pause, "II"),
        (UiAction::Fullscreen, "FS"),
        (UiAction::ToggleMute, "SND"),
    ]
    .into_iter()
    .enumerate()
    {
        let x = 1126.0 + index as f32 * 44.0;
        let e = commands
            .spawn((
                Interaction::default(),
                UiActionButton(action),
                ButtonBase(Color::srgba(5.0 / 255.0, 8.0 / 255.0, 14.0 / 255.0, 0.6)),
                Node {
                    position_type: PositionType::Absolute,
                    left: Val::Px(x),
                    top: Val::Px(78.0),
                    width: Val::Px(32.0),
                    height: Val::Px(32.0),
                    justify_content: JustifyContent::Center,
                    align_items: AlignItems::Center,
                    border: UiRect::all(Val::Px(1.0)),
                    border_radius: BorderRadius::MAX,
                    ..default()
                },
                BackgroundColor(Color::srgba(5.0 / 255.0, 8.0 / 255.0, 14.0 / 255.0, 0.6)),
                BorderColor::all(PANEL_LINE),
                ChildOf(root),
            ))
            .id();
        let child = text_node(
            commands,
            e,
            label,
            0.0,
            9.0,
            32.0,
            8.0,
            INK_DIM,
            Justify::Center,
        );
        if action == UiAction::ToggleMute {
            commands.entity(child).insert(UiText(TextKind::Sound));
        }
    }
}

fn spawn_touch(commands: &mut Commands, design: Entity) {
    let root = commands
        .spawn((
            TouchRoot,
            Node {
                position_type: PositionType::Absolute,
                left: Val::Px(0.0),
                top: Val::Px(0.0),
                width: Val::Px(UI_W),
                height: Val::Px(UI_H),
                ..default()
            },
            Visibility::Hidden,
            ChildOf(design),
        ))
        .id();

    touch_circle(
        commands,
        root,
        150.0,
        552.0,
        86.0,
        Color::srgba(0.1, 0.16, 0.27, 0.28),
        PANEL_LINE,
    );
    let knob = commands
        .spawn((
            StickKnob,
            Node {
                position_type: PositionType::Absolute,
                left: Val::Px(150.0 - 36.0),
                top: Val::Px(552.0 - 36.0),
                width: Val::Px(72.0),
                height: Val::Px(72.0),
                border: UiRect::all(Val::Px(1.0)),
                border_radius: BorderRadius::MAX,
                ..default()
            },
            BackgroundColor(Color::srgba(0.58, 0.68, 0.82, 0.18)),
            BorderColor::all(INK.with_alpha(0.3)),
            ChildOf(root),
        ))
        .id();
    let _ = knob;

    touch_circle(
        commands,
        root,
        1120.0,
        556.0,
        62.0,
        Color::srgba(0.984, 0.749, 0.141, 0.22),
        AMBER.with_alpha(0.6),
    );
    touch_circle(
        commands,
        root,
        1000.0,
        646.0,
        34.0,
        Color::srgba(0.58, 0.68, 0.82, 0.16),
        INK_DIM.with_alpha(0.4),
    );
    touch_circle(
        commands,
        root,
        1190.0,
        630.0,
        34.0,
        Color::srgba(0.58, 0.68, 0.82, 0.16),
        INK_DIM.with_alpha(0.4),
    );

    touch_label(commands, root, "THROW", 1120.0, 556.0, 10.0, AMBER_LIGHT);
    touch_label(commands, root, "DASH", 1000.0, 646.0, 8.0, INK_DIM);
    touch_label(commands, root, "CATCH", 1190.0, 630.0, 8.0, INK_DIM);
}

fn touch_circle(
    commands: &mut Commands,
    parent: Entity,
    cx: f32,
    cy: f32,
    r: f32,
    bg: Color,
    border: Color,
) {
    commands.spawn((
        Node {
            position_type: PositionType::Absolute,
            left: Val::Px(cx - r),
            top: Val::Px(cy - r),
            width: Val::Px(r * 2.0),
            height: Val::Px(r * 2.0),
            border: UiRect::all(Val::Px(1.0)),
            border_radius: BorderRadius::MAX,
            ..default()
        },
        BackgroundColor(bg),
        BorderColor::all(border),
        ChildOf(parent),
    ));
}

fn touch_label(
    commands: &mut Commands,
    parent: Entity,
    text: &str,
    cx: f32,
    cy: f32,
    size: f32,
    color: Color,
) {
    text_node(
        commands,
        parent,
        text,
        cx - 60.0,
        cy - size * 0.7,
        120.0,
        size,
        color,
        Justify::Center,
    );
}

fn spawn_rotate(commands: &mut Commands, design: Entity) {
    let root = commands
        .spawn((
            RotateRoot,
            Node {
                position_type: PositionType::Absolute,
                left: Val::Px(0.0),
                top: Val::Px(0.0),
                width: Val::Px(UI_W),
                height: Val::Px(UI_H),
                justify_content: JustifyContent::Center,
                align_items: AlignItems::Center,
                flex_direction: FlexDirection::Column,
                ..default()
            },
            BackgroundColor(Color::srgba(4.0 / 255.0, 7.0 / 255.0, 12.0 / 255.0, 0.94)),
            Visibility::Hidden,
            GlobalZIndex(100),
            ChildOf(design),
        ))
        .id();
    text_node(
        commands,
        root,
        "ROTATE YOUR PHONE",
        240.0,
        300.0,
        800.0,
        28.0,
        INK,
        Justify::Center,
    );
    text_node(
        commands,
        root,
        "Landscape gives you room for the stick, throw and catch controls.",
        240.0,
        348.0,
        800.0,
        13.0,
        INK_DIM,
        Justify::Center,
    );
}

fn spawn_flash(commands: &mut Commands, root: Entity) {
    commands.spawn((
        FlashOverlay,
        Node {
            position_type: PositionType::Absolute,
            left: Val::Px(0.0),
            top: Val::Px(0.0),
            width: percent(100),
            height: percent(100),
            ..default()
        },
        BackgroundColor(Color::srgba(1.0, 1.0, 1.0, 0.0)),
        Visibility::Hidden,
        GlobalZIndex(1000),
        ChildOf(root),
    ));
}

pub fn update_layout(
    windows: Query<&Window, With<PrimaryWindow>>,
    touches: Res<Touches>,
    mut state: ResMut<ClientState>,
    mut scale: ResMut<UiScale>,
    mut flash: Query<(&mut BackgroundColor, &mut Visibility), With<FlashOverlay>>,
    frame: Res<ViewFrame>,
) {
    let Ok(window) = windows.single() else {
        return;
    };
    scale.0 = ui_scale(window);
    if window.width() < 980.0 || touches.iter().next().is_some() {
        state.show_touch = true;
    }
    state.portrait = state.show_touch && window.height() > window.width();
    let _ = ui_offset(window);
    for (mut color, mut visibility) in &mut flash {
        let flash = frame.0.feedback.flash as f32;
        if flash <= 0.01 {
            *visibility = Visibility::Hidden;
        } else {
            *visibility = Visibility::Visible;
            color.0 = Color::srgba(1.0, 1.0, 1.0, (flash * 0.28).min(0.3));
        }
    }
}

pub fn update_screens(
    mut state: ResMut<ClientState>,
    frame: Res<ViewFrame>,
    mut roots: Query<
        (&ScreenRoot, &mut Visibility),
        (
            Without<HudRoot>,
            Without<TopBarRoot>,
            Without<TouchRoot>,
            Without<RotateRoot>,
        ),
    >,
    mut hud: Query<
        &mut Visibility,
        (
            With<HudRoot>,
            Without<ScreenRoot>,
            Without<TopBarRoot>,
            Without<TouchRoot>,
            Without<RotateRoot>,
        ),
    >,
    mut topbar: Query<
        &mut Visibility,
        (
            With<TopBarRoot>,
            Without<ScreenRoot>,
            Without<HudRoot>,
            Without<TouchRoot>,
            Without<RotateRoot>,
        ),
    >,
    mut touch: Query<
        &mut Visibility,
        (
            With<TouchRoot>,
            Without<ScreenRoot>,
            Without<HudRoot>,
            Without<TopBarRoot>,
            Without<RotateRoot>,
        ),
    >,
    mut rotate: Query<
        &mut Visibility,
        (
            With<RotateRoot>,
            Without<ScreenRoot>,
            Without<HudRoot>,
            Without<TopBarRoot>,
            Without<TouchRoot>,
        ),
    >,
    mut last_phase: Local<Option<Phase>>,
) {
    let phase = frame.0.phase;
    if *last_phase != Some(phase) {
        *last_phase = Some(phase);
        match phase {
            Phase::Menu => state.screen = UiScreen::Menu,
            Phase::Paused => state.screen = UiScreen::Pause,
            Phase::MatchOver => state.screen = UiScreen::Results,
            _ if state.screen != UiScreen::Rules => state.screen = UiScreen::None,
            _ => {}
        }
    }

    let gameplay = matches!(phase, Phase::Playing | Phase::Countdown | Phase::SetOver);
    let menu_open = state.screen == UiScreen::Menu;
    let pause_open = state.screen == UiScreen::Pause && phase != Phase::Menu;
    let results_open = state.screen == UiScreen::Results && phase == Phase::MatchOver;
    let rules_open = state.screen == UiScreen::Rules;
    for (root, mut visibility) in &mut roots {
        let visible = match root.0 {
            UiScreen::None => false,
            UiScreen::Menu => menu_open,
            UiScreen::Pause => pause_open,
            UiScreen::Results => results_open,
            UiScreen::Rules => rules_open,
        };
        *visibility = if visible {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }
    for mut visibility in &mut hud {
        *visibility = Visibility::Visible;
    }
    for mut visibility in &mut topbar {
        *visibility = if gameplay && !rules_open && state.screen != UiScreen::Pause {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }
    for mut visibility in &mut touch {
        *visibility =
            if gameplay && state.show_touch && !rules_open && state.screen == UiScreen::None {
                Visibility::Visible
            } else {
                Visibility::Hidden
            };
    }
    for mut visibility in &mut rotate {
        *visibility = if state.portrait && state.show_touch {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }
}

pub fn update_texts(
    state: Res<ClientState>,
    frame: Res<ViewFrame>,
    time: Res<Time>,
    mut query: Query<(&UiText, &mut Text, &mut TextColor)>,
) {
    let now = time.elapsed_secs();
    let f = &frame.0;
    for (kind, mut text, mut color) in &mut query {
        let (value, tint) = match kind.0 {
            TextKind::Connection => {
                let value = if state.screen == UiScreen::Menu {
                    format!("ONLINE | {}", state.connection.label())
                } else {
                    state.connection.label().to_string()
                };
                let tint = match state.connection {
                    ConnectionState::Online => BLUE.light,
                    ConnectionState::Error | ConnectionState::Offline => DANGER,
                    _ => INK_DIM,
                };
                (value, tint)
            }
            TextKind::PlayerName => {
                let value = if state.editing_name {
                    let caret = if (now * 2.0) as i32 % 2 == 0 {
                        "|"
                    } else {
                        " "
                    };
                    format!("{}{}", state.name_draft, caret)
                } else if state.player_name.is_empty() {
                    "Crispy".to_string()
                } else {
                    state.player_name.clone()
                };
                (value, if state.editing_name { INK } else { INK_DIM })
            }
            TextKind::SetLabel => (
                format!("SET {} | {}", f.set, f.difficulty.label.to_uppercase()),
                INK_DIM,
            ),
            TextKind::Clock => {
                let shot = f.shot.team.is_some() && f.shot.time_left > 0.0;
                let value = if shot {
                    format!("{}", f.shot.time_left.ceil() as i32)
                } else if f.phase == Phase::Menu {
                    "--".to_string()
                } else {
                    format_clock(f.set_elapsed)
                };
                let tint = if shot && f.shot.time_left <= SHOT_CLOCK_WARN {
                    DANGER
                } else if shot {
                    f.shot.team.map(|team| palette(team).main).unwrap_or(INK)
                } else {
                    INK
                };
                (value, tint)
            }
            TextKind::ShotLabel => (
                if f.shot.team.is_some() && f.shot.time_left > 0.0 {
                    "SHOT CLOCK".to_string()
                } else {
                    "SET TIME".to_string()
                },
                INK_FAINT,
            ),
            TextKind::Rush => (
                "OPENING RUSH".to_string(),
                AMBER.with_alpha(if f.rush_active { 0.85 } else { 0.0 }),
            ),
            TextKind::Sudden => (
                "SUDDEN DEATH | NO BLOCKING".to_string(),
                DANGER.with_alpha(if f.sudden_death { 0.9 } else { 0.0 }),
            ),
            TextKind::Hint => (hint_text(f), INK_DIM.with_alpha(0.65)),
            TextKind::BlueName => ("BLUE".to_string(), BLUE.main),
            TextKind::RedName => ("RED".to_string(), RED.main),
            TextKind::Result => {
                let value = match f.match_winner {
                    Some(Team::Blue) => "BLUE WINS".to_string(),
                    Some(Team::Red) => "RED WINS".to_string(),
                    None => {
                        if f.phase == Phase::MatchOver {
                            "MATCH OVER".to_string()
                        } else {
                            "RESULTS".to_string()
                        }
                    }
                };
                let tint = match f.match_winner {
                    Some(team) => palette(team).main,
                    None => INK,
                };
                (value, tint)
            }
            TextKind::Banner => {
                let (value, alpha) = match f.phase {
                    Phase::Countdown => ("GET READY".to_string(), 0.9),
                    Phase::SetOver => (
                        match f.last_set_winner {
                            Some(team) => format!("{} TAKES THE SET", team_name(team)),
                            None => "SET OVER".to_string(),
                        },
                        0.9,
                    ),
                    Phase::MatchOver => ("MATCH OVER".to_string(), 0.9),
                    _ => (String::new(), 0.0),
                };
                (value, INK.with_alpha(alpha))
            }
            TextKind::Sound => (
                if state.muted {
                    "MUTE".to_string()
                } else {
                    "SND".to_string()
                },
                INK_DIM,
            ),
            TextKind::Roster { team, index } => {
                let entry = f.roster_for(team).get(index);
                let value = entry
                    .map(|entry| entry.number.to_string())
                    .unwrap_or_default();
                let tint = match entry {
                    Some(entry) if entry.alive => palette(team).main,
                    _ => INK_FAINT.with_alpha(0.45),
                };
                (value, tint)
            }
        };
        if text.0 != value {
            text.0 = value;
        }
        if color.0 != tint {
            color.0 = tint;
        }
    }
}

pub fn update_bars(
    frame: Res<ViewFrame>,
    state: Res<ClientState>,
    mut dots: Query<(&ScoreDot, &mut BackgroundColor), (Without<RosterDot>, Without<NameField>)>,
    mut roster: Query<
        (&RosterDot, &mut BackgroundColor, &mut BorderColor),
        (Without<ScoreDot>, Without<NameField>),
    >,
    mut name: Query<&mut BorderColor, (With<NameField>, Without<ScoreDot>, Without<RosterDot>)>,
    mut knob: Query<&mut Node, With<StickKnob>>,
    input: Res<InputState>,
) {
    let f = &frame.0;
    for (dot, mut color) in &mut dots {
        let lit = dot.index < f.score.get(dot.team) as usize;
        color.0 = if lit {
            palette(dot.team).main
        } else {
            Color::NONE
        };
    }
    for (dot, mut bg, mut border) in &mut roster {
        let entry = f.roster_for(dot.team).get(dot.index);
        let alive = entry.map(|entry| entry.alive).unwrap_or(false);
        let you = entry.map(|entry| entry.you).unwrap_or(false);
        bg.0 = if alive {
            palette(dot.team).main.with_alpha(0.9)
        } else {
            Color::srgba(10.0 / 255.0, 16.0 / 255.0, 28.0 / 255.0, 0.9)
        };
        border.top = if you {
            INK.with_alpha(0.6)
        } else if alive {
            Color::NONE
        } else {
            INK_FAINT.with_alpha(0.28)
        };
        border.right = border.top;
        border.bottom = border.top;
        border.left = border.top;
    }
    for mut border in &mut name {
        border.top = if state.editing_name {
            BLUE.main.with_alpha(0.85)
        } else {
            INK_FAINT.with_alpha(0.24)
        };
        border.right = border.top;
        border.bottom = border.top;
        border.left = border.top;
    }
    for mut node in &mut knob {
        node.left = Val::Px(150.0 - 36.0 + input.touch_mx * 50.0);
        node.top = Val::Px(552.0 - 36.0 + input.touch_my * 50.0);
    }
}

pub fn update_button_colors(
    mut buttons: Query<(&Interaction, &ButtonBase, &mut BackgroundColor), With<UiActionButton>>,
) {
    for (interaction, base, mut color) in &mut buttons {
        let value = match *interaction {
            Interaction::Pressed => base.0.with_alpha((base.0.alpha() + 0.2).min(1.0)),
            Interaction::Hovered => base.0.with_alpha((base.0.alpha() + 0.1).min(1.0)),
            Interaction::None => base.0,
        };
        if color.0 != value {
            color.0 = value;
        }
    }
}

pub fn handle_actions(
    mut buttons: Query<(&Interaction, &UiActionButton), Changed<Interaction>>,
    connection: Option<Res<StdbConnection<DbConnection>>>,
    mut state: ResMut<ClientState>,
    mut window: Query<&mut Window, With<PrimaryWindow>>,
    mut input: ResMut<InputState>,
    _time: Res<Time>,
) {
    for (interaction, action) in &mut buttons {
        if *interaction != Interaction::Pressed {
            continue;
        }
        match action.0 {
            UiAction::StartMatch | UiAction::Rematch => {
                if let Some(connection) = connection.as_deref() {
                    request_start_match(Some(connection));
                }
            }
            UiAction::Rules => state.screen = UiScreen::Rules,
            UiAction::Back => state.screen = UiScreen::Menu,
            UiAction::Resume => state.screen = UiScreen::None,
            UiAction::Pause => state.screen = UiScreen::Pause,
            UiAction::Menu => state.screen = UiScreen::Menu,
            UiAction::Fullscreen => {
                if let Ok(mut window) = window.single_mut() {
                    window.mode = match window.mode {
                        WindowMode::Windowed => {
                            WindowMode::BorderlessFullscreen(MonitorSelection::Primary)
                        }
                        _ => WindowMode::Windowed,
                    };
                }
            }
            UiAction::ToggleMute => {
                state.muted = !state.muted;
                platform::save_muted(state.muted);
            }
            UiAction::EditName => {
                state.editing_name = true;
                state.name_draft = state.player_name.clone();
                state.screen = UiScreen::Menu;
            }
            UiAction::SubmitName => {
                let name = clean_name(&state.name_draft);
                state.player_name = name.clone();
                state.editing_name = false;
                platform::save_player_name(&name);
                if let Some(connection) = connection.as_deref() {
                    request_set_name(Some(connection), &name);
                }
            }
        }
        input.mouse_used = false;
    }
}

pub fn name_input(
    mut events: MessageReader<KeyboardInput>,
    mut state: ResMut<ClientState>,
    connection: Option<Res<StdbConnection<DbConnection>>>,
) {
    for event in events.read() {
        if !state.editing_name || event.state != ButtonState::Pressed {
            continue;
        }
        match event.key_code {
            KeyCode::Escape => {
                state.editing_name = false;
                state.name_draft.clear();
            }
            KeyCode::Enter => {
                let name = clean_name(&state.name_draft);
                state.player_name = name.clone();
                state.editing_name = false;
                platform::save_player_name(&name);
                if let Some(connection) = connection.as_deref() {
                    request_set_name(Some(connection), &name);
                }
            }
            KeyCode::Backspace => {
                state.name_draft.pop();
            }
            _ => {
                if let Some(text) = &event.text {
                    for character in text.chars() {
                        if !character.is_control()
                            && state.name_draft.chars().count()
                                < dodgeball_sim::constants::PLAYER_NAME_MAX
                        {
                            state.name_draft.push(character);
                        }
                    }
                }
            }
        }
    }
}

pub fn format_clock(seconds: f64) -> String {
    let total = seconds.max(0.0).floor() as u32;
    format!("{}:{:02}", total / 60, total % 60)
}

fn hint_text(f: &dodgeball_sim::snapshot::Frame) -> String {
    if let Some(player) = f.players.iter().find(|player| player.tag.is_you) {
        if !player.condition.alive && matches!(f.phase, Phase::Playing | Phase::SetOver) {
            return "YOU ARE OUT — A CATCH PUTS YOU BACK IN".to_string();
        }
        if f.phase == Phase::Playing && f.rush_active && player.carry.ball.is_none() {
            return "OPENING RUSH — GRAB A BALL!".to_string();
        }
        if f.phase == Phase::Playing && player.carry.ball.is_some() {
            if let Some(ball) = f
                .balls
                .iter()
                .find(|ball| Some(ball.id) == player.carry.ball)
            {
                if !ball.state.armed {
                    return "CARRY IT BEHIND THE ATTACK LINE TO ARM IT".to_string();
                }
            }
        }
        if f.phase == Phase::Playing && f.shot.team == Some(player.tag.team) {
            return format!("{} ADVANTAGE — THROW THE BALL!", team_name(player.tag.team));
        }
    }
    "WASD MOVE | HOLD LMB CHARGE | SHIFT DASH | SPACE CATCH / BLOCK".to_string()
}

trait FrameExt {
    fn roster_for(&self, team: Team) -> &Vec<dodgeball_sim::snapshot::HudPlayerOut>;
}

impl FrameExt for dodgeball_sim::snapshot::Frame {
    fn roster_for(&self, team: Team) -> &Vec<dodgeball_sim::snapshot::HudPlayerOut> {
        match team {
            Team::Blue => &self.roster.blue,
            Team::Red => &self.roster.red,
        }
    }
}

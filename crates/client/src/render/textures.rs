//! Procedural textures. Keeping the static court and simple sprites as generated
//! images means the game has no external art assets on either target.

use bevy::asset::RenderAssetUsages;
use bevy::prelude::*;
use bevy::render::render_resource::{Extent3d, TextureDimension, TextureFormat};

use crate::consts::{
    ATTACK_LINE, BALL_MARK_GAP, COURT_BOTTOM, COURT_CX, COURT_CY, COURT_H, COURT_RIGHT, COURT_W,
    COURT_X, COURT_Y, UI_H, UI_W,
};

#[derive(Resource, Clone)]
pub struct WorldTextures {
    pub court: Handle<Image>,
    pub circle: Handle<Image>,
    pub square: Handle<Image>,
    pub ring: Handle<Image>,
    pub glow: Handle<Image>,
    pub player_blue: Handle<Image>,
    pub player_red: Handle<Image>,
    pub ball_warm: Handle<Image>,
    pub ball_cold: Handle<Image>,
}

pub fn setup_textures(mut commands: Commands, mut images: ResMut<Assets<Image>>) {
    let court = images.add(court_image());
    let circle = images.add(circle_image(64, [255, 255, 255]));
    let square = images.add(square_image());
    let ring = images.add(ring_image());
    let glow = images.add(glow_image());
    let player_blue = images.add(player_image([91, 147, 255], [195, 213, 255], [29, 63, 143]));
    let player_red = images.add(player_image([255, 95, 115], [255, 194, 202], [143, 27, 45]));
    let ball_warm = images.add(ball_image(true));
    let ball_cold = images.add(ball_image(false));

    commands.insert_resource(WorldTextures {
        court,
        circle,
        square,
        ring,
        glow,
        player_blue,
        player_red,
        ball_warm,
        ball_cold,
    });
}

fn image(width: u32, height: u32) -> Image {
    Image::new_fill(
        Extent3d {
            width,
            height,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        &[0, 0, 0, 0],
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::MAIN_WORLD | RenderAssetUsages::RENDER_WORLD,
    )
}

fn put(data: &mut [u8], width: u32, x: i32, y: i32, color: [u8; 4], alpha: f32) {
    let height = data.len() as u32 / (width * 4);
    if x < 0 || y < 0 || x >= width as i32 || y >= height as i32 {
        return;
    }
    let index = ((y as u32 * width + x as u32) * 4) as usize;
    let a = (color[3] as f32 / 255.0 * alpha.clamp(0.0, 1.0)).clamp(0.0, 1.0);
    if a <= 0.0 {
        return;
    }
    let dst_a = data[index + 3] as f32 / 255.0;
    let out_a = a + dst_a * (1.0 - a);
    if out_a <= 0.0 {
        return;
    }
    for channel in 0..3 {
        let src = color[channel] as f32 / 255.0;
        let dst = data[index + channel] as f32 / 255.0;
        let out = (src * a + dst * dst_a * (1.0 - a)) / out_a;
        data[index + channel] = (out * 255.0).round() as u8;
    }
    data[index + 3] = (out_a * 255.0).round() as u8;
}

fn rounded_mask(x: f32, y: f32, rx: f32, ry: f32, rw: f32, rh: f32, radius: f32) -> f32 {
    if x < rx || x >= rx + rw || y < ry || y >= ry + rh {
        return 0.0;
    }
    let mut dx = 0.0;
    let mut dy = 0.0;
    if x < rx + radius {
        dx = rx + radius - x;
    } else if x > rx + rw - radius {
        dx = x - (rx + rw - radius);
    }
    if y < ry + radius {
        dy = ry + radius - y;
    } else if y > ry + rh - radius {
        dy = y - (ry + rh - radius);
    }
    if dx * dx + dy * dy <= radius * radius {
        1.0
    } else {
        0.0
    }
}

fn fill_rounded(
    data: &mut [u8],
    width: u32,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    radius: f32,
    color: [u8; 4],
    alpha: f32,
) {
    for py in y.floor() as i32..(y + h).ceil() as i32 {
        for px in x.floor() as i32..(x + w).ceil() as i32 {
            if rounded_mask(px as f32 + 0.5, py as f32 + 0.5, x, y, w, h, radius) > 0.0 {
                put(data, width, px, py, color, alpha);
            }
        }
    }
}

fn fill_circle(
    data: &mut [u8],
    width: u32,
    cx: f32,
    cy: f32,
    radius: f32,
    color: [u8; 4],
    alpha: f32,
) {
    for py in (cy - radius).floor() as i32..(cy + radius).ceil() as i32 {
        for px in (cx - radius).floor() as i32..(cx + radius).ceil() as i32 {
            let dx = px as f32 + 0.5 - cx;
            let dy = py as f32 + 0.5 - cy;
            let d = (dx * dx + dy * dy).sqrt();
            let coverage = (radius + 0.7 - d).clamp(0.0, 1.0);
            if coverage > 0.0 {
                put(data, width, px, py, color, alpha * coverage);
            }
        }
    }
}

fn line(
    data: &mut [u8],
    width: u32,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    thickness: f32,
    color: [u8; 4],
    alpha: f32,
) {
    let steps = ((x1 - x0).abs().max((y1 - y0).abs()) * 1.5).ceil().max(1.0) as i32;
    for i in 0..=steps {
        let t = i as f32 / steps as f32;
        fill_circle(
            data,
            width,
            x0 + (x1 - x0) * t,
            y0 + (y1 - y0) * t,
            thickness * 0.5,
            color,
            alpha,
        );
    }
}

fn court_image() -> Image {
    let width = UI_W as u32;
    let height = UI_H as u32;
    let mut image = image(width, height);
    let data = image.data.as_mut().expect("image data");
    let data = &mut data[..];

    for y in 0..height {
        let t = y as f32 / height as f32;
        let color = if t < 0.5 {
            mix([10, 16, 29], [7, 12, 21], t * 2.0)
        } else {
            mix([7, 12, 21], [4, 7, 12], (t - 0.5) * 2.0)
        };
        for x in 0..width {
            let index = ((y * width + x) * 4) as usize;
            data[index..index + 3].copy_from_slice(&color);
            data[index + 3] = 255;
        }
    }

    for y in 0..height {
        for x in 0..width {
            let dx = x as f32 - UI_W * 0.5;
            let dy = y as f32 - (COURT_Y + 80.0);
            let d = (dx * dx + dy * dy).sqrt();
            let a = (1.0 - d / 820.0).clamp(0.0, 1.0).powf(1.7) * 0.08;
            if a > 0.0 {
                put(data, width, x as i32, y as i32, [91, 147, 255, 255], a);
            }
        }
    }

    fill_rounded(
        data,
        width,
        COURT_X - 4.0,
        COURT_Y + 8.0,
        COURT_W + 8.0,
        COURT_H + 6.0,
        28.0,
        [0, 0, 0, 255],
        0.55,
    );
    for py in COURT_Y as i32..COURT_BOTTOM as i32 {
        let t = (py as f32 - COURT_Y) / COURT_H;
        let color = if t < 0.45 {
            mix([23, 32, 50], [18, 27, 44], t / 0.45)
        } else {
            mix([18, 27, 44], [12, 20, 33], (t - 0.45) / 0.55)
        };
        for px in COURT_X as i32..COURT_RIGHT as i32 {
            if rounded_mask(
                px as f32 + 0.5,
                py as f32 + 0.5,
                COURT_X,
                COURT_Y,
                COURT_W,
                COURT_H,
                24.0,
            ) > 0.0
            {
                put(
                    data,
                    width,
                    px,
                    py,
                    [color[0], color[1], color[2], 255],
                    1.0,
                );
            }
        }
    }

    for py in COURT_Y as i32..COURT_BOTTOM as i32 {
        for px in COURT_X as i32..COURT_RIGHT as i32 {
            if rounded_mask(
                px as f32 + 0.5,
                py as f32 + 0.5,
                COURT_X,
                COURT_Y,
                COURT_W,
                COURT_H,
                24.0,
            ) <= 0.0
            {
                continue;
            }
            let x = px as f32 + 0.5;
            if x < COURT_CX {
                let t = (x - COURT_X) / (COURT_CX - COURT_X);
                put(data, width, px, py, [91, 147, 255, 255], 0.10 * (1.0 - t));
            } else {
                let t = (COURT_RIGHT - x) / (COURT_RIGHT - COURT_CX);
                put(data, width, px, py, [255, 95, 115, 255], 0.10 * (1.0 - t));
            }
        }
    }

    let mut x = COURT_X + 26.0;
    while x < COURT_RIGHT {
        line(
            data,
            width,
            x,
            COURT_Y,
            x,
            COURT_BOTTOM,
            1.0,
            [148, 163, 184, 255],
            0.05,
        );
        x += 62.0;
    }
    let mut y = COURT_Y + 26.0;
    while y < COURT_BOTTOM {
        line(
            data,
            width,
            COURT_X,
            y,
            COURT_RIGHT,
            y,
            1.0,
            [148, 163, 184, 255],
            0.05,
        );
        y += 74.0;
    }

    let attack_blue = COURT_CX - ATTACK_LINE;
    let attack_red = COURT_CX + ATTACK_LINE;
    let mut y = COURT_Y + 10.0;
    while y < COURT_BOTTOM - 10.0 {
        line(
            data,
            width,
            attack_blue,
            y,
            attack_blue,
            (y + 9.0).min(COURT_BOTTOM - 10.0),
            2.0,
            [91, 147, 255, 255],
            0.28,
        );
        line(
            data,
            width,
            attack_red,
            y,
            attack_red,
            (y + 9.0).min(COURT_BOTTOM - 10.0),
            2.0,
            [255, 95, 115, 255],
            0.28,
        );
        y += 18.0;
    }

    line(
        data,
        width,
        COURT_CX,
        COURT_Y + 8.0,
        COURT_CX,
        COURT_BOTTOM - 8.0,
        3.0,
        [226, 232, 240, 255],
        0.14,
    );
    for i in -1..=1 {
        let y = COURT_CY + i as f32 * BALL_MARK_GAP;
        line(
            data,
            width,
            COURT_CX - 9.0,
            y,
            COURT_CX + 9.0,
            y,
            2.0,
            [226, 232, 240, 255],
            0.22,
        );
    }
    for py in (COURT_CY - 88.0) as i32..(COURT_CY + 88.0) as i32 {
        for px in (COURT_CX - 88.0) as i32..(COURT_CX + 88.0) as i32 {
            let dx = px as f32 + 0.5 - COURT_CX;
            let dy = py as f32 + 0.5 - COURT_CY;
            let d = (dx * dx + dy * dy).sqrt();
            let coverage = (2.0 - (d - 86.0).abs()).clamp(0.0, 1.0);
            if coverage > 0.0 {
                put(data, width, px, py, [226, 232, 240, 255], 0.07 * coverage);
            }
        }
    }

    for py in (COURT_Y - 2.0) as i32..(COURT_BOTTOM + 2.0) as i32 {
        for px in (COURT_X - 2.0) as i32..(COURT_RIGHT + 2.0) as i32 {
            let outer = rounded_mask(
                px as f32 + 0.5,
                py as f32 + 0.5,
                COURT_X,
                COURT_Y,
                COURT_W,
                COURT_H,
                24.0,
            );
            let inner = rounded_mask(
                px as f32 + 0.5,
                py as f32 + 0.5,
                COURT_X + 2.0,
                COURT_Y + 2.0,
                COURT_W - 4.0,
                COURT_H - 4.0,
                22.0,
            );
            if outer > 0.0 && inner <= 0.0 {
                put(data, width, px, py, [148, 163, 184, 255], 0.24);
            }
        }
    }

    image
}

fn circle_image(size: u32, rgb: [u8; 3]) -> Image {
    let mut image = image(size, size);
    let data = image.data.as_mut().expect("image data");
    let data = &mut data[..];
    let center = size as f32 * 0.5;
    let radius = size as f32 * 0.46;
    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 + 0.5 - center;
            let dy = y as f32 + 0.5 - center;
            let d = (dx * dx + dy * dy).sqrt();
            let a = (radius + 0.9 - d).clamp(0.0, 1.0);
            if a > 0.0 {
                put(
                    data,
                    size,
                    x as i32,
                    y as i32,
                    [rgb[0], rgb[1], rgb[2], 255],
                    a,
                );
            }
        }
    }
    image
}

fn square_image() -> Image {
    let mut image = image(8, 8);
    let data = image.data.as_mut().expect("image data");
    let data = &mut data[..];
    for y in 0..8 {
        for x in 0..8 {
            put(data, 8, x, y, [255, 255, 255, 255], 1.0);
        }
    }
    image
}

fn ring_image() -> Image {
    let size = 128;
    let mut image = image(size, size);
    let data = image.data.as_mut().expect("image data");
    let data = &mut data[..];
    let center = size as f32 * 0.5;
    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 + 0.5 - center;
            let dy = y as f32 + 0.5 - center;
            let d = (dx * dx + dy * dy).sqrt();
            let a = (2.0 - (d - 54.0).abs()).clamp(0.0, 1.0);
            if a > 0.0 {
                put(data, size, x as i32, y as i32, [255, 255, 255, 255], a);
            }
        }
    }
    image
}

fn glow_image() -> Image {
    let size = 128;
    let mut image = image(size, size);
    let data = image.data.as_mut().expect("image data");
    let data = &mut data[..];
    let center = size as f32 * 0.5;
    for y in 0..size {
        for x in 0..size {
            let dx = x as f32 + 0.5 - center;
            let dy = y as f32 + 0.5 - center;
            let d = (dx * dx + dy * dy).sqrt() / (size as f32 * 0.5);
            let a = (1.0 - d).clamp(0.0, 1.0).powf(2.2) * 0.55;
            if a > 0.0 {
                put(data, size, x as i32, y as i32, [251, 191, 36, 255], a);
            }
        }
    }
    image
}

fn player_image(main: [u8; 3], light: [u8; 3], dark: [u8; 3]) -> Image {
    let size = 128;
    let mut image = image(size, size);
    let data = image.data.as_mut().expect("image data");
    let data = &mut data[..];
    let center = size as f32 * 0.5;
    let radius = size as f32 * 0.46;
    for y in 0..size {
        for x in 0..size {
            let dx = (x as f32 + 0.5 - center) / radius;
            let dy = (y as f32 + 0.5 - center) / radius;
            let d = (dx * dx + dy * dy).sqrt();
            if d > 1.0 {
                continue;
            }
            let gradient = ((dx + dy) * 0.32 + 0.5).clamp(0.0, 1.0);
            let color = if gradient < 0.45 {
                mix(light, main, gradient / 0.45)
            } else {
                mix(main, dark, (gradient - 0.45) / 0.55)
            };
            let a = ((1.0 - d) * radius + 1.2).clamp(0.0, 1.0);
            put(
                data,
                size,
                x as i32,
                y as i32,
                [color[0], color[1], color[2], 255],
                a,
            );
        }
    }
    image
}

fn ball_image(warm: bool) -> Image {
    let size = 64;
    let mut image = image(size, size);
    let data = image.data.as_mut().expect("image data");
    let data = &mut data[..];
    let center = size as f32 * 0.5;
    let radius = size as f32 * 0.44;
    for y in 0..size {
        for x in 0..size {
            let dx = (x as f32 + 0.5 - center) / radius;
            let dy = (y as f32 + 0.5 - center) / radius;
            let d = (dx * dx + dy * dy).sqrt();
            if d > 1.0 {
                continue;
            }
            let color = if warm {
                if (dy * radius).abs() < 2.0 {
                    [92, 52, 10]
                } else if d < 0.35 {
                    mix([255, 246, 207], [251, 191, 36], d / 0.35)
                } else {
                    mix([251, 191, 36], [185, 108, 8], (d - 0.35) / 0.65)
                }
            } else if (dy * radius).abs() < 2.0 {
                [34, 48, 69]
            } else if d < 0.38 {
                mix([248, 250, 252], [148, 163, 184], d / 0.38)
            } else {
                mix([148, 163, 184], [63, 76, 96], (d - 0.38) / 0.62)
            };
            let a = ((1.0 - d) * radius + 1.2).clamp(0.0, 1.0);
            put(
                data,
                size,
                x as i32,
                y as i32,
                [color[0], color[1], color[2], 255],
                a,
            );
        }
    }
    image
}

fn mix(a: [u8; 3], b: [u8; 3], t: f32) -> [u8; 3] {
    let t = t.clamp(0.0, 1.0);
    [
        (a[0] as f32 + (b[0] as f32 - a[0] as f32) * t) as u8,
        (a[1] as f32 + (b[1] as f32 - a[1] as f32) * t) as u8,
        (a[2] as f32 + (b[2] as f32 - a[2] as f32) * t) as u8,
    ]
}

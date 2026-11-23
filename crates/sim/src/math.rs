pub const TAU: f64 = std::f64::consts::TAU;
pub const PI: f64 = std::f64::consts::PI;

pub fn clamp(value: f64, lo: f64, hi: f64) -> f64 {
    if value < lo {
        lo
    } else if value > hi {
        hi
    } else {
        value
    }
}

pub fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

pub fn damp(current: f64, target: f64, rate: f64, dt: f64) -> f64 {
    lerp(current, target, 1.0 - (-rate * dt).exp())
}

pub fn dist(ax: f64, ay: f64, bx: f64, by: f64) -> f64 {
    (bx - ax).hypot(by - ay)
}

pub fn angle_to(ax: f64, ay: f64, bx: f64, by: f64) -> f64 {
    (by - ay).atan2(bx - ax)
}

pub fn wrap_angle(angle: f64) -> f64 {
    let mut wrapped = (angle + PI) % TAU;
    if wrapped < 0.0 {
        wrapped += TAU;
    }
    wrapped - PI
}

/// Normalised vector plus its original length.
#[derive(Clone, Copy, Debug)]
pub struct Normalised {
    pub x: f64,
    pub y: f64,
    pub l: f64,
}

pub fn norm(x: f64, y: f64) -> Normalised {
    let l = x.hypot(y);
    if l < 1e-6 {
        Normalised { x: 0.0, y: 0.0, l: 0.0 }
    } else {
        Normalised { x: x / l, y: y / l, l }
    }
}

/// Time of closest approach between a moving ball and a roughly static point.
#[derive(Clone, Copy, Debug)]
pub struct Approach {
    pub t: f64,
    pub x: f64,
    pub y: f64,
    pub d: f64,
}

pub fn closest_approach(
    px: f64,
    py: f64,
    bx: f64,
    by: f64,
    bvx: f64,
    bvy: f64,
    max_t: f64,
) -> Approach {
    let rx = px - bx;
    let ry = py - by;
    let vv = bvx * bvx + bvy * bvy;
    if vv < 1e-6 {
        return Approach { t: 0.0, x: bx, y: by, d: rx.hypot(ry) };
    }
    let t = clamp((rx * bvx + ry * bvy) / vv, 0.0, max_t);
    let x = bx + bvx * t;
    let y = by + bvy * t;
    Approach { t, x, y, d: (px - x).hypot(py - y) }
}

pub fn ease_out_cubic(t: f64) -> f64 {
    1.0 - (1.0 - clamp(t, 0.0, 1.0)).powi(3)
}

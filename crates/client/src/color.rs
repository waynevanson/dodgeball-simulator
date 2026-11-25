use bevy::color::Color;

/// Parse the CSS-ish colour strings emitted by the simulation snapshot.
///
/// The simulation intentionally keeps the original strings so the old Canvas
/// renderer and the Rust renderer can share one wire format. This parser covers
/// the formats the game actually emits: `#rgb`, `#rrggbb`, `rgb(...)` and
/// `rgba(...)`.
pub fn parse_css(value: &str) -> Color {
    let value = value.trim();
    if let Some(hex) = value.strip_prefix('#') {
        return parse_hex(hex).unwrap_or(Color::WHITE);
    }
    if let Some(rest) = value
        .strip_prefix("rgba(")
        .or_else(|| value.strip_prefix("rgb("))
    {
        let Some(rest) = rest.strip_suffix(')') else {
            return Color::WHITE;
        };
        let parts: Vec<&str> = rest.split(',').map(str::trim).collect();
        if parts.len() >= 3 {
            let r = parts[0].parse::<f32>().unwrap_or(255.0) / 255.0;
            let g = parts[1].parse::<f32>().unwrap_or(255.0) / 255.0;
            let b = parts[2].parse::<f32>().unwrap_or(255.0) / 255.0;
            let a = parts
                .get(3)
                .and_then(|value| value.parse::<f32>().ok())
                .unwrap_or(1.0);
            return Color::srgba(r, g, b, a);
        }
    }
    Color::WHITE
}

fn parse_hex(hex: &str) -> Option<Color> {
    match hex.len() {
        3 => {
            let r = u8::from_str_radix(&hex[0..1], 16).ok()? * 17;
            let g = u8::from_str_radix(&hex[1..2], 16).ok()? * 17;
            let b = u8::from_str_radix(&hex[2..3], 16).ok()? * 17;
            Some(Color::srgb_u8(r, g, b))
        }
        4 => {
            let r = u8::from_str_radix(&hex[0..1], 16).ok()? * 17;
            let g = u8::from_str_radix(&hex[1..2], 16).ok()? * 17;
            let b = u8::from_str_radix(&hex[2..3], 16).ok()? * 17;
            let a = u8::from_str_radix(&hex[3..4], 16).ok()? * 17;
            Some(Color::srgba_u8(r, g, b, a))
        }
        6 => {
            let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
            let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
            let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
            Some(Color::srgb_u8(r, g, b))
        }
        8 => {
            let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
            let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
            let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
            let a = u8::from_str_radix(&hex[6..8], 16).ok()?;
            Some(Color::srgba_u8(r, g, b, a))
        }
        _ => None,
    }
}

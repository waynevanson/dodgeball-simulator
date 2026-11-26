use bevy::color::Color;

/// Parse the CSS-ish colour strings emitted by the simulation snapshot.
///
/// The simulation keeps CSS-ish colour strings as its wire format. This parser covers
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

#[cfg(test)]
mod tests {
    use super::*;

    fn rgba(color: Color) -> [f32; 4] {
        let color = color.to_srgba();
        [color.red, color.green, color.blue, color.alpha]
    }

    fn assert_rgba(actual: Color, expected: [f32; 4]) {
        let actual = rgba(actual);
        for (actual, expected) in actual.iter().zip(expected) {
            assert!((actual - expected).abs() < 1e-5, "{actual} != {expected}");
        }
    }

    #[test]
    fn parses_short_and_long_hex() {
        assert_rgba(
            parse_css("#abc"),
            [
                0xaa as f32 / 255.0,
                0xbb as f32 / 255.0,
                0xcc as f32 / 255.0,
                1.0,
            ],
        );
        assert_rgba(
            parse_css(" #112233 "),
            [
                0x11 as f32 / 255.0,
                0x22 as f32 / 255.0,
                0x33 as f32 / 255.0,
                1.0,
            ],
        );
        assert_rgba(
            parse_css("#11223344"),
            [
                0x11 as f32 / 255.0,
                0x22 as f32 / 255.0,
                0x33 as f32 / 255.0,
                0x44 as f32 / 255.0,
            ],
        );
    }

    #[test]
    fn parses_rgb_and_rgba() {
        assert_rgba(parse_css("rgb(255, 0, 51)"), [1.0, 0.0, 51.0 / 255.0, 1.0]);
        assert_rgba(
            parse_css("rgba(10,20,30,0.5)"),
            [10.0 / 255.0, 20.0 / 255.0, 30.0 / 255.0, 0.5],
        );
    }

    #[test]
    fn malformed_values_fall_back_to_white() {
        assert_rgba(parse_css(""), [1.0, 1.0, 1.0, 1.0]);
        assert_rgba(parse_css("#12"), [1.0, 1.0, 1.0, 1.0]);
        assert_rgba(parse_css("rgb(1,2)"), [1.0, 1.0, 1.0, 1.0]);
        assert_rgba(parse_css("rgb(1,2,3"), [1.0, 1.0, 1.0, 1.0]);
    }
}

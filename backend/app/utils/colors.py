"""
Utility functions for generating avatar gradient colors.
"""

import colorsys
import random


def generate_avatar_gradient() -> dict[str, str]:
    """
    Generate highly distinguishable gradient colors for patient avatars.

    Uses a curated set of base hues for maximum clinical distinction, critical
    for patient safety so clinicians can instantly identify patients at a glance.

    Colors are generated in HSL space with:
    - Base hues: 9 maximally-separated hues (red, orange, yellow, lime, green, cyan, blue, purple, magenta)
    - Lightness: 45-70% (readable, not too dark or washed out)
    - Saturation: 60-95% (vivid and distinctive)
    - Hue difference: 90-150° (highly contrasting gradients)

    Returns:
        dict: {"colorFrom": "#RRGGBB", "colorTo": "#RRGGBB"}

    Example:
        >>> gradient = generate_avatar_gradient()
        >>> gradient
        {"colorFrom": "#FF6B6B", "colorTo": "#4ECDC4"}
    """
    # Use maximally-separated base hues for clinical distinctiveness
    # These are chosen to be easily distinguishable at a glance
    base_hues = [
        0,  # Red
        30,  # Orange
        60,  # Yellow
        90,  # Lime
        120,  # Green
        180,  # Cyan
        210,  # Sky Blue
        240,  # Blue
        270,  # Purple
        300,  # Magenta
    ]

    # Pick a random base hue and add slight variation (±15°) for uniqueness
    hue1_base = random.choice(base_hues)
    hue1 = (hue1_base + random.uniform(-15, 15)) % 360

    # Generate second hue at least 90° away for maximum contrast
    min_separation = 90
    max_separation = 150
    separation = random.uniform(min_separation, max_separation)
    if random.choice([True, False]):
        hue2 = (hue1 + separation) % 360
    else:
        hue2 = (hue1 - separation) % 360

    # Use high saturation for vividness and moderate lightness for readability
    saturation1 = random.uniform(0.60, 0.95)
    saturation2 = random.uniform(0.60, 0.95)
    lightness1 = random.uniform(0.45, 0.70)
    lightness2 = random.uniform(0.45, 0.70)

    # Convert HSL to RGB
    rgb1 = colorsys.hls_to_rgb(hue1 / 360, lightness1, saturation1)
    rgb2 = colorsys.hls_to_rgb(hue2 / 360, lightness2, saturation2)

    # Convert RGB (0-1) to hex
    def rgb_to_hex(rgb: tuple[float, float, float]) -> str:
        r, g, b = rgb
        return f"#{int(r * 255):02X}{int(g * 255):02X}{int(b * 255):02X}"

    return {
        "colorFrom": rgb_to_hex(rgb1),
        "colorTo": rgb_to_hex(rgb2),
    }


def hsl_to_hex(h: float, s: float, lightness: float) -> str:
    """
    Convert HSL color values to hex string.

    Args:
        h: Hue (0-360)
        s: Saturation (0-1)
        lightness: Lightness (0-1)

    Returns:
        str: Hex color string (e.g., "#FF6B6B")
    """
    rgb = colorsys.hls_to_rgb(h / 360, lightness, s)
    r, g, b = rgb
    return f"#{int(r * 255):02X}{int(g * 255):02X}{int(b * 255):02X}"

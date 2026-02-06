"""
Tests for color generation utility.
"""

import re

from app.utils.colors import generate_avatar_gradient, hsl_to_hex


def test_generate_avatar_gradient():
    """Test that generate_avatar_gradient returns valid gradient colors."""
    gradient = generate_avatar_gradient()

    # Check structure
    assert "colorFrom" in gradient
    assert "colorTo" in gradient

    # Check hex format
    hex_pattern = re.compile(r"^#[0-9A-F]{6}$")
    assert hex_pattern.match(gradient["colorFrom"])
    assert hex_pattern.match(gradient["colorTo"])

    # Check colors are different
    assert gradient["colorFrom"] != gradient["colorTo"]


def test_generate_avatar_gradient_multiple():
    """Test that multiple generations produce different colors."""
    gradients = [generate_avatar_gradient() for _ in range(10)]

    # With random generation, it's extremely unlikely all 10 would be identical
    # Check that at least some are different
    unique_colors_from = set(g["colorFrom"] for g in gradients)
    unique_colors_to = set(g["colorTo"] for g in gradients)

    assert len(unique_colors_from) > 1
    assert len(unique_colors_to) > 1


def test_hsl_to_hex():
    """Test HSL to hex conversion."""
    # Red (hue=0)
    red = hsl_to_hex(0, 1.0, 0.5)
    assert red == "#FF0000"

    # Green (hue=120)
    green = hsl_to_hex(120, 1.0, 0.5)
    assert green == "#00FF00"

    # Blue (hue=240)
    blue = hsl_to_hex(240, 1.0, 0.5)
    assert blue == "#0000FF"

    # Gray (saturation=0)
    gray = hsl_to_hex(0, 0.0, 0.5)
    assert gray == "#808080"

    # White (lightness=1)
    white = hsl_to_hex(0, 0.0, 1.0)
    assert white == "#FFFFFF"

    # Black (lightness=0)
    black = hsl_to_hex(0, 0.0, 0.0)
    assert black == "#000000"

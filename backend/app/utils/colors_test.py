"""
Tests for color generation utility.
"""

from app.utils.colors import generate_avatar_gradient_index


def test_generate_avatar_gradient_index():
    """Test that generate_avatar_gradient_index returns valid index."""
    gradient_index = generate_avatar_gradient_index()

    # Check it's an integer in valid range
    assert isinstance(gradient_index, int)
    assert 0 <= gradient_index < 30


def test_generate_avatar_gradient_index_multiple():
    """Test that multiple generations produce varied indices."""
    indices = [generate_avatar_gradient_index() for _ in range(30)]

    # With 30 generations from range 0-29, we should get some variety
    unique_indices = set(indices)

    # Should have at least 10 unique values out of 30 attempts
    assert len(unique_indices) >= 10
    # All should be in valid range
    assert all(0 <= idx < 30 for idx in indices)

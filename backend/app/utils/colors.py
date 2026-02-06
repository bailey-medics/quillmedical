"""
Utility functions for generating avatar gradient colors.

The frontend defines predefined gradient combinations (indices 0-29).
This module generates random gradient indices for new patients.
"""

import random

# Number of available gradients in frontend
# If you add more gradients to gradients.ts, update this number
GRADIENT_COUNT = 30


def generate_avatar_gradient_index() -> int:
    """
    Generate a random gradient index for patient avatars.

    Returns a random integer from 0 to GRADIENT_COUNT - 1, which maps to
    one of the predefined gradient combinations in the frontend.

    Returns:
        int: Random gradient index (0-29)

    Example:
        >>> index = generate_avatar_gradient_index()
        >>> index
        12
    """
    return random.randint(0, GRADIENT_COUNT - 1)

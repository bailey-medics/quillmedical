"""API compatibility generation tracking.

Computes `required_client_generation` from the `api-compatibility/`
decision files and serves it to clients via the `Compat-Generation`
response header, so a frontend bundle older than the API contract can be
forced to reload.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from app.paths import API_COMPATIBILITY_DIR


def compute_required_client_generation(
    compat_dir: Path = API_COMPATIBILITY_DIR,
) -> int:
    """Compute required_client_generation from decision files.

    Equals the max `generation` among files with `forces_reload: true`,
    or 1 if no such file exists (bootstrap state). Malformed files are
    skipped rather than raising, since CI's validate-compat-files.sh is
    the authority on file well-formedness.
    """
    if not compat_dir.is_dir():
        return 1

    true_generations: list[int] = []
    for file_path in sorted(compat_dir.glob("*.yaml")):
        try:
            data = yaml.safe_load(file_path.read_text())
        except yaml.YAMLError:
            continue
        if not isinstance(data, dict):
            continue
        if data.get("forces_reload") is True:
            generation = data.get("generation")
            if isinstance(generation, int):
                true_generations.append(generation)

    return max(true_generations) if true_generations else 1


REQUIRED_CLIENT_GENERATION = compute_required_client_generation()

#!/usr/bin/env python3
"""Trim the frame baked into teaching question images.

Question images captured out of a document arrive with the cell they sat
in: a one-pixel grey outline all the way round and a strip of white down
one side, a different width in every file. Stretched to fill the page
during an assessment, that reads as a lopsided border. The app adds none
of it, so it cannot be styled away; the files themselves want trimming.

This walks every `question_*` directory beneath the paths it is given and
cuts the frame from each image, on all four sides. A row or column counts
as frame when nearly all of it is light and colourless, which the grey
outline and the white strip both are and tissue is not, however pale.

It only reports unless `--write` is given:

    trim-question-image-frames.py teaching-repos/eoeeta-teaching
    trim-question-image-frames.py --write teaching-repos/eoeeta-teaching

An image that would lose more than a quarter of its width or height is
never written. That much light, colourless edge is more likely to be part
of the picture than a frame, so it is reported for a person to look at.

It is safe to run again: a trimmed image has no frame left to cut. Run it
on a clean working tree, so `git checkout .` undoes it.

Needs Pillow (`python3 -m pip install pillow`), which is not a
dependency of anything else here.

Exit codes: 0 done, 1 something was held back for review or could not be
read, 2 Pillow is missing or no question images were found.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import NamedTuple

try:
    from PIL import Image
except ImportError:  # pragma: no cover - reported in main()
    Image = None  # type: ignore[assignment]

EXTENSIONS = {".png", ".jpg", ".jpeg"}

#: A pixel is frame when every channel is at least this light...
LIGHT_FLOOR = 200
#: ...and the channels differ by less than this, so it has no colour.
MAX_CHROMA = 12
#: The share of a row or column that must be frame pixels to cut it.
FRAME_SHARE = 0.98
#: Never cut more than this share of the width or of the height.
MAX_CUT_SHARE = 0.25
#: Never trim an image down below this many pixels on a side.
MIN_SIDE = 8


class Cut(NamedTuple):
    """How many pixels come off each side."""

    left: int
    top: int
    right: int
    bottom: int

    @property
    def is_nothing(self) -> bool:
        return self == Cut(0, 0, 0, 0)


def is_frame_line(pixels: list[tuple[int, int, int]]) -> bool:
    """Whether one row or column is outline or margin, not picture."""
    if not pixels:
        return False

    frame = sum(
        1
        for red, green, blue in pixels
        if min(red, green, blue) > LIGHT_FLOOR
        and max(red, green, blue) - min(red, green, blue) < MAX_CHROMA
    )

    return frame >= FRAME_SHARE * len(pixels)


def find_cut(image: Image.Image) -> Cut:
    """Work out how much frame sits on each side of an image."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    left, top, right, bottom = 0, 0, width, height

    changed = True

    while changed and right - left > MIN_SIDE and bottom - top > MIN_SIDE:
        changed = False
        if is_frame_line([pixels[left, y] for y in range(top, bottom)]):
            left += 1
            changed = True
        if is_frame_line([pixels[right - 1, y] for y in range(top, bottom)]):
            right -= 1
            changed = True
        if is_frame_line([pixels[x, top] for x in range(left, right)]):
            top += 1
            changed = True
        if is_frame_line([pixels[x, bottom - 1] for x in range(left, right)]):
            bottom -= 1
            changed = True

    return Cut(left, top, width - right, height - bottom)


def cuts_too_much(cut: Cut, width: int, height: int) -> bool:
    """Whether a cut is large enough to be picture rather than frame."""
    return (
        cut.left + cut.right > MAX_CUT_SHARE * width
        or cut.top + cut.bottom > MAX_CUT_SHARE * height
    )


def question_images(roots: list[Path]) -> list[Path]:
    """Every image in a `question_*` directory beneath the given paths."""
    found: set[Path] = set()

    for root in roots:
        # A question directory may be named outright, as well as walked to
        here = [root] if root.name.startswith("question_") else []
        for directory in [*here, *root.rglob("question_*")]:
            if not directory.is_dir():
                continue
            for path in directory.iterdir():
                if path.is_file() and path.suffix.lower() in EXTENSIONS:
                    found.add(path)

    return sorted(found)


def save_trimmed(image: Image.Image, cut: Cut, path: Path) -> None:
    """Write the image back without its frame, in the format it came in."""
    width, height = image.size
    trimmed = image.crop(
        (cut.left, cut.top, width - cut.right, height - cut.bottom)
    )

    if path.suffix.lower() == ".png":
        trimmed.save(path, optimize=True)
    else:
        # A JPEG is encoded again on saving; keep the loss small.
        trimmed.save(path, quality=95, subsampling=0)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Trim the frame baked into teaching question images."
    )
    parser.add_argument(
        "paths",
        nargs="+",
        type=Path,
        help="content repos, modules or assessment directories to walk",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="overwrite the images; without it, only report",
    )
    args = parser.parse_args(argv)

    if Image is None:
        print(
            "Pillow is not installed. Run: python3 -m pip install pillow",
            file=sys.stderr,
        )
        return 2

    missing = [path for path in args.paths if not path.exists()]

    if missing:
        for path in missing:
            print(f"No such path: {path}", file=sys.stderr)
        return 2

    images = question_images(args.paths)

    if not images:
        print("No question images found.", file=sys.stderr)
        return 2

    trimmed = clean = held = failed = 0

    for path in images:
        try:
            with Image.open(path) as image:
                image.load()
                width, height = image.size
                cut = find_cut(image)
                if cut.is_nothing:
                    clean += 1
                    continue
                after = (
                    f"{width}x{height} -> "
                    f"{width - cut.left - cut.right}x"
                    f"{height - cut.top - cut.bottom}"
                )
                sides = (
                    f"left {cut.left}, top {cut.top}, "
                    f"right {cut.right}, bottom {cut.bottom}"
                )
                if cuts_too_much(cut, width, height):
                    held += 1
                    print(f"REVIEW  {path}: {after} ({sides})")
                    continue
                if args.write:
                    save_trimmed(image, cut, path)
                trimmed += 1
                verb = "trimmed" if args.write else "would trim"
                print(f"{verb}  {path}: {after} ({sides})")
        except OSError as error:
            failed += 1
            print(f"FAILED  {path}: {error}", file=sys.stderr)

    verb = "Trimmed" if args.write else "Would trim"
    print(
        f"\n{verb} {trimmed} of {len(images)} images; "
        f"{clean} had no frame, {held} held for review, "
        f"{failed} could not be read."
    )
    if not args.write and trimmed:
        print("Nothing was changed. Pass --write to trim them.")

    return 1 if held or failed else 0


if __name__ == "__main__":
    sys.exit(main())

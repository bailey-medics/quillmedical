#!/usr/bin/env python3
"""Draw a brand's wordmark as an SVG, from the font the brand sets it in.

Each letter's outline is written into the SVG as a path, so the app shows
the name in the brand's font without loading the font itself, and it looks
the same on every device. The ribbon is a fixed height, so the box runs
from a fifth of the capital height above the capitals to just under half
of it below the baseline, where Quill's own name sits in its picture.

    brand-wordmark.py FONT TEXT OUT.svg [--bold UNITS] [--colour HEX]

`--bold` thickens every letter by tracing its outline with a line that
many font units wide, for a font that comes in one weight only. The
letters are spread apart by the same amount, so they keep their spacing.

Needs fontTools (`python3 -m pip install fonttools`), which is not a
dependency of anything else here.
"""

import argparse
import sys
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ABOVE_CAPITALS = 0.2
BELOW_BASELINE = 0.45


def kerning(font: TTFont) -> dict[tuple[str, str], int]:
    """The font's pair kerning, from its `kern` table, if it has one."""
    pairs: dict[tuple[str, str], int] = {}

    if "kern" not in font:
        return pairs

    for table in font["kern"].kernTables:
        pairs.update(table.kernTable)

    return pairs


def wordmark(font_path: Path, text: str, bold: float, colour: str) -> str:
    """The SVG for `text` in the font at `font_path`."""
    font = TTFont(font_path)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    advances = font["hmtx"].metrics
    pairs = kerning(font)
    capitals = font["OS/2"].sCapHeight

    missing = [c for c in text if ord(c) not in cmap]
    if missing:
        raise ValueError(f"The font has no letter for {missing!r}")

    names = [cmap[ord(c)] for c in text]
    x = 0.0
    paths: list[str] = []
    bounds = BoundsPen(glyphs)

    for index, name in enumerate(names):
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        glyphs[name].draw(TransformPen(bounds, (1, 0, 0, 1, x, 0)))
        if pen.getCommands():
            paths.append(pen.getCommands())

        following = names[index + 1] if index + 1 < len(names) else None
        x += advances[name][0] + bold
        if following:
            x += pairs.get((name, following), 0)

    left, _, right, _ = bounds.bounds
    margin = capitals * 0.05 + bold / 2
    top = capitals * (1 + ABOVE_CAPITALS)
    height = top + capitals * BELOW_BASELINE
    width = right - left + 2 * margin
    stroke = f' stroke="{colour}" stroke-width="{bold:g}"' if bold else ""

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="{left - margin:.0f} {-top:.0f} {width:.0f} {height:.0f}" '
        f'role="img" aria-label="{text}">'
        f'<path fill="{colour}"{stroke} d="{" ".join(paths)}"/></svg>\n'
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("font", type=Path)
    parser.add_argument("text")
    parser.add_argument("out", type=Path)
    parser.add_argument("--bold", type=float, default=0)
    parser.add_argument("--colour", default="#ffffff")
    args = parser.parse_args()

    if args.bold < 0:
        parser.error("--bold cannot be negative")

    args.out.write_text(wordmark(args.font, args.text, args.bold, args.colour))

    return 0


if __name__ == "__main__":
    sys.exit(main())

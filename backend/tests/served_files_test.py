"""What the production web server tells a browser about the app's files.

Integration tests against the running end-to-end stack
(``compose.ci.yml``), which serves the built app through
``caddy/prod/Caddyfile``. Each one asks for a file and reads a header,
which no person sees on a screen, so they are not Playwright tests: see
``.claude/rules/e2e.md`` and Phase 9 of
``docs/docs/plans/2026-10-31-passport-landing-views-plan.md``.

- **Caching.** The build names each file after a hash of its contents,
  so the browser may keep it for a year without asking again. The page
  itself and the build manifest have fixed names and must always be
  checked, or nobody would see a new version. The caching rule once
  matched a file name shape the build does not produce, so no app code
  was sent with a cache lifetime at all, and nothing said so.
- **The PDF decoders.** pdf.js fetches two decoders by name only when a
  scanned PDF needs one, so a build that stopped emitting them would go
  unnoticed until somebody opened such a scan.

Run by ``just e2e`` once the stack is up, and by the first leg of the
end-to-end job in ``ci.yml``. Skipped wherever ``E2E_BASE_URL`` is not
set, so ``just ub`` never needs a stack.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass

import pytest

pytestmark = pytest.mark.integration

BASE_URL = os.environ.get("E2E_BASE_URL", "").rstrip("/")

KEEP_FOR_A_YEAR = "public, max-age=31536000, immutable"

#: The two decoders pdf.js asks for by name.
PDF_DECODERS = ("jbig2_nowasm_fallback.js", "openjpeg_nowasm_fallback.js")

if not BASE_URL:
    pytest.skip(
        "E2E_BASE_URL is not set: these run against the end-to-end stack",
        allow_module_level=True,
    )


@dataclass(frozen=True)
class Served:
    """One answer from the web server."""

    status: int
    headers: dict[str, str]
    body: bytes


def fetch(path: str) -> Served:
    """Ask the stack for *path*, as a browser would, and keep the answer.

    An error status is an answer like any other here, so it is returned
    rather than raised, and the test says what it expected.
    """
    url = f"{BASE_URL}{path}"

    try:
        with urllib.request.urlopen(
            url, timeout=30
        ) as response:  # noqa: S310 - the test stack's own address
            return Served(
                status=response.status,
                headers={k.lower(): v for k, v in response.headers.items()},
                body=response.read(),
            )
    except urllib.error.HTTPError as error:
        return Served(
            status=error.code,
            headers={k.lower(): v for k, v in error.headers.items()},
            body=error.read(),
        )


def built_assets() -> list[str]:
    """The scripts and stylesheets the page names, by their hashed paths."""
    page = fetch("/").body.decode("utf-8")

    return re.findall(r'(?:src|href)="(/assets/[^"]+\.(?:js|css))"', page)


class TestCaching:
    """How long a browser may keep each of the app's files."""

    def test_built_scripts_and_stylesheets_are_kept_for_a_year(
        self,
    ) -> None:
        assets = built_assets()

        # The entry script and the stylesheet at the least.
        assert any(asset.endswith(".js") for asset in assets)
        assert any(asset.endswith(".css") for asset in assets)

        for asset in assets:
            served = fetch(asset)
            assert served.status == 200, asset
            assert (
                served.headers.get("cache-control") == KEEP_FOR_A_YEAR
            ), asset

    def test_the_page_itself_is_always_checked_again(self) -> None:
        served = fetch("/")

        assert served.headers.get("cache-control") == "no-cache"

    def test_the_build_manifest_is_served_and_always_checked_again(
        self,
    ) -> None:
        # The app reads it to learn the hashed names of the features it
        # fetches in the background. Kept, it would name the last build's
        # files.
        served = fetch("/.vite/manifest.json")

        assert served.status == 200
        assert served.headers.get("cache-control") == "no-cache"

        manifest = json.loads(served.body)
        assert "src/pages/admin/adminChunk.ts" in manifest

    def test_a_file_with_a_fixed_name_is_not_kept_for_a_year(self) -> None:
        served = fetch("/apple-touch-icon.png")

        assert served.status == 200
        assert "immutable" not in served.headers.get("cache-control", "")


class TestPdfDecoders:
    """The files pdf.js fetches for a scanned PDF."""

    @pytest.mark.parametrize("name", PDF_DECODERS)
    def test_each_decoder_is_served_as_a_script(self, name: str) -> None:
        served = fetch(f"/pdfjs/{name}")

        assert served.status == 200, name
        assert "javascript" in served.headers.get("content-type", ""), name

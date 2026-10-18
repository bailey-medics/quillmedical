"""Tests for app/features/passport/evidence.py.

A minimal PDF is built by hand here rather than checked in: the scan
reads bytes, and what matters is which names appear in them.
"""

from __future__ import annotations

import pytest

from app.features.passport.evidence import pdf_active_content


def _pdf(*objects: bytes) -> bytes:
    """A PDF-shaped file carrying the given object bodies."""
    body = b"\n".join(
        b"\n".join([b"%d 0 obj" % (index + 1), obj, b"endobj"])
        for index, obj in enumerate(objects)
    )

    return b"%PDF-1.4\n" + body + b"\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"


def test_a_plain_document_passes() -> None:
    pdf = _pdf(
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [] /Count 0 >>",
    )

    assert pdf_active_content(pdf) is None


@pytest.mark.parametrize(
    "token",
    [
        "/JavaScript",
        "/JS",
        "/OpenAction",
        "/AA",
        "/Launch",
        "/EmbeddedFile",
        "/EmbeddedFiles",
        "/RichMedia",
        "/XFA",
        "/Encrypt",
    ],
)
def test_each_active_token_is_found_and_named(token: str) -> None:
    pdf = _pdf(
        b"<< /Type /Catalog %s 2 0 R >>" % token.encode(),
        b"<< >>",
    )

    assert pdf_active_content(pdf) == token


def test_a_token_in_a_text_string_is_still_refused() -> None:
    """Accepted as a false positive: a certificate never needs the word
    ``/Launch`` in its text, and reading strings apart from names would
    be a parser."""
    pdf = _pdf(b"<< /Title (see /Launch in the manual) >>")

    assert pdf_active_content(pdf) == "/Launch"


def test_a_longer_name_that_starts_the_same_is_not_a_match() -> None:
    """``/AAPL:Keywords`` is written by macOS into ordinary PDFs."""
    pdf = _pdf(b"<< /AAPL:Keywords [(scan)] /JSX 1 /Encryption 0 >>")

    assert pdf_active_content(pdf) is None


def test_a_token_at_the_very_end_is_found() -> None:
    assert pdf_active_content(b"%PDF-1.4 /OpenAction") == "/OpenAction"


def test_bytes_that_are_not_a_pdf_are_not_scanned_for_meaning() -> None:
    """The tokens are PDF names; the caller only asks about PDFs. Other
    bytes containing the letters are simply not a match."""
    assert pdf_active_content(b"\x89PNG\r\n\x1a\n JS AA Launch") is None

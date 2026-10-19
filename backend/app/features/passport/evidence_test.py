"""Tests for app/features/passport/evidence.py.

A minimal PDF is built by hand here rather than checked in: the scan
reads bytes, and what matters is which names appear in them. The images
are written by Pillow in the test for the same reason, so a fixture
carrying its own EXIF or text chunk is made rather than stored.
"""

from __future__ import annotations

import zlib
from io import BytesIO

import pytest
from PIL import ExifTags, Image, PngImagePlugin

from app.features.passport.evidence import (
    MAX_IMAGE_PIXELS,
    ImageNotReadable,
    pdf_active_content,
    sanitise_image,
)


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


def _picture(size: tuple[int, int] = (8, 6)) -> Image.Image:
    """A small picture that is not one flat colour, so a re-encode has
    something to get wrong."""
    picture = Image.new("RGB", size, "white")
    picture.putpixel((1, 1), (200, 30, 30))
    picture.putpixel((2, 1), (30, 30, 200))

    return picture


def _encode(picture: Image.Image, fmt: str, **kwargs: object) -> bytes:
    out = BytesIO()
    picture.save(out, format=fmt, **kwargs)

    return out.getvalue()


def _png_claiming(width: int, height: int) -> bytes:
    """A PNG whose header claims a size, with no pixels behind it."""

    def chunk(kind: bytes, body: bytes) -> bytes:
        crc = zlib.crc32(kind + body) & 0xFFFFFFFF

        return (
            len(body).to_bytes(4, "big") + kind + body + crc.to_bytes(4, "big")
        )

    header = width.to_bytes(4, "big") + height.to_bytes(4, "big")
    header += bytes([1, 0, 0, 0, 0])  # 1-bit greyscale, no interlace

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(b"\x00"))
        + chunk(b"IEND", b"")
    )


def _jpeg_with_gps(size: tuple[int, int] = (8, 6)) -> bytes:
    """A JPEG as a phone writes it: GPS position and a sideways
    orientation in its EXIF."""
    exif = Image.Exif()
    exif[ExifTags.Base.Orientation] = 6  # rotated 90 degrees clockwise
    exif[ExifTags.Base.Make] = "A phone"
    gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
    gps[ExifTags.GPS.GPSLatitudeRef] = "N"
    gps[ExifTags.GPS.GPSLatitude] = (51.0, 27.0, 0.0)
    gps[ExifTags.GPS.GPSLongitudeRef] = "W"
    gps[ExifTags.GPS.GPSLongitude] = (2.0, 35.0, 0.0)

    return _encode(_picture(size), "JPEG", exif=exif.tobytes())


class TestSanitiseImage:
    """What is stored is the picture and nothing else."""

    def test_a_jpeg_loses_its_exif_and_its_gps_position(self) -> None:
        data = _jpeg_with_gps()
        assert b"A phone" in data

        stored, media_type = sanitise_image(data, "image/jpeg")

        assert media_type == "image/jpeg"
        assert b"A phone" not in stored
        with Image.open(BytesIO(stored)) as picture:
            assert dict(picture.getexif()) == {}
            assert picture.getexif().get_ifd(ExifTags.IFD.GPSInfo) == {}

    def test_orientation_is_applied_before_the_exif_goes(self) -> None:
        """A photo taken sideways is stored the right way up, rather
        than losing the tag that said which way up it was."""
        stored, _ = sanitise_image(_jpeg_with_gps((8, 6)), "image/jpeg")

        with Image.open(BytesIO(stored)) as picture:
            assert picture.size == (6, 8)

    def test_a_png_loses_its_text_chunks(self) -> None:
        info = PngImagePlugin.PngInfo()
        info.add_text("Comment", "taken at home")
        data = _encode(_picture(), "PNG", pnginfo=info)
        assert b"taken at home" in data

        stored, media_type = sanitise_image(data, "image/png")

        assert media_type == "image/png"
        assert b"taken at home" not in stored
        with Image.open(BytesIO(stored)) as picture:
            assert picture.format == "PNG"
            assert "Comment" not in picture.info

    def test_a_webp_is_stored_as_webp(self) -> None:
        stored, media_type = sanitise_image(
            _encode(_picture(), "WEBP"), "image/webp"
        )

        assert media_type == "image/webp"
        with Image.open(BytesIO(stored)) as picture:
            assert picture.format == "WEBP"

    def test_a_heic_is_stored_as_a_jpeg(self) -> None:
        """Only Safari displays HEIC; an assessor on Chrome would see a
        broken image."""
        data = _encode(_picture((16, 16)), "HEIF")
        assert data[4:8] == b"ftyp"

        stored, media_type = sanitise_image(data, "image/heic")

        assert media_type == "image/jpeg"
        assert stored.startswith(b"\xff\xd8\xff")
        with Image.open(BytesIO(stored)) as picture:
            assert picture.format == "JPEG"
            assert picture.size == (16, 16)

    def test_the_picture_survives(self) -> None:
        stored, _ = sanitise_image(_encode(_picture(), "PNG"), "image/png")

        with Image.open(BytesIO(stored)) as picture:
            assert picture.getpixel((1, 1)) == (200, 30, 30)
            assert picture.getpixel((0, 0)) == (255, 255, 255)

    def test_the_same_input_gives_the_same_output(self) -> None:
        """The blob store relies on a retried upload hashing the same."""
        data = _jpeg_with_gps()

        assert sanitise_image(data, "image/jpeg") == sanitise_image(
            data, "image/jpeg"
        )

    def test_an_image_past_the_pixel_limit_is_refused_unread(self) -> None:
        # A PNG header can claim any size; the limit is checked from it
        # before a pixel is decoded, so the file need not really be
        # that large.
        side = int(MAX_IMAGE_PIXELS**0.5) + 1

        with pytest.raises(ImageNotReadable, match="too large"):
            sanitise_image(_png_claiming(side, side), "image/png")

    def test_an_image_within_the_pixel_limit_is_read(self) -> None:
        """The counterpart: a large scan is not refused as a bomb."""
        side = int(MAX_IMAGE_PIXELS**0.5) - 1

        # Not decodable, as there are no pixels behind the header, but
        # it must get past the size check to fail that way.
        with pytest.raises(ImageNotReadable, match="could not be read"):
            sanitise_image(_png_claiming(side, side), "image/png")

    def test_bytes_that_are_not_an_image_are_refused(self) -> None:
        with pytest.raises(ImageNotReadable, match="could not be read"):
            sanitise_image(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64, "image/png")

    def test_a_type_that_is_not_an_image_is_refused(self) -> None:
        with pytest.raises(ImageNotReadable):
            sanitise_image(b"%PDF-1.4", "application/pdf")

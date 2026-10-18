"""What an uploaded piece of evidence may contain, beyond its type.

``_looks_like`` in the router checks that a file begins the way its
declared type says it should. This module looks further in, for the one
type where the contents can do something rather than show something: a
PDF may carry JavaScript, an action that runs on opening, a launched
program or an embedded file, and an assessor's browser is what opens it.

Images are not refused but rewritten: decoded and saved again, so that
what is stored is the picture and nothing else. See
:func:`sanitise_image`.
"""

from __future__ import annotations

import re
import warnings
from io import BytesIO

import pillow_heif
from PIL import Image, ImageOps

#: HEIC is what a phone writes, and Pillow cannot read it alone. The
#: opener is registered once, at import, so ``Image.open`` handles it
#: beside the formats Pillow ships with.
pillow_heif.register_heif_opener()

#: The most pixels an evidence image may have. A certificate scanned at
#: 600 dpi on A4 is about 35 million; this is refused only by a file
#: that claims to be far larger than any scan, which is what a
#: decompression bomb does. Set on Pillow too, so a file past twice this
#: is refused by the decoder before any of it is read.
MAX_IMAGE_PIXELS = 50_000_000
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS

#: The quality a lossy image is saved at where its own tables cannot be
#: reused: a HEIC becoming a JPEG, or a WebP. High, because a scan is
#: read for its small print.
_LOSSY_QUALITY = 95

#: What each admitted image type is stored as. HEIC becomes JPEG: only
#: Safari displays HEIC, and an assessor on Chrome would see a broken
#: image where the certificate should be.
_STORED_AS: dict[str, tuple[str, str]] = {
    "image/jpeg": ("JPEG", "image/jpeg"),
    "image/png": ("PNG", "image/png"),
    "image/webp": ("WEBP", "image/webp"),
    "image/heic": ("JPEG", "image/jpeg"),
}


class ImageNotReadable(ValueError):
    """The bytes could not be decoded as the image they claim to be.

    Raised for a file Pillow cannot open, one whose pixel count is past
    :data:`MAX_IMAGE_PIXELS`, and a type this module does not store.
    The message is written for the holder who uploaded it.
    """


def sanitise_image(data: bytes, media_type: str) -> tuple[bytes, str]:
    """Decode an image and write it out again, keeping only the picture.

    Everything in the file that is not pixels is dropped: the EXIF
    block, which in a phone photograph carries the GPS position it was
    taken at (for a clinician photographing a certificate at home, their
    address); the ICC profile; XMP; PNG text chunks; and anything hidden
    in the container that a decoder would skip over. Orientation is
    applied before the EXIF goes, so a photo taken sideways is stored
    the right way up rather than losing the tag that said which way up
    it was.

    A JPEG is saved with the source's own quantisation tables, so a scan
    is not degraded a second time by a fresh quality setting. HEIC is
    decoded through ``pillow-heif`` and saved as JPEG; WebP is saved as
    WebP. Animation is dropped, first frame only: evidence is a still.

    The same input always yields the same bytes, which the blob store
    relies on: a retried upload must hash the same.

    Args:
        data: The uploaded bytes.
        media_type: The type the holder declared, already checked
            against the first bytes by the router.

    Returns:
        The bytes to store, and the type they are, which differs from
        *media_type* only for HEIC.

    Raises:
        ImageNotReadable: The bytes are not a decodable image, are too
            large, or are of a type this module does not store.
    """
    stored = _STORED_AS.get(media_type)

    if stored is None:
        raise ImageNotReadable(f"{media_type} is not an image evidence type")

    save_format, stored_type = stored

    try:
        # Pillow checks the pixel count from the header, before a pixel
        # is decoded, and warns past `MAX_IMAGE_PIXELS`. A bomb is small
        # on disk and vast in memory, so the warning is made the refusal.
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as source:
                # The tables a JPEG was encoded with, read before the
                # copy below loses them.
                quantisation = getattr(source, "quantization", None)

                # A copy with the orientation applied and the tag removed.
                picture = ImageOps.exif_transpose(source)
    except Image.DecompressionBombWarning, Image.DecompressionBombError:
        raise ImageNotReadable(
            "That image is too large; evidence may have up to "
            f"{MAX_IMAGE_PIXELS // 1_000_000} million pixels"
        ) from None
    except Exception as exc:  # noqa: BLE001
        # Pillow raises OSError, ValueError and SyntaxError for a file
        # it cannot read, and a hostile file is the one we care about
        # most.
        raise ImageNotReadable("That image could not be read") from exc

    # `exif_transpose` copies `info`, which is where Pillow keeps the
    # EXIF, ICC profile and text chunks it would write back out on
    # save. Emptied, so the save has nothing but pixels to write.
    picture.info = {}

    if save_format == "JPEG":
        picture = picture.convert("L" if picture.mode == "L" else "RGB")
    elif picture.mode not in ("L", "RGB", "RGBA"):
        picture = picture.convert(
            "RGBA" if "A" in picture.mode or picture.mode == "P" else "RGB"
        )

    out = BytesIO()

    if save_format == "JPEG" and quantisation:
        picture.save(out, format="JPEG", qtables=quantisation)
    elif save_format == "JPEG":
        picture.save(out, format="JPEG", quality=_LOSSY_QUALITY)
    elif save_format == "WEBP":
        picture.save(out, format="WEBP", quality=_LOSSY_QUALITY)
    else:
        picture.save(out, format="PNG")

    return out.getvalue(), stored_type


#: The PDF name tokens that make a document act rather than display.
#:
#: ``JavaScript`` and ``JS`` are script; ``OpenAction`` and ``AA`` run an
#: action on opening or on an event; ``Launch`` starts a program;
#: ``EmbeddedFile`` and ``EmbeddedFiles`` attach another file;
#: ``RichMedia`` is Flash and video; ``XFA`` is a form language with its
#: own scripting. ``Encrypt`` is not active, but an encrypted PDF cannot
#: be rendered into the passport export, so it is refused here, at
#: upload, rather than failing the export later.
#:
#: A name ends at whitespace or a delimiter, which the lookahead
#: enforces: ``/AAPL:Keywords``, written by macOS, is not ``/AA``.
_ACTIVE_CONTENT = re.compile(
    rb"/(JavaScript|JS|OpenAction|AA|Launch|EmbeddedFiles?|RichMedia"
    rb"|XFA|Encrypt)(?=[\s()<>\[\]{}/%]|$)"
)


def pdf_active_content(data: bytes) -> str | None:
    """The first token in *data* that would make a PDF act, or None.

    A byte scan rather than a PDF parser, for the reason ``_looks_like``
    is a short table rather than a library: a parser is a supply-chain
    surface reading hostile input in the API process, for one allow-list.

    The scan's limit, stated plainly: a token inside a compressed object
    stream (``/ObjStm``) is invisible to it, so a PDF written to hide
    one passes. That is why the ``Content-Security-Policy: sandbox``
    header on the route that serves evidence is the control that holds,
    and this scan is what gives a holder a clear reason in the ordinary
    case.

    Returns the token with its leading slash, for the refusal to name.
    """
    match = _ACTIVE_CONTENT.search(data)

    if match is None:
        return None

    return match.group(0).decode("ascii")

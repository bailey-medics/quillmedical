"""The Newsletter section of the admin area.

Everything here is for whoever looks after newsletters, and
:data:`MAY_USE_NEWSLETTER` is the one place that says who that is. For
now it is an operator of Quill itself: a newsletter belongs to no one
organisation, which is the test for the platform role. When somebody
is to look after newsletters and nothing else, that line becomes a
competency check and nothing below it changes.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_core_db
from app.deps import DEP_REQUIRE_OPERATOR, get_current_user
from app.marketing import mailing_list_import as importer
from app.marketing.newsletter import recipients, subscribers
from app.models import NewsletterSubscriber
from app.rate_limit import limiter
from app.schemas.marketing import MailingListCheckOut, NewsletterAudienceOut

#: Who may use the Newsletter section. The single gate for every route
#: in this router.
MAY_USE_NEWSLETTER = DEP_REQUIRE_OPERATOR

router = APIRouter(
    prefix="/newsletter",
    tags=["newsletter"],
    dependencies=[MAY_USE_NEWSLETTER],
)

_DEP_SESSION = Depends(get_core_db)

#: How much of an upload is read at a time.
_CHUNK = 64 * 1024


def _require_csrf(request: Request, db: Session = _DEP_SESSION) -> None:
    """Check the CSRF token, borrowing ``main``'s implementation.

    ``main`` imports this router, so importing ``require_csrf`` at module
    level would be a cycle. The feedback and org_units routers do the same.
    """
    from app.main import require_csrf

    require_csrf(request, get_current_user(request, db))


_DEP_REQUIRE_CSRF = Depends(_require_csrf)


async def _read(file: UploadFile) -> bytes:
    """Read an upload into memory, stopping at the size limit.

    Read in bounded chunks so that an oversize file is refused partway
    and not after. Nothing is written anywhere: the bytes live for this
    request and no longer.

    Raises:
        HTTPException: 413 if the file is over the limit.
    """
    chunks: list[bytes] = []
    total = 0

    while chunk := await file.read(_CHUNK):
        total += len(chunk)
        if total > importer.MAX_BYTES:
            raise HTTPException(
                413,
                "That file is larger than "
                f"{importer.MAX_BYTES // (1024 * 1024)} MB",
            )
        chunks.append(chunk)

    return b"".join(chunks)


def _parse(raw: bytes) -> importer.Parsed:
    """Read the file, turning a file that is not a list into a 400."""
    try:
        return importer.parse(raw)
    except importer.MailingListError as exc:
        raise HTTPException(400, str(exc)) from None


def _out(
    raw: bytes,
    parsed: importer.Parsed,
    summary: importer.Summary,
    *,
    imported: bool,
) -> MailingListCheckOut:
    """The reply for a file: numbers, and row numbers, and nothing else."""
    limit = importer.MAX_ROW_NUMBERS

    return MailingListCheckOut(
        **asdict(summary),
        no_address_rows=parsed.no_address[:limit],
        unreadable_answer_rows=parsed.unreadable_answer[:limit],
        fingerprint=importer.fingerprint(raw, summary),
        imported=imported,
    )


@router.get("/audience", response_model=NewsletterAudienceOut)
def audience(db: Session = _DEP_SESSION) -> NewsletterAudienceOut:
    """Say how many people a newsletter would reach now.

    Args:
        db: Database session.

    Returns:
        The counts, by kind.
    """
    unsubscribed = db.scalar(
        select(func.count())
        .select_from(NewsletterSubscriber)
        .where(NewsletterSubscriber.subscribed.is_(False))
    )

    return NewsletterAudienceOut(
        accounts=len(recipients(db)),
        subscribers=len(subscribers(db)),
        unsubscribed=unsubscribed or 0,
    )


@router.post(
    "/mailing-list/check",
    response_model=MailingListCheckOut,
    dependencies=[_DEP_REQUIRE_CSRF],
)
@limiter.limit("30/minute")
async def check_mailing_list(
    request: Request,
    file: UploadFile,
    db: Session = _DEP_SESSION,
) -> MailingListCheckOut:
    """Say what importing a mailing list file would do. Changes nothing.

    Args:
        request: The request, for the rate limiter.
        file: The CSV.
        db: Database session.

    Returns:
        The counts, and the fingerprint to send back to import it.

    Raises:
        HTTPException: 413 if the file is too big, 400 if it is not a
            mailing list.
    """
    raw = await _read(file)
    parsed = _parse(raw)

    return _out(raw, parsed, importer.summarise(db, parsed), imported=False)


@router.post(
    "/mailing-list/import",
    response_model=MailingListCheckOut,
    dependencies=[_DEP_REQUIRE_CSRF],
)
@limiter.limit("10/minute")
async def import_mailing_list(
    request: Request,
    file: UploadFile,
    fingerprint: Annotated[str, Form(min_length=64, max_length=64)],
    db: Session = _DEP_SESSION,
) -> MailingListCheckOut:
    """Import a mailing list file that has just been checked.

    The file is sent again, since the check kept nothing. The
    fingerprint from the check must still be right: it stops an import
    of a different file, or of the same one after the mailing list has
    changed under it.

    Args:
        request: The request, for the rate limiter.
        file: The CSV, the same one that was checked.
        fingerprint: What the check gave back.
        db: Database session.

    Returns:
        The counts of what was imported.

    Raises:
        HTTPException: 413 if the file is too big, 400 if it is not a
            mailing list, 409 if the fingerprint no longer matches.
    """
    raw = await _read(file)
    parsed = _parse(raw)
    summary = importer.summarise(db, parsed)

    if fingerprint != importer.fingerprint(raw, summary):
        raise HTTPException(
            409,
            "The file or the mailing list has changed since it was "
            "checked. Check the file again.",
        )
    importer.apply(db, parsed)

    return _out(raw, parsed, summary, imported=True)

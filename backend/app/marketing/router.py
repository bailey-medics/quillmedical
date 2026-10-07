"""Marketing email routes.

The Settings switch that changes a person's own preference, and the two
routes behind the unsubscribe link in a newsletter, which need no login.

Quill's own database is the only record of who wants news: there is no
list at a mail provider to keep in step. See Phase 4 of
``docs/docs/plans/2026-10-06-amazon-ses-email-plan.md``.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.db import get_core_db
from app.deps import DEP_CURRENT_USER, get_current_user
from app.email_send import mask_email
from app.marketing.preferences import (
    MARKETING_WORDING_VERSION,
    set_marketing_preference,
)
from app.models import User
from app.rate_limit import limiter
from app.schemas.marketing import (
    MarketingPreferenceIn,
    MarketingPreferenceOut,
    MarketingUnsubscribeOut,
)
from app.security import verify_marketing_unsubscribe_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/marketing", tags=["marketing"])

_DEP_SESSION = Depends(get_core_db)


def _require_csrf(request: Request, db: Session = _DEP_SESSION) -> None:
    """Check the CSRF token, borrowing ``main``'s implementation.

    ``main`` imports this router, so importing ``require_csrf`` at module
    level would be a cycle. The feedback and org_units routers do the same.
    """
    from app.main import require_csrf

    require_csrf(request, get_current_user(request, db))


@router.put(
    "/preference",
    response_model=MarketingPreferenceOut,
    dependencies=[Depends(_require_csrf)],
)
@limiter.limit("20/minute")
def set_my_marketing_preference(
    request: Request,
    payload: MarketingPreferenceIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> MarketingPreferenceOut:
    """Change whether the signed-in person is sent news and updates.

    Saved in Quill and nowhere else. The command that sends a newsletter
    reads this answer just before each person's turn, so there is nobody
    else to tell and nothing that can fail on the way.

    Args:
        request: The request, for the rate limiter.
        payload: The new answer.
        current_user: The signed-in person.
        db: Database session.

    Returns:
        The preference as it now stands.
    """
    set_marketing_preference(
        db,
        current_user,
        wants=payload.wants_marketing,
        source="settings",
        wording_version=MARKETING_WORDING_VERSION,
    )
    return MarketingPreferenceOut(
        marketing_emails=current_user.marketing_emails
    )


async def _raw_body(request: Request) -> bytes:
    """The request body exactly as sent."""
    return await request.body()


_DEP_RAW_BODY = Depends(_raw_body)

#: The token in an unsubscribe link. Long enough for any real one, and
#: bounded so that a request cannot hand the verifier megabytes to hash.
_UNSUBSCRIBE_TOKEN = Query(min_length=1, max_length=512)


def _unsubscribe_user(token: str, db: Session) -> User:
    """Whose unsubscribe link this is.

    The signature is the whole of these routes' authentication: there is
    no session and no CSRF token, because the person may be signed out,
    or may be a mailbox pressing the link for them.

    Args:
        token: The token from the link.
        db: Database session.

    Returns:
        The person the link was made for.

    Raises:
        HTTPException: 404 for a bad signature and for an account that
            is gone, alike, so the reply says nothing about which.
    """
    user_id = verify_marketing_unsubscribe_token(token)
    user = db.get(User, user_id) if user_id is not None else None
    if user is None:
        raise HTTPException(status_code=404, detail="Not found.")
    return user


def _is_json(request: Request) -> bool:
    """Whether a request says its body is JSON."""
    content_type = request.headers.get("content-type", "")
    return content_type.split(";")[0].strip().lower() == "application/json"


def _wanted_by_link(request: Request, raw: bytes) -> bool:
    """What a ``POST`` to the unsubscribe link asks for.

    Two callers. Quill's own unsubscribe page sends JSON saying which way
    to set the preference, since the page can also turn news back on. A
    mailbox doing a one-click unsubscribe (RFC 8058) sends a form body of
    ``List-Unsubscribe=One-Click``, and means off.

    Anything that is not JSON is read as that one-click: the link is
    already proven by its signature, and off is the safe way to be wrong
    about an unsubscribe.

    Args:
        request: The request, for its content type.
        raw: The body as sent.

    Returns:
        Whether the person wants marketing email.

    Raises:
        HTTPException: 422 if the body claims to be JSON and is not the
            shape the page sends.
    """
    if not _is_json(request):
        return False
    try:
        payload = MarketingPreferenceIn.model_validate_json(raw)
    except ValidationError:
        raise HTTPException(
            status_code=422, detail="Invalid request body."
        ) from None
    return payload.wants_marketing


# Public and without a CSRF token on purpose, both of them: see
# ``_unsubscribe_user``.
@router.get("/unsubscribe", response_model=MarketingUnsubscribeOut)
@limiter.limit("60/minute")
def read_unsubscribe_link(
    request: Request,
    token: str = _UNSUBSCRIBE_TOKEN,
    db: Session = _DEP_SESSION,
) -> MarketingUnsubscribeOut:
    """Say whose unsubscribe link this is, and what they now receive.

    For the unsubscribe page, which shows it before anything is changed.

    Args:
        request: The request, for the rate limiter.
        token: The token from the link.
        db: Database session.

    Returns:
        The address, mostly hidden, and the preference as it stands.

    Raises:
        HTTPException: 404 if the link is not a real one.
    """
    user = _unsubscribe_user(token, db)
    return MarketingUnsubscribeOut(
        email=mask_email(user.email),
        marketing_emails=user.marketing_emails,
    )


@router.post("/unsubscribe", response_model=MarketingUnsubscribeOut)
@limiter.limit("60/minute")
def use_unsubscribe_link(
    request: Request,
    token: str = _UNSUBSCRIBE_TOKEN,
    raw: bytes = _DEP_RAW_BODY,
    db: Session = _DEP_SESSION,
) -> MarketingUnsubscribeOut:
    """Change somebody's marketing preference from their unsubscribe link.

    Args:
        request: The request, for its content type and the rate limiter.
        token: The token from the link.
        raw: The body as sent.
        db: Database session.

    Returns:
        The address, mostly hidden, and the preference as it now stands.

    Raises:
        HTTPException: 404 if the link is not a real one, 422 if a JSON
            body is not the shape the page sends.
    """
    user = _unsubscribe_user(token, db)
    set_marketing_preference(
        db,
        user,
        wants=_wanted_by_link(request, raw),
        source="unsubscribe_link",
    )
    return MarketingUnsubscribeOut(
        email=mask_email(user.email),
        marketing_emails=user.marketing_emails,
    )

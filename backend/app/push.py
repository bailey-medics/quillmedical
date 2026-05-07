"""Web Push notification subscription management.

This module handles push notification subscriptions from client browsers
using the Web Push protocol (RFC 8030). Subscriptions are persisted to
PostgreSQL so they survive container restarts and deployments.

Example:
    Client subscribes:
    POST /push/subscribe
    {"endpoint": "https://...", "keys": {"p256dh": "...", "auth": "..."}}
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import PushSubscription as PushSubscriptionModel
from app.models import User
from app.security import decode_token

router = APIRouter(prefix="/push", tags=["push"])


class PushKeys(BaseModel):
    """Encryption keys for Web Push messages.

    Attributes:
        p256dh: Public key for message encryption (Base64).
        auth: Authentication secret for message encryption (Base64).
    """

    p256dh: str
    auth: str


class PushSubscriptionIn(BaseModel):
    """Web Push subscription from a client browser.

    Attributes:
        endpoint: Push service endpoint URL (browser-specific).
        expirationTime: Optional subscription expiry timestamp.
        keys: Encryption keys for secure message delivery.
    """

    endpoint: str
    expirationTime: int | None = None
    keys: PushKeys


def _get_user_id_from_request(request: Request, db: Session) -> int:
    """Extract user ID from access_token cookie.

    Raises:
        HTTPException: 401 if not authenticated or token invalid.
    """
    tok = request.cookies.get("access_token")
    if not tok:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = decode_token(tok)
    except Exception as e:
        raise HTTPException(401, "Invalid token") from e
    username = payload["sub"]
    user = db.scalar(select(User).where(User.username == username))
    if not user:
        raise HTTPException(401, "User not found")
    return user.id


@router.post("/subscribe")
def subscribe(
    sub: PushSubscriptionIn,
    request: Request,
    db: Session = Depends(get_session),
) -> dict[str, bool | int]:
    """Register a new push notification subscription.

    Requires authentication via access_token cookie.
    Upserts by (user_id, endpoint) to prevent duplicates.

    Args:
        sub: Push subscription from browser's Push API.
        request: HTTP request (for cookie validation).
        db: Database session.

    Returns:
        dict: Status with ok=True and total subscription count for user.

    Raises:
        HTTPException: 401 if not authenticated.
    """
    user_id = _get_user_id_from_request(request, db)

    # Check if subscription already exists for this user + endpoint
    existing = db.scalar(
        select(PushSubscriptionModel).where(
            PushSubscriptionModel.user_id == user_id,
            PushSubscriptionModel.endpoint == sub.endpoint,
        )
    )

    if existing:
        # Update keys in case they changed
        existing.keys_p256dh = sub.keys.p256dh  # gitleaks:allow
        existing.keys_auth = sub.keys.auth
    else:
        db.add(
            PushSubscriptionModel(
                user_id=user_id,
                endpoint=sub.endpoint,
                keys_p256dh=sub.keys.p256dh,
                keys_auth=sub.keys.auth,
            )
        )

    db.commit()

    count = db.scalar(
        select(func.count(PushSubscriptionModel.id)).where(
            PushSubscriptionModel.user_id == user_id
        )
    )
    return {"ok": True, "count": count or 0}

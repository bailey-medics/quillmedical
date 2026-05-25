"""Web Push notification subscription management.

This module handles push notification subscriptions from client browsers
using the Web Push protocol (RFC 8030). Subscriptions are persisted to
PostgreSQL so they survive container restarts and deployments.

Example:
    Client subscribes:
    POST /push/subscribe
    {"endpoint": "https://...", "keys": {"p256dh": "...", "auth": "..."}}
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_session
from app.deps import DEP_CURRENT_USER
from app.models import PushSubscription as PushSubscriptionModel
from app.models import User

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


@router.post("/subscribe")
def subscribe(
    sub: PushSubscriptionIn,
    u: User = DEP_CURRENT_USER,
    db: Session = Depends(get_session),
) -> dict[str, bool | int]:
    """Register a new push notification subscription.

    Requires authentication via access_token cookie.
    Upserts by (user_id, endpoint) to prevent duplicates.

    Args:
        sub: Push subscription from browser's Push API.
        u: Authenticated user (injected via DEP_CURRENT_USER override).
        db: Database session.

    Returns:
        dict: Status with ok=True and total subscription count for user.

    Raises:
        HTTPException: 401 if not authenticated.
    """
    # Check if subscription already exists for this user + endpoint
    existing = db.scalar(
        select(PushSubscriptionModel).where(
            PushSubscriptionModel.user_id == u.id,
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
                user_id=u.id,
                endpoint=sub.endpoint,
                keys_p256dh=sub.keys.p256dh,
                keys_auth=sub.keys.auth,
            )
        )

    db.commit()

    count = db.scalar(
        select(func.count(PushSubscriptionModel.id)).where(
            PushSubscriptionModel.user_id == u.id
        )
    )
    return {"ok": True, "count": count or 0}

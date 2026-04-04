"""Web Push notification subscription management.

This module handles push notification subscriptions from client browsers
using the Web Push protocol (RFC 8030). Subscriptions include endpoint URLs
and encryption keys for secure message delivery.

Warning:
    Subscriptions are currently stored in-memory and will be lost on restart.
    Production deployment should use PostgreSQL or Redis for persistence.

Example:
    Client subscribes:
    POST /push/subscribe
    {"endpoint": "https://...", "keys": {"p256dh": "...", "auth": "..."}}
"""

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.security import decode_token

router = APIRouter(prefix="/push", tags=["push"])

# In-memory store for quick testing; swap for DB later
SUBSCRIPTIONS: list[dict[str, Any]] = []
"""List of active push subscriptions. WARNING: In-memory storage only."""


class PushKeys(BaseModel):
    """Encryption keys for Web Push messages.

    Attributes:
        p256dh: Public key for message encryption (Base64).
        auth: Authentication secret for message encryption (Base64).
    """

    p256dh: str
    auth: str


class PushSubscription(BaseModel):
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
    sub: PushSubscription, request: Request
) -> dict[str, bool | int]:
    """Register a new push notification subscription.

    Requires authentication via access_token cookie.
    De-duplicates by endpoint URL to prevent duplicate subscriptions.

    Args:
        sub: Push subscription from browser's Push API.
        request: HTTP request (for cookie validation).

    Returns:
        dict: Status with ok=True and total subscription count.

    Raises:
        HTTPException: 401 if not authenticated.
    """
    tok = request.cookies.get("access_token")
    if not tok:
        raise HTTPException(401, "Not authenticated")
    try:
        decode_token(tok)
    except Exception as e:
        raise HTTPException(401, "Invalid token") from e
    # de-duplicate by endpoint
    if not any(s["endpoint"] == sub.endpoint for s in SUBSCRIPTIONS):
        SUBSCRIPTIONS.append(sub.model_dump())
    return {"ok": True, "count": len(SUBSCRIPTIONS)}

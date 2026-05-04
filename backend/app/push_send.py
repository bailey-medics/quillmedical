"""Web Push notification sending.

This module provides endpoints for sending push notifications to subscribed
clients using the pywebpush library. Requires VAPID keys for authentication
with push services.

Environment Variables:
    VAPID_PRIVATE: VAPID private key for signing push requests.
    COMPANY_EMAIL: Contact email for VAPID claims (default: mailto:admin@example.com).

Example:
    Send test notification to all subscribers:
    POST /api/push/send-test
"""

import os

from fastapi import APIRouter, Depends, HTTPException
from pywebpush import WebPushException, webpush  # type: ignore[import-untyped]
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import PushSubscription

router = APIRouter(prefix="/api/push", tags=["push-send"])

VAPID_PRIVATE = os.environ["VAPID_PRIVATE"]
VAPID_CLAIM = os.environ.get("COMPANY_EMAIL") or "mailto:admin@example.com"


@router.post("/send-test")
def send_test(
    db: Session = Depends(get_session),
) -> dict[str, bool | list[str]]:
    """Send test push notification to all subscribed clients.

    Attempts to send a test notification to all subscriptions. If a subscription
    fails (e.g., expired or invalid), it is automatically removed from the DB.

    Returns:
        dict: Result with sent=True and list of removed endpoints.

    Raises:
        HTTPException: 400 if no subscriptions exist.

    Example:
        Response:
        {"sent": True, "removed": ["https://expired-endpoint.com"]}
    """
    subscriptions = db.scalars(select(PushSubscription)).all()

    if not subscriptions:
        raise HTTPException(400, "No subscribers yet")

    removed: list[str] = []

    for sub in subscriptions:
        sub_info = {
            "endpoint": sub.endpoint,
            "keys": {"p256dh": sub.keys_p256dh, "auth": sub.keys_auth},
        }
        try:
            webpush(
                subscription_info=sub_info,
                data='{"title":"Quill","body":"Test notification","data":{"url":"/app/"}}',
                vapid_private_key=VAPID_PRIVATE,
                vapid_claims={"sub": VAPID_CLAIM},
            )
        except WebPushException:
            removed.append(sub.endpoint)
            db.delete(sub)

    db.commit()
    return {"sent": True, "removed": removed}

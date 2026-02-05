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

from fastapi import APIRouter, HTTPException
from pywebpush import WebPushException, webpush

from .push import SUBSCRIPTIONS

router = APIRouter(prefix="/api/push", tags=["push-send"])

VAPID_PRIVATE = os.environ["VAPID_PRIVATE"]
VAPID_CLAIM = os.environ.get("COMPANY_EMAIL") or "mailto:admin@example.com"


@router.post("/send-test")
def send_test():
    """Send test push notification to all subscribed clients.

    Attempts to send a test notification to all subscriptions. If a subscription
    fails (e.g., expired or invalid), it is automatically removed from the list.

    Returns:
        dict: Result with sent=True and list of removed endpoints.

    Raises:
        HTTPException: 400 if no subscriptions exist.

    Example:
        Response:
        {"sent": True, "removed": ["https://expired-endpoint.com"]}
    """
    if not SUBSCRIPTIONS:
        raise HTTPException(400, "No subscribers yet")

    removed = []
    sent = 0

    for sub in SUBSCRIPTIONS[:]:
        try:
            webpush(
                subscription_info=sub,
                data='{"title":"Quill","body":"Test notification","data":{"url":"/app/"}}',
                vapid_private_key=VAPID_PRIVATE,
                vapid_claims={"sub": VAPID_CLAIM},
            )
            sent += 1
        except WebPushException:
            removed.append(sub["endpoint"])
            SUBSCRIPTIONS.remove(sub)
    return {"sent": True, "removed": removed}

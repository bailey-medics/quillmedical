import os

from fastapi import APIRouter, HTTPException
from pywebpush import WebPushException, webpush

from .push import SUBSCRIPTIONS

router = APIRouter(prefix="/api/push", tags=["push-send"])

VAPID_PRIVATE = os.environ["VAPID_PRIVATE"]
VAPID_CLAIM = os.environ.get("COMPANY_EMAIL") or "mailto:admin@example.com"


@router.post("/send-test")
def send_test():
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

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/push", tags=["push"])

# In-memory store for quick testing; swap for DB later
SUBSCRIPTIONS: list[dict[str, Any]] = []


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscription(BaseModel):
    endpoint: str
    expirationTime: int | None = None
    keys: PushKeys


@router.post("/subscribe")
def subscribe(sub: PushSubscription):
    # de-duplicate by endpoint
    if not any(s["endpoint"] == sub.endpoint for s in SUBSCRIPTIONS):
        SUBSCRIPTIONS.append(sub.model_dump())
    return {"ok": True, "count": len(SUBSCRIPTIONS)}

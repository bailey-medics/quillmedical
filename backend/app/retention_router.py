"""Deciding what happens to records past the period they are kept for.

The nightly retention run lists a closed account's training records once
their sponsor's period has passed, and then the account itself, and
deletes neither (``app.retention``). These are the routes a person
decides with.

Everything here is for an operator of Quill itself. The records belong
to every organisation's sponsor, not to one place, which is the test for
the platform role. The sponsor is the controller and its own teaching
admin may one day decide its own; that is a later change, and
:data:`MAY_DECIDE` is the one line it would alter.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_core_db
from app.deps import DEP_REQUIRE_CSRF, DEP_REQUIRE_OPERATOR
from app.models import OrgUnit, RetentionReview, User
from app.retention import carry_out_decision, delete_training_records
from app.schemas.retention import (
    RetentionAccountOut,
    RetentionDecisionsIn,
    RetentionDecisionsOut,
    RetentionRefusalOut,
    RetentionReviewListOut,
    RetentionReviewOut,
)

logger = logging.getLogger(__name__)

#: Who may decide. The single gate for every route in this router.
MAY_DECIDE = DEP_REQUIRE_OPERATOR

router = APIRouter(
    prefix="/retention",
    tags=["retention"],
    dependencies=[MAY_DECIDE],
)

_DEP_SESSION = Depends(get_core_db)


@router.get("/reviews", response_model=RetentionReviewListOut)
def list_reviews(db: Session = _DEP_SESSION) -> RetentionReviewListOut:
    """Everything awaiting a decision, longest waiting first.

    Records and accounts come back as two lists.

    The counts are taken now, not read from the row: an account closed
    for years gains nothing, but the number shown should be the number
    a decision to delete would remove.

    Not paginated. Each row is somebody whose account closed years ago,
    and the useful view is all of them.
    """
    # ``unique()`` because a user's roles are loaded with a join, which
    # SQLAlchemy will not hand back without it.
    rows = (
        db.execute(
            select(RetentionReview, User, OrgUnit)
            .join(User, User.id == RetentionReview.user_id)
            .join(OrgUnit, OrgUnit.id == RetentionReview.org_unit_id)
            .where(
                RetentionReview.decision == "undecided",
                RetentionReview.subject == "records",
            )
            .order_by(RetentionReview.created_at, RetentionReview.id)
        )
        .unique()
        .all()
    )

    reviews: list[RetentionReviewOut] = []

    for review, user, org_unit in rows:
        attempts, enrolments = delete_training_records(
            db, review.user_id, org_unit.id, apply=False
        )
        reviews.append(
            RetentionReviewOut(
                id=review.id,
                user_id=user.id,
                full_name=user.full_name or "",
                email=user.email,
                org_unit_id=org_unit.id,
                organisation=org_unit.name,
                closed_at=review.closed_at,
                due_on=review.due_on,
                attempts=attempts,
                enrolments=enrolments,
                listed_at=review.created_at,
            )
        )

    account_rows = (
        db.execute(
            select(RetentionReview, User)
            .join(User, User.id == RetentionReview.user_id)
            .where(
                RetentionReview.decision == "undecided",
                RetentionReview.subject == "account",
            )
            .order_by(RetentionReview.created_at, RetentionReview.id)
        )
        .unique()
        .all()
    )
    accounts = [
        RetentionAccountOut(
            id=review.id,
            user_id=user.id,
            full_name=user.full_name or "",
            email=user.email,
            closed_at=review.closed_at,
            due_on=review.due_on,
            listed_at=review.created_at,
        )
        for review, user in account_rows
    ]

    return RetentionReviewListOut(reviews=reviews, accounts=accounts)


@router.post(
    "/decisions",
    response_model=RetentionDecisionsOut,
    dependencies=[DEP_REQUIRE_CSRF],
)
def decide(
    body: RetentionDecisionsIn,
    operator: User = MAY_DECIDE,
    db: Session = _DEP_SESSION,
) -> RetentionDecisionsOut:
    """Carry out the decisions made in one go.

    Each is carried out or refused on its own, so one that cannot be
    done does not hold back the rest. A row left out of the request
    stays undecided.

    A deletion is permanent. It is checked again here that the account
    is still past its period, whatever the list said when it was drawn.

    An account is not emptied here. It is marked, and the nightly run
    that follows empties it.
    """
    now = datetime.now(UTC)
    deleted = 0
    kept = 0
    to_empty = 0
    refused: list[RetentionRefusalOut] = []
    seen: set[int] = set()

    for decision in body.decisions:
        if decision.review_id in seen:
            refused.append(
                RetentionRefusalOut(
                    review_id=decision.review_id,
                    reason="This was sent twice in one request.",
                )
            )
            continue

        seen.add(decision.review_id)
        review = db.get(RetentionReview, decision.review_id)

        if review is None:
            refused.append(
                RetentionRefusalOut(
                    review_id=decision.review_id,
                    reason="There is no such set of records to decide.",
                )
            )
            continue

        delete_them = decision.decision == "delete"
        reason = carry_out_decision(
            db,
            review,
            delete_them=delete_them,
            note=decision.note,
            ask_again_on=decision.ask_again_on,
            decided_by=operator.id,
            now=now,
        )

        if reason is not None:
            refused.append(
                RetentionRefusalOut(
                    review_id=decision.review_id, reason=reason
                )
            )
        elif delete_them and review.subject == "account":
            to_empty += 1
        elif delete_them:
            deleted += 1
        else:
            kept += 1

    # Who did it and how many, and never whose records they were.
    logger.info(
        "Retention decisions by user %s: %s deleted, %s kept, "
        "%s to empty, %s refused",
        operator.id,
        deleted,
        kept,
        to_empty,
        len(refused),
    )

    return RetentionDecisionsOut(
        deleted=deleted, kept=kept, to_empty=to_empty, refused=refused
    )

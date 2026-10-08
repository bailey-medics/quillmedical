"""Feature-gating dependency.

Provides ``requires_feature`` - a FastAPI dependency that checks whether
any of the authenticated user's organisations has a given feature enabled.
Same ergonomics as ``has_competency`` in ``app.deps``.

This lives here rather than in ``app.features.__init__`` so that importing
anything under ``app.features`` stays cheap.  The package ``__init__`` is
deliberately docstring-only: pulling FastAPI, SQLAlchemy and ``app.config``
into every ``app.features.*`` import would make the content-validation
package unusable as a standalone CI tool, since ``Settings`` requires
``JWT_SECRET`` and ``CORE_DB_PASSWORD``.
"""

from collections.abc import Callable

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_core_db
from app.models import (
    OrgUnitFeature,
    User,
    org_unit_member,
)
from app.organisations import feature_holder_ids_of


def feature_holders_for(db: Session, user_id: int) -> set[int]:
    """Return the org_units whose features reach *user_id*.

    The ones they belong to directly, and the organisation above each.

    Args:
        db: Core database session.
        user_id: The person.

    Returns:
        The org_unit ids, empty when they belong nowhere.
    """
    return feature_holder_ids_of(
        db,
        [
            int(org_unit_id)
            for org_unit_id in db.execute(
                select(org_unit_member.c.org_unit_id).where(
                    org_unit_member.c.user_id == user_id
                )
            )
            .scalars()
            .all()
        ],
    )


def user_has_feature(db: Session, user_id: int, feature_key: str) -> bool:
    """Whether *feature_key* is switched on somewhere that reaches *user_id*.

    The question ``requires_feature`` asks, for a caller that needs the
    answer rather than a refusal.

    Args:
        db: Core database session.
        user_id: The person.
        feature_key: The feature.

    Returns:
        True when the feature reaches them.
    """
    holders = feature_holders_for(db, user_id)

    if not holders:
        return False

    return (
        db.scalar(
            select(OrgUnitFeature.id).where(
                OrgUnitFeature.org_unit_id.in_(holders),
                OrgUnitFeature.feature_key == feature_key,
            )
        )
        is not None
    )


def requires_feature(feature_key: str) -> Callable[..., User]:
    """FastAPI dependency: check the user's org has *feature_key* enabled.

    Usage::

        @router.get(
            "/teaching/items",
            dependencies=[Depends(requires_feature("teaching"))],
        )
        def list_items(...): ...

    Returns 403 if the user has no organisation or the feature is not enabled.
    """

    def _check(
        request: Request,
        db: Session = Depends(get_core_db),
    ) -> User:
        # Lazy import to avoid circular dependency with app.main
        from app.main import get_current_user

        user = get_current_user(request, db)

        if not feature_holders_for(db, user.id):
            raise HTTPException(
                status_code=403,
                detail="User has no organisation",
            )

        if not user_has_feature(db, user.id, feature_key):
            raise HTTPException(
                status_code=403,
                detail=f"Feature '{feature_key}' is not enabled "
                f"for any of your organisations",
            )

        return user

    return _check

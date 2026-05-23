"""Feature-gating utilities.

Provides ``requires_feature`` — a FastAPI dependency that checks whether
any of the authenticated user's organisations has a given feature enabled.
Same ergonomics as ``has_competency`` in ``app.cbac.decorators``.
"""

from collections.abc import Callable

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import OrganisationFeature, User, organisation_staff_member


def requires_feature(feature_key: str) -> Callable[..., User]:
    """FastAPI dependency: check the user's org has *feature_key* enabled.

    Usage::

        @router.get(
            "/teaching/items",
            dependencies=[Depends(requires_feature("teaching"))],
        )
        def list_items(...): ...

    Returns 403 if the user has no primary org or the feature is not enabled.
    """

    def _check(
        request: Request,
        db: Session = Depends(get_session),
    ) -> User:
        # Lazy import to avoid circular dependency with app.main
        from app.main import current_user

        user = current_user(request, db)

        user_org_ids = (
            db.execute(
                select(organisation_staff_member.c.organisation_id).where(
                    organisation_staff_member.c.user_id == user.id,
                )
            )
            .scalars()
            .all()
        )

        if not user_org_ids:
            raise HTTPException(
                status_code=403,
                detail="User has no organisation",
            )

        enabled = db.scalar(
            select(OrganisationFeature.id).where(
                OrganisationFeature.organisation_id.in_(user_org_ids),
                OrganisationFeature.feature_key == feature_key,
            )
        )
        if enabled is None:
            raise HTTPException(
                status_code=403,
                detail=f"Feature '{feature_key}' is not enabled "
                f"for this organisation",
            )

        return user

    return _check

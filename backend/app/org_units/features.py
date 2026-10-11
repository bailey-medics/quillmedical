"""Which features an org unit carries, and who may switch one.

Any org unit may carry a feature, whatever its type. What the feature
reaches is decided by who is a member there, not by what the org unit
is called.
"""

from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.passport import cover
from app.features.passport.cover import COVER_FEATURE
from app.models import OrgUnit, OrgUnitFeature, User
from app.org_units.access import require_visible
from app.org_units.errors import (
    CoverNeedsAnOperator,
    CoverNeedsThePassport,
    FeatureForOrganisationsOnly,
)
from app.org_units.tree import organisation_org_unit_ids

#: Features that are switched on for an organisation and nowhere else.
#:
#: Teaching: a question bank is set live for an organisation and reaches
#: its sites from there, and assessments are recorded against it. On a
#: site the switch let its members in and gave them nothing, with no way
#: to open a bank for them. Kept in step with the same list in the
#: frontend's ``OrgFeaturesPage``.
ORGANISATION_ONLY_FEATURES: frozenset[str] = frozenset({"teaching"})

FeatureOutcome = Literal[
    "enabled", "already_enabled", "disabled", "already_disabled"
]


def has_feature(db: Session, unit_id: int, feature_key: str) -> bool:
    """Whether *feature_key* is switched on at the org_unit itself."""
    return (
        db.scalar(
            select(OrgUnitFeature.id).where(
                OrgUnitFeature.org_unit_id == unit_id,
                OrgUnitFeature.feature_key == feature_key,
            )
        )
        is not None
    )


def switch_feature(
    db: Session,
    caller: User,
    unit_id: int,
    feature_key: str,
    *,
    enabled: bool,
) -> FeatureOutcome:
    """Switch a feature on or off at an org_unit.

    ``ORGANISATION_ONLY_FEATURES`` are the exception to any org_unit
    carrying a feature: one of those is switched on for an organisation
    alone. Switching one off is allowed anywhere, so a site that already
    has it can be put right.

    Passport cover follows the passport: it is switched on only where
    the passport is, and switching the passport off takes the cover with
    it.

    The rows are flushed, not committed.

    Args:
        db: Core database session.
        caller: Who is asking, recorded as who switched it on.
        unit_id: The org_unit.
        feature_key: The feature. Stored as given: nothing checks it
            against a list of features.
        enabled: True to switch it on, False to switch it off.

    Returns:
        ``"enabled"`` or ``"disabled"`` when something changed, and
        ``"already_enabled"`` or ``"already_disabled"`` when it was as
        asked already.

    Raises:
        OrgUnitNotFound: If no org_unit has that id, or one does that
            the caller may not see.
        CoverNeedsAnOperator: If the feature is passport cover and the
            caller is not an operator, whichever way it is switched.
        FeatureForOrganisationsOnly: If an organisation-only feature is
            switched on at anything but an organisation.
        CoverNeedsThePassport: If passport cover is switched on where
            the passport is not.
    """
    require_visible(db, caller, unit_id)

    # Passport cover gives every member the competency to write in their
    # passport, so whoever switches it decides who holds that. An
    # operator only, in both directions: an administrator of a trust
    # must not be able to hand writing to everybody in it.
    if feature_key == COVER_FEATURE and caller.platform_role != "superadmin":
        raise CoverNeedsAnOperator()

    existing = db.scalar(
        select(OrgUnitFeature).where(
            OrgUnitFeature.org_unit_id == unit_id,
            OrgUnitFeature.feature_key == feature_key,
        )
    )

    if enabled:
        if existing is not None:
            return "already_enabled"
        if (
            feature_key in ORGANISATION_ONLY_FEATURES
            and db.scalar(
                organisation_org_unit_ids().where(OrgUnit.id == unit_id)
            )
            is None
        ):
            raise FeatureForOrganisationsOnly()
        if feature_key == COVER_FEATURE and not has_feature(
            db, unit_id, "passport"
        ):
            raise CoverNeedsThePassport()
        db.add(
            OrgUnitFeature(
                org_unit_id=unit_id,
                feature_key=feature_key,
                enabled_by=caller.id,
            )
        )
        db.flush()
        if feature_key == COVER_FEATURE:
            cover.switch_on(db, unit_id, caller)
        return "enabled"

    if existing is None:
        return "already_disabled"
    db.delete(existing)
    if feature_key == "passport":
        # The cover means nothing without the passport, so it goes too.
        cover_row = db.scalar(
            select(OrgUnitFeature).where(
                OrgUnitFeature.org_unit_id == unit_id,
                OrgUnitFeature.feature_key == COVER_FEATURE,
            )
        )
        if cover_row is not None:
            db.delete(cover_row)
            cover.switch_off(db, unit_id)
    if feature_key == COVER_FEATURE:
        cover.switch_off(db, unit_id)
    db.flush()

    return "disabled"

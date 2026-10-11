"""Which features an org unit carries, and who may switch one."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.passport import cover
from app.features.passport.cover import COVER_FEATURE
from app.models import OrgUnit, OrgUnitFeature, User
from app.org_units.errors import (
    CoverNeedsAnOperator,
    CoverNeedsThePassport,
    FeatureForOrganisationsOnly,
    OrgUnitNotFound,
)
from app.org_units.features import (
    ORGANISATION_ONLY_FEATURES,
    has_feature,
    switch_feature,
)
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.places import administers

#: An id no org unit has.
NOWHERE = 999_999


def _person(
    db: Session,
    username: str,
    profession: str,
    platform_role: str = "standard",
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        platform_role=platform_role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return user


def _org_unit(
    db: Session, name: str, type_: str, parent: OrgUnit | None = None
) -> OrgUnit:
    unit = OrgUnit(
        name=name,
        type=type_,
        parent_id=parent.id if parent is not None else None,
    )
    db.add(unit)
    db.commit()
    db.refresh(unit)

    return unit


def _on(db: Session, unit: OrgUnit, *feature_keys: str) -> None:
    """Switch features on by writing their rows, with no rule asked."""
    for feature_key in feature_keys:
        db.add(OrgUnitFeature(org_unit_id=unit.id, feature_key=feature_key))
    db.commit()


def _features(db: Session, unit: OrgUnit) -> set[str]:
    return set(
        db.scalars(
            select(OrgUnitFeature.feature_key).where(
                OrgUnitFeature.org_unit_id == unit.id
            )
        ).all()
    )


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    return _org_unit(db_session, "Severn Trust", "organisation")


@pytest.fixture
def site(db_session: Session, trust: OrgUnit) -> OrgUnit:
    return _org_unit(db_session, "Ward 4", "site", trust)


@pytest.fixture
def other_trust(db_session: Session) -> OrgUnit:
    """Somebody else's tree."""
    return _org_unit(db_session, "Wye Trust", "organisation")


@pytest.fixture
def manager(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_users`` and administers the trust."""
    user = _person(db_session, "manager", "system_administrator")
    administers(db_session, user.id, trust.id)

    return user


@pytest.fixture
def operator(db_session: Session) -> User:
    return _person(
        db_session,
        "operator",
        "superadmin_profession",
        platform_role="superadmin",
    )


@pytest.fixture
def trainee(db_session: Session, trust: OrgUnit) -> User:
    """A trainee at the trust, whom its cover would reach."""
    user = _person(db_session, "trainee", "teaching_delegate")
    add_org_unit_member(db_session, trust.id, user.id, "trainee")
    db_session.commit()

    return user


def test_teaching_is_switched_on_for_an_organisation_alone() -> None:
    assert ORGANISATION_ONLY_FEATURES == frozenset({"teaching"})


# --- whether a feature is on ------------------------------------------------


def test_a_feature_with_a_row_here_is_on(
    db_session: Session, trust: OrgUnit, site: OrgUnit
) -> None:
    _on(db_session, trust, "messaging")

    assert has_feature(db_session, trust.id, "messaging") is True
    assert has_feature(db_session, trust.id, "letters") is False
    # At the org unit itself: nothing is inherited.
    assert has_feature(db_session, site.id, "messaging") is False


# --- who may switch ---------------------------------------------------------


def test_switching_at_an_org_unit_outside_their_reach_is_not_found(
    db_session: Session, manager: User, other_trust: OrgUnit
) -> None:
    with pytest.raises(OrgUnitNotFound):
        switch_feature(
            db_session, manager, other_trust.id, "messaging", enabled=True
        )

    with pytest.raises(OrgUnitNotFound):
        switch_feature(db_session, manager, NOWHERE, "messaging", enabled=True)

    assert _features(db_session, other_trust) == set()


def test_only_an_operator_switches_passport_cover_on(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    _on(db_session, trust, "passport")

    with pytest.raises(CoverNeedsAnOperator):
        switch_feature(
            db_session, manager, trust.id, COVER_FEATURE, enabled=True
        )

    assert _features(db_session, trust) == {"passport"}


def test_only_an_operator_switches_passport_cover_off(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    _on(db_session, trust, "passport", COVER_FEATURE)

    with pytest.raises(CoverNeedsAnOperator):
        switch_feature(
            db_session, manager, trust.id, COVER_FEATURE, enabled=False
        )

    assert _features(db_session, trust) == {"passport", COVER_FEATURE}


# --- switching on -----------------------------------------------------------


def test_a_feature_is_switched_on_and_says_by_whom(
    db_session: Session, manager: User, site: OrgUnit
) -> None:
    assert (
        switch_feature(db_session, manager, site.id, "messaging", enabled=True)
        == "enabled"
    )

    row = db_session.scalar(
        select(OrgUnitFeature).where(OrgUnitFeature.org_unit_id == site.id)
    )
    assert row is not None
    assert row.feature_key == "messaging"
    assert row.enabled_by == manager.id


def test_switching_on_what_is_on_changes_nothing(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    _on(db_session, trust, "messaging")

    assert (
        switch_feature(
            db_session, manager, trust.id, "messaging", enabled=True
        )
        == "already_enabled"
    )

    assert _features(db_session, trust) == {"messaging"}


def test_teaching_is_not_switched_on_at_a_site(
    db_session: Session, manager: User, site: OrgUnit
) -> None:
    with pytest.raises(FeatureForOrganisationsOnly):
        switch_feature(db_session, manager, site.id, "teaching", enabled=True)

    assert _features(db_session, site) == set()


def test_teaching_is_switched_on_at_an_organisation(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    assert (
        switch_feature(db_session, manager, trust.id, "teaching", enabled=True)
        == "enabled"
    )


def test_a_site_that_already_has_teaching_is_told_so(
    db_session: Session, manager: User, site: OrgUnit
) -> None:
    """Asked before the organisation rule, so it answers and is not refused."""
    _on(db_session, site, "teaching")

    assert (
        switch_feature(db_session, manager, site.id, "teaching", enabled=True)
        == "already_enabled"
    )


def test_cover_is_not_switched_on_where_the_passport_is_off(
    db_session: Session, operator: User, trust: OrgUnit
) -> None:
    with pytest.raises(CoverNeedsThePassport):
        switch_feature(
            db_session, operator, trust.id, COVER_FEATURE, enabled=True
        )

    assert _features(db_session, trust) == set()


def test_cover_switched_on_gives_its_members_writing(
    db_session: Session, operator: User, trust: OrgUnit, trainee: User
) -> None:
    _on(db_session, trust, "passport")

    assert (
        switch_feature(
            db_session, operator, trust.id, COVER_FEATURE, enabled=True
        )
        == "enabled"
    )

    assert cover.is_covered(db_session, trust.id) is True
    assert cover.covered_count(db_session, trust.id) == 1
    # The grant is its own row, so their loaded rows are read again.
    db_session.refresh(trainee)
    assert "passport_write" in trainee.get_final_competencies()


# --- switching off ----------------------------------------------------------


def test_switching_off_what_is_off_changes_nothing(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    assert (
        switch_feature(
            db_session, manager, trust.id, "messaging", enabled=False
        )
        == "already_disabled"
    )


def test_a_feature_is_switched_off(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    _on(db_session, trust, "messaging", "letters")

    assert (
        switch_feature(
            db_session, manager, trust.id, "messaging", enabled=False
        )
        == "disabled"
    )

    assert _features(db_session, trust) == {"letters"}


def test_teaching_may_be_switched_off_at_a_site_that_has_it(
    db_session: Session, manager: User, site: OrgUnit
) -> None:
    _on(db_session, site, "teaching")

    assert (
        switch_feature(db_session, manager, site.id, "teaching", enabled=False)
        == "disabled"
    )

    assert _features(db_session, site) == set()


def test_switching_the_passport_off_takes_its_cover_with_it(
    db_session: Session, operator: User, trust: OrgUnit, trainee: User
) -> None:
    _on(db_session, trust, "passport")
    switch_feature(db_session, operator, trust.id, COVER_FEATURE, enabled=True)

    assert (
        switch_feature(
            db_session, operator, trust.id, "passport", enabled=False
        )
        == "disabled"
    )

    assert _features(db_session, trust) == set()
    assert cover.covered_count(db_session, trust.id) == 0


def test_an_administrator_switching_the_passport_off_takes_the_cover_too(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    """The operator rule is asked of the cover's own switch, not of this."""
    _on(db_session, trust, "passport", COVER_FEATURE)

    assert (
        switch_feature(
            db_session, manager, trust.id, "passport", enabled=False
        )
        == "disabled"
    )

    assert _features(db_session, trust) == set()


def test_the_passport_with_no_cover_is_switched_off(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    _on(db_session, trust, "passport")

    assert (
        switch_feature(
            db_session, manager, trust.id, "passport", enabled=False
        )
        == "disabled"
    )

    assert _features(db_session, trust) == set()


def test_an_operator_switches_cover_off_and_the_passport_stays(
    db_session: Session, operator: User, trust: OrgUnit, trainee: User
) -> None:
    _on(db_session, trust, "passport")
    switch_feature(db_session, operator, trust.id, COVER_FEATURE, enabled=True)

    assert (
        switch_feature(
            db_session, operator, trust.id, COVER_FEATURE, enabled=False
        )
        == "disabled"
    )

    assert _features(db_session, trust) == {"passport"}
    assert cover.covered_count(db_session, trust.id) == 0


def test_a_feature_key_nothing_knows_is_stored_as_given(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    """Found while moving the rule out of the route, and pinned, not fixed.

    The key comes from the path and is checked against no list of
    features, so any text is written as a feature row.
    """
    assert (
        switch_feature(
            db_session, manager, trust.id, "no_such_feature", enabled=True
        )
        == "enabled"
    )

    assert _features(db_session, trust) == {"no_such_feature"}

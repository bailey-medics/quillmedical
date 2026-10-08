"""One surface for every org_unit.

``/api/organisations`` and ``/api/sites`` grew up as two surfaces over two
tables. There is one table now, so there is one surface: every route here
takes an org_unit id, and what an org_unit *is* comes from its ``type``.

The two older surfaces stay until the frontend has moved across. They are
not views over this one - they answer in organisation ids and site ids,
which are different numbers - so both are served side by side and the old
pair is retired once nothing reads it.

**Nothing here is inherited.** A ward does not take on its trust's
features, members or patient list; each is a fact about one org_unit. Only
scoping walks the tree, which is what decides who may see and edit what.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from app.cbac.base_professions import (
    competencies_kept_across_profession_change,
    get_profession_base_competencies,
    resolve_user_competencies,
)
from app.cbac.competencies import FRAMEWORK_IDS, SCOPED_MANAGER_IDS
from app.cbac.grant_scope import (
    may_assign_profession,
    may_manage_account,
    out_of_scope_competencies,
    scope_for,
)
from app.cbac.grants import sync_competency_rows
from app.cbac.positions import clinical_leads_of, set_clinical_lead
from app.cbac.scoped import authorise_practice, withdraw_practice
from app.db import get_core_db
from app.deps import (
    DEP_CURRENT_USER,
    DEP_REQUIRE_CLINICAL,
    get_current_user,
    has_competency,
    requires_any_competency,
)
from app.features.passport import cover
from app.features.passport.cover import COVER_FEATURE
from app.features.passport.models import OrgUnitPassportFramework
from app.models import (
    MEMBER_CAPACITIES,
    OrgUnit,
    OrgUnitFeature,
    OrgUnitLink,
    PractisingCompetency,
    User,
    org_unit_member,
    org_unit_patient_member,
    validate_member_capacity,
)
from app.org_units.relations import (
    ORG_UNIT_RELATION_IDS,
    get_org_unit_relation,
    validate_org_unit_relation,
)
from app.org_units.tree import (
    organisation_org_unit_ids,
    would_make_a_cycle,
)
from app.org_units.types import (
    ORG_UNIT_TYPE_IDS,
    get_org_unit_type,
    type_can_have_members,
    type_can_hold_competencies,
    type_can_hold_positions,
    type_requires_parent,
    validate_org_unit_type,
)
from app.organisations import (
    is_member_within,
    org_units_administered_by,
    org_units_run_by_scoped_manager,
    org_units_whose_people_reached_by,
)
from app.rate_limit import limiter
from app.schemas.org_units import (
    AddOrgUnitMemberIn,
    AddOrgUnitPatientIn,
    AuthorisePractisingCompetencyIn,
    CreateOrgUnitIn,
    GrantAndAuthoriseIn,
    MemberAuthorisationItem,
    MemberLookupIn,
    MemberLookupOut,
    MemberLookupUser,
    MemberPracticeOut,
    OrgUnitDetailOut,
    OrgUnitFeaturesOut,
    OrgUnitItem,
    OrgUnitMembersOut,
    OrgUnitPassportCoverOut,
    OrgUnitPassportFrameworksOut,
    OrgUnitsListOut,
    OrgUnitStatusOut,
    PractisingCompetenciesOut,
    SetClinicalLeadIn,
    SetOrgUnitPassportFrameworksIn,
    ToggleOrgUnitActiveIn,
    ToggleOrgUnitFeatureIn,
    UpdateOrgUnitIn,
)
from app.schemas.organisations import (
    CreateOrgUnitLinkIn,
    OrgUnitLinkItem,
    OrgUnitLinksOut,
)

_DEP_SESSION = Depends(get_core_db)


def _require_csrf(request: Request, db: Session = _DEP_SESSION) -> None:
    """Check the CSRF token, borrowing ``main``'s implementation.

    ``main`` imports this router, so importing ``require_csrf`` at module
    level would be a cycle. The teaching router does the same thing for
    the same reason.
    """
    from app.main import require_csrf

    require_csrf(request, get_current_user(request, db))


DEP_REQUIRE_CSRF = Depends(_require_csrf)
DEP_REQUIRE_MANAGE_USERS = Depends(has_competency("manage_users"))
DEP_REQUIRE_MANAGE_STAFF = Depends(has_competency("manage_staff_membership"))
DEP_REQUIRE_MANAGE_PATIENTS = Depends(
    has_competency("manage_patient_membership")
)
#: The same three, each also admitting a scoped manager: a competency with
#: a ``may_grant`` or ``may_assign_professions`` whitelist, such as
#: ``manage_teaching``. A holder of the original competency is unaffected:
#: the route behaves exactly as before. Somebody who reaches it through a
#: scoped manager alone acts where they are a member, and only within its
#: whitelist, which the route body enforces through ``_through_a_scope``.
#: See ``docs/docs/plans/2026-09-30-manage-teaching-competency-plan.md``.
DEP_REQUIRE_MANAGE_USERS_OR_SCOPED = Depends(
    requires_any_competency("manage_users", *SCOPED_MANAGER_IDS)
)
DEP_REQUIRE_MANAGE_STAFF_OR_SCOPED = Depends(
    requires_any_competency("manage_staff_membership", *SCOPED_MANAGER_IDS)
)
DEP_REQUIRE_MANAGE_PRACTISING_OR_SCOPED = Depends(
    requires_any_competency(
        "manage_practising_competencies", *SCOPED_MANAGER_IDS
    )
)


router = APIRouter(prefix="/org-units", tags=["org-units"])

#: Features that are switched on for an organisation and nowhere else.
#:
#: Teaching: a question bank is set live for an organisation and reaches
#: its sites from there, and assessments are recorded against it. On a
#: site the switch let its members in and gave them nothing, with no way
#: to open a bank for them. Kept in step with the same list in the
#: frontend's ``OrgFeaturesPage``.
ORGANISATION_ONLY_FEATURES: frozenset[str] = frozenset({"teaching"})


# ------------------------------------------------------------------
# Who may see what
# ------------------------------------------------------------------


def _visible_ids(db: Session, user: User) -> set[int] | None:
    """Return the org_units *user* may administer, or None for all of them.

    Answered from ``practising_competency`` rows rather than from
    membership, in ``org_units_administered_by`` itself: the same
    question is asked by the user routes in ``main``, and two surfaces
    disagreeing about who administers an org_unit is worse than either
    answer. A row reaches the org_units beneath it.

    Reach is deliberately not used here. Reach is why somebody sees
    teaching content at an org_unit they visit; it is not authority to
    administer that org_unit, and these are the administration routes.
    """
    return org_units_administered_by(db, user)


def _through_a_scope(user: User, *competencies: str) -> bool:
    """Whether *user* reaches a route only through a scoped manager.

    True when they lack any of the competencies the route has always
    needed and hold a scoped manager, such as ``manage_teaching``. Such a
    caller acts where they are a member, which is how teaching's own
    admin routes scope them, and within their whitelist.

    Args:
        user: The caller.
        *competencies: What the route needed before scoped managers.

    Returns:
        True for the narrower path.
    """
    held = set(user.get_final_competencies())

    return not held.isdisjoint(SCOPED_MANAGER_IDS) and not (
        set(competencies) <= held
    )


def _scoped_manager_ids(db: Session, user: User) -> set[int]:
    """Return the org_units a scoped manager may act at.

    Answered by ``org_units_run_by_scoped_manager``, which the user
    routes in ``main`` ask too: two surfaces disagreeing about where a
    scoped manager acts is worse than either answer.

    Args:
        db: Core database session.
        user: The caller, who reached the route through a scoped
            manager such as ``manage_teaching``.
    """
    return org_units_run_by_scoped_manager(db, user.id)


def _require_editable(db: Session, user: User, unit_id: int) -> OrgUnit:
    """Return the org_unit the caller may edit, or refuse.

    ``manage_users`` edits what it administers, as it always has. A
    scoped manager such as ``manage_teaching`` edits a site they act at:
    whoever runs teaching there keeps its name, kind, address and whether
    it is in use right. An organisation is not theirs to edit, since
    that reshapes more than teaching, and it stays with ``manage_users``.

    Args:
        db: Core database session.
        user: The caller.
        unit_id: The org_unit.
    """
    unit = _require_visible(db, user, unit_id, "manage_users")

    if _through_a_scope(user, "manage_users") and not type_requires_parent(
        unit.type
    ):
        raise HTTPException(
            status_code=403,
            detail="Editing an organisation requires manage_users.",
        )

    return unit


def _require_parent_is_an_organisation(parent: OrgUnit) -> None:
    """Refuse a parent that is not an organisation.

    **The tree is two levels for now**: an organisation, and the sites
    directly inside it. Nothing reads a site inside a site yet, on the
    organisation and site pages or in teaching, so one made here would be
    a place nobody could find their way to.

    This is a rule about what may be created or moved today, not about
    what the tree can hold. ``descendant_ids`` and the type vocabulary
    still describe any depth, and rows already deeper are left alone.
    When a third level is wanted, this is the one check to take out.

    Args:
        parent: The org_unit something is being put inside.
    """
    if type_requires_parent(parent.type):
        raise HTTPException(
            status_code=422,
            detail=(
                "A site sits directly inside an organisation, not inside "
                "another site."
            ),
        )


def _require_visible(
    db: Session, user: User, unit_id: int, *needs: str
) -> OrgUnit:
    """Return the org_unit, or refuse with a 404.

    404 rather than 403 throughout, so a refusal does not confirm that a
    org_unit exists to somebody who may not see it.

    Args:
        db: Core database session.
        user: The caller.
        unit_id: The org_unit.
        *needs: The competencies the route needed before
            scoped managers. When the caller lacks them and reaches
            the route through a scoped manager, what they may see is
            the org_units they belong to rather than those they
            administer.
    """
    unit = db.get(OrgUnit, unit_id)

    if unit is None:
        raise HTTPException(status_code=404, detail="Place not found")

    if needs and _through_a_scope(user, *needs):
        visible: set[int] | None = _scoped_manager_ids(db, user)
    else:
        visible = _visible_ids(db, user)
    if visible is not None and unit_id not in visible:
        raise HTTPException(status_code=404, detail="Place not found")

    return unit


def _require_in_scope(user: User, competencies: set[str]) -> None:
    """Refuse a change to competencies outside the caller's whitelist.

    Raises:
        HTTPException: 403 naming every competency out of scope.
    """
    refused = out_of_scope_competencies(user, competencies)

    if refused:
        raise HTTPException(
            status_code=403,
            detail=(
                "You may not grant or remove: " + ", ".join(refused) + "."
            ),
        )


def practice_refusal(
    db: Session,
    caller: User,
    *,
    unit_id: int,
    user_id: int,
    competency: str,
    authorising: bool,
) -> HTTPException | None:
    """Why *caller* may not set somebody's practice at an org_unit, or None.

    The one answer to "may this caller write this practice row?", asked
    by the two practice routes here and by the user routes in ``main``,
    which write the same rows when a user is created or edited. Returned
    and not raised, so a caller settling several rows at once can gather
    every refusal and name them together.

    Both directions need the org_unit to be one the caller reaches for
    ``manage_practising_competencies``, and a caller who reaches it only
    through a scoped manager, such as ``manage_teaching``, to stay inside
    its whitelist. Authorising asks for more than withdrawing does: the
    org_unit's type must be one somebody can practise at, the person must
    exist, and a scoped manager may authorise only a member of the
    org_unit. Withdrawing asks for none of those, so that a row can always
    be taken away, whatever has happened to the person or the place since
    it was written.

    Args:
        db: Core database session.
        caller: Who is asking.
        unit_id: The org_unit.
        user_id: The person whose practice it is.
        competency: A competency id.
        authorising: True to authorise, False to withdraw.

    Returns:
        The refusal to raise, or None when the row may be written.
    """
    needs = "manage_practising_competencies"

    try:
        unit = _require_visible(db, caller, unit_id, needs)
        if authorising and not type_can_hold_competencies(unit.type):
            raise HTTPException(
                status_code=422,
                detail=f"Nobody practises anything at a {unit.type}.",
            )
        if _through_a_scope(caller, needs):
            if authorising:
                _require_member(db, unit_id, user_id)
            _require_in_scope(caller, {competency})
        if authorising and db.get(User, user_id) is None:
            raise HTTPException(status_code=404, detail="User not found")
    except HTTPException as refusal:
        return refusal

    return None


def _require_account_in_scope(user: User, person: User) -> None:
    """Refuse an act on an account holding more than the caller may grant.

    Raises:
        HTTPException: 403 if the account is outside their scope.
    """
    if not may_manage_account(user, person):
        raise HTTPException(
            status_code=403,
            detail="This account is outside what you may manage.",
        )


def _known_type(value: str) -> str:
    """Return the type, or refuse with a message naming the known ones.

    The message is written here rather than taken from the exception: a
    caught exception's text must not reach a client, because the next
    person to raise one may put something in it that should not travel.
    """
    try:
        return validate_org_unit_type(value)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=(
                "Unknown kind of place. Must be one of: "
                + ", ".join(ORG_UNIT_TYPE_IDS)
            ),
        ) from None


def _known_capacity(value: str) -> str:
    """Return the capacity, or refuse naming the known ones."""
    try:
        return validate_member_capacity(value)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=(
                "Unknown capacity. Must be one of: "
                + ", ".join(MEMBER_CAPACITIES)
            ),
        ) from None


def _is_root(unit: OrgUnit) -> bool:
    """Whether this org_unit is the top of a tree.

    Declared by the type, never inferred from having no parent. That is
    the one piece of future-proofing the design pays for: the day a body
    has to sit above today's organisations, a trust keeps its type, gains
    a parent, and one flag changes in a configuration file.
    """
    return not type_requires_parent(unit.type)


def _item(unit: OrgUnit) -> OrgUnitItem:
    """Build the list entry for one org_unit."""
    definition = get_org_unit_type(unit.type)

    return OrgUnitItem(
        id=unit.id,
        name=unit.name,
        type=unit.type,
        type_display_name=(
            definition.display_name if definition else unit.type
        ),
        is_root=_is_root(unit),
        parent_id=unit.parent_id,
        location=unit.location or "",
        is_active=unit.is_active,
        created_at=unit.created_at.isoformat(),
        updated_at=unit.updated_at.isoformat(),
    )


def _names_of(db: Session, user_ids: set[int]) -> dict[int, str]:
    """Return a readable name for each of *user_ids*.

    Resolved in one query so a list of org_units does not cost one request
    per row to say who leads it.
    """
    if not user_ids:
        return {}

    return {
        row.id: row.full_name or row.username
        for row in db.execute(
            select(User.id, User.full_name, User.username).where(
                User.id.in_(user_ids)
            )
        ).all()
    }


def _authorised_counts(db: Session, unit_id: int) -> dict[int, int]:
    """How many competencies each person may practise at one org_unit.

    Rows beyond somebody's ceiling authorise nothing, so only rows within
    it are counted. Users are loaded only where they hold a row here, so
    a large staff list with few authorisations stays cheap.
    """
    by_user: dict[int, set[str]] = {}

    for user_id, competency in db.execute(
        select(
            PractisingCompetency.user_id, PractisingCompetency.competency
        ).where(PractisingCompetency.org_unit_id == unit_id)
    ).all():
        by_user.setdefault(user_id, set()).add(competency)
    if not by_user:
        return {}

    users = db.scalars(select(User).where(User.id.in_(by_user))).unique().all()

    return {
        user.id: len(by_user[user.id] & set(user.get_final_competencies()))
        for user in users
    }


def _members_of(db: Session, unit_id: int) -> OrgUnitMembersOut:
    """Return everybody at one org_unit, by username."""
    rows = db.execute(
        select(
            User.id,
            User.username,
            User.email,
            User.full_name,
            org_unit_member.c.capacity,
        )
        .join(org_unit_member, org_unit_member.c.user_id == User.id)
        .where(org_unit_member.c.org_unit_id == unit_id)
        .order_by(User.username)
    ).all()
    counts = _authorised_counts(db, unit_id)

    return OrgUnitMembersOut(
        members=[
            {
                "id": row.id,
                "username": row.username,
                "email": row.email,
                "full_name": row.full_name or "",
                "capacity": row.capacity,
                "authorised_here": counts.get(row.id, 0),
            }
            for row in rows
        ]
    )


# ------------------------------------------------------------------
# org_units
# ------------------------------------------------------------------


@router.get(
    "",
    response_model=OrgUnitsListOut,
    dependencies=[DEP_REQUIRE_MANAGE_USERS_OR_SCOPED],
)
def list_org_units(
    roots: bool | None = None,
    parent_id: int | None = None,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitsListOut:
    """List the org_units the caller may administer.

    ``roots=true`` returns the organisations and ``roots=false`` the
    org_units inside them; ``parent_id`` narrows to one org_unit's children.
    Given neither, every org_unit the caller may administer comes back.

    Requires ``manage_users``, or a scoped manager for the
    organisations the caller belongs to and the org_units beneath them.
    """
    stmt = select(OrgUnit).order_by(OrgUnit.name)

    visible: set[int] | None

    if _through_a_scope(current_user, "manage_users"):
        visible = _scoped_manager_ids(db, current_user)
    else:
        visible = _visible_ids(db, current_user)
    if visible is not None:
        if not visible:
            return OrgUnitsListOut(org_units=[])
        stmt = stmt.where(OrgUnit.id.in_(visible))

    if parent_id is not None:
        stmt = stmt.where(OrgUnit.parent_id == parent_id)

    units = list(db.execute(stmt).scalars().all())

    if roots is not None:
        units = [unit for unit in units if _is_root(unit) is roots]

    return OrgUnitsListOut(org_units=[_item(unit) for unit in units])


@router.post(
    "",
    response_model=OrgUnitItem,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_USERS_OR_SCOPED],
)
def create_org_unit(
    body: CreateOrgUnitIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitItem:
    """Create an org_unit.

    Naming no parent creates the top of a tree, which only an operator may
    do: a new organisation is not something an admin of one other
    organisation should be able to conjure. Naming a parent creates a
    org_unit inside it, and the parent has to be one the caller may
    administer.

    The type decides which of the two is allowed, so neither can be
    produced by accident.

    Requires ``manage_users``, or a scoped manager such as
    ``manage_teaching``. A scoped manager adds a site inside an org_unit
    they act at: a teaching body signs up member hospitals as it signs up
    their delegates. They never create an organisation, which stays with
    an operator whatever the caller holds. They may edit a site too, see
    ``_require_editable``; deleting one, and its features, still take
    ``manage_users``.
    """
    unit_type = _known_type(body.type)

    needs_parent = type_requires_parent(unit_type)

    if body.parent_id is None:
        if needs_parent:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"A {unit_type} sits inside something. Name the place "
                    "it belongs to."
                ),
            )
        if current_user.platform_role != "superadmin":
            raise HTTPException(
                status_code=403,
                detail="Requires superadmin permissions",
            )
    else:
        if not needs_parent:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"A {unit_type} is the top of a tree and does not sit "
                    "inside anything."
                ),
            )
        _require_parent_is_an_organisation(
            _require_visible(db, current_user, body.parent_id, "manage_users")
        )

    unit = OrgUnit(
        name=body.name.strip(),
        type=unit_type,
        parent_id=body.parent_id,
        location=body.location.strip() if body.location else None,
    )
    db.add(unit)
    db.flush()
    db.refresh(unit)

    return _item(unit)


@router.get(
    "/{unit_id}",
    response_model=OrgUnitDetailOut,
    dependencies=[DEP_REQUIRE_MANAGE_USERS_OR_SCOPED],
)
def get_org_unit(
    unit_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitDetailOut:
    """One org_unit, with who is here and what is inside it.

    Features and the patient list come back empty for anything but the top
    of a tree, because that is the only kind of org_unit that carries them.

    Requires ``manage_users``, or a scoped manager at an org_unit the
    caller belongs to. The detail then leaves out what the caller's
    competencies do not cover, rather than the page hiding it, so a
    section added to the page later cannot show patients by forgetting to
    hide itself: features need ``manage_users``, and the patient list
    ``manage_users`` or ``manage_patient_membership``. Left out means
    empty, so the shape of the response does not change.
    """
    unit = _require_visible(db, current_user, unit_id, "manage_users")
    held = set(current_user.get_final_competencies())
    sees_features = "manage_users" in held
    sees_patients = bool(held & {"manage_users", "manage_patient_membership"})

    children = list(
        db.execute(
            select(OrgUnit)
            .where(OrgUnit.parent_id == unit_id)
            .order_by(OrgUnit.name)
        )
        .scalars()
        .all()
    )
    leads = clinical_leads_of(db, [child.id for child in children])
    lead_names = _names_of(db, set(leads.values()))

    features: list[str] = []
    patient_ids: list[str] = []

    if sees_features:
        features = list(
            db.execute(
                select(OrgUnitFeature.feature_key)
                .where(OrgUnitFeature.org_unit_id == unit_id)
                .order_by(OrgUnitFeature.feature_key)
            )
            .scalars()
            .all()
        )
    if sees_patients:
        patient_ids = list(
            db.execute(
                select(org_unit_patient_member.c.patient_id)
                .where(org_unit_patient_member.c.org_unit_id == unit_id)
                .order_by(org_unit_patient_member.c.patient_id)
            )
            .scalars()
            .all()
        )

    parent_name = ""
    parent_is_root = False

    if unit.parent_id is not None:
        parent = db.get(OrgUnit, unit.parent_id)
        if parent is not None:
            parent_name = parent.name
            parent_is_root = _is_root(parent)

    definition = get_org_unit_type(unit.type)

    return OrgUnitDetailOut(
        id=unit.id,
        name=unit.name,
        type=unit.type,
        type_display_name=(
            definition.display_name if definition else unit.type
        ),
        is_root=_is_root(unit),
        parent_id=unit.parent_id,
        parent_name=parent_name,
        parent_is_root=parent_is_root,
        location=unit.location or "",
        is_active=unit.is_active,
        created_at=unit.created_at.isoformat(),
        updated_at=unit.updated_at.isoformat(),
        members=_members_of(db, unit_id).members,
        children=[
            {
                "id": child.id,
                "name": child.name,
                "type": child.type,
                "is_active": child.is_active,
                "clinical_lead_id": leads.get(child.id),
                "clinical_lead_name": lead_names.get(
                    leads.get(child.id, 0), ""
                ),
            }
            for child in children
        ],
        features=features,
        patient_ids=patient_ids,
        clinical_lead_id=clinical_leads_of(db, [unit_id]).get(unit_id),
    )


@router.put(
    "/{unit_id}",
    response_model=OrgUnitItem,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_USERS_OR_SCOPED],
)
def update_org_unit(
    unit_id: int,
    body: UpdateOrgUnitIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitItem:
    """Change an org_unit. Only the fields given are changed.

    Moving an org_unit is refused if it would put the org_unit inside itself, at
    any depth, and if the new parent is one the caller may not administer.

    Requires ``manage_users``, or a scoped manager such as
    ``manage_teaching`` editing a site they act at. See
    ``_require_editable``.
    """
    unit = _require_editable(db, current_user, unit_id)

    if body.type is not None:
        new_type = _known_type(body.type)
        if type_requires_parent(new_type) is not type_requires_parent(
            unit.type
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "That type would change whether this place sits inside "
                    "another. Move it first, or create a new one."
                ),
            )
        unit.type = new_type

    if body.name is not None:
        unit.name = body.name.strip()
    if body.location is not None:
        unit.location = body.location.strip() or None

    if body.parent_id is not None:
        # The type says whether an org_unit sits inside another. An
        # organisation given a parent would be a top of tree with
        # something above it: `is_root` would keep saying yes while
        # every walk up found somebody else's trust.
        if not type_requires_parent(unit.type):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"A {unit.type} is the top of a tree and does not sit "
                    "inside anything."
                ),
            )
        if would_make_a_cycle(db, unit_id, body.parent_id):
            raise HTTPException(
                status_code=400,
                detail="A place cannot sit inside itself",
            )
        new_parent = _require_visible(
            db, current_user, body.parent_id, "manage_users"
        )
        if body.parent_id != unit.parent_id:
            _require_parent_is_an_organisation(new_parent)
        unit.parent_id = body.parent_id

    db.flush()
    db.refresh(unit)

    return _item(unit)


@router.patch(
    "/{unit_id}/active",
    response_model=OrgUnitItem,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_USERS_OR_SCOPED],
)
def set_org_unit_active(
    unit_id: int,
    body: ToggleOrgUnitActiveIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitItem:
    """Put an org_unit in or out of use.

    Requires ``manage_users``, or a scoped manager such as
    ``manage_teaching`` at a site they act at. See ``_require_editable``.
    """
    unit = _require_editable(db, current_user, unit_id)
    unit.is_active = body.is_active
    db.flush()
    db.refresh(unit)

    return _item(unit)


@router.delete(
    "/{unit_id}",
    response_model=OrgUnitStatusOut,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_USERS],
)
def delete_org_unit(
    unit_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitStatusOut:
    """Delete an org_unit. Requires ``manage_users``.

    Deleting the top of a tree is an operator's job, matching what
    deleting an organisation has always required.
    """
    unit = _require_visible(db, current_user, unit_id)

    if _is_root(unit) and current_user.platform_role != "superadmin":
        raise HTTPException(
            status_code=403, detail="Requires superadmin permissions"
        )

    # An org_unit with something inside it is refused rather than emptied.
    # The column says ``SET NULL``, so deleting a ward would leave its
    # rooms belonging nowhere: invisible to every list, reachable by
    # nobody, and impossible to tell from rooms that were always loose.
    # Saying so is the kinder answer, and it is reversible - move them or
    # delete them first.
    children = db.scalar(
        select(func.count())
        .select_from(OrgUnit)
        .where(OrgUnit.parent_id == unit_id)
    )

    if children:
        raise HTTPException(
            status_code=409,
            detail=(
                f"This place still has {children} inside it. Move them or "
                "delete them first."
            ),
        )

    # Deleting the org_unit clears everything hanging off it, through the
    # listener on the model.
    db.delete(unit)
    db.flush()

    return OrgUnitStatusOut(status="deleted")


# ------------------------------------------------------------------
# Who is here
# ------------------------------------------------------------------


@router.get(
    "/{unit_id}/members",
    response_model=OrgUnitMembersOut,
    dependencies=[DEP_REQUIRE_MANAGE_USERS_OR_SCOPED],
)
def list_org_unit_members(
    unit_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitMembersOut:
    """Everybody at one org_unit.

    Requires ``manage_users``, or a scoped manager at an org_unit the
    caller belongs to.
    """
    _require_visible(db, current_user, unit_id, "manage_users")

    return _members_of(db, unit_id)


@router.post(
    "/{unit_id}/member-lookup",
    response_model=MemberLookupOut,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_STAFF_OR_SCOPED],
)
@limiter.limit("10/minute")
def look_up_member(
    request: Request,
    unit_id: int,
    body: MemberLookupIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> MemberLookupOut:
    """Find one person by their whole username or email, to add them here.

    An admin sees only the people at the org_units they reach, so
    somebody with an account elsewhere could not be picked from a list
    and could not be created either, their address being taken. This is
    the way between: name them, and be told whether there is an account
    that may be added.

    **A whole username or a whole address, matched exactly.** Never part
    of one, and never a name: the passport's assessor search matched
    substrings and full names until the authorisation review of 22
    September found it was a directory of every account. An exact match
    answers about one person the caller can already name.

    It does confirm that a given username or address has an account,
    which adding a member by id already did; the rate limit keeps that
    from being asked in bulk. A POST, so what was typed travels in the
    body and stays out of access logs.

    Requires what adding a member requires, at an org_unit the caller
    may add to.
    """
    _require_visible(db, current_user, unit_id, "manage_staff_membership")

    # An address names one mailbox and a username one account, so either
    # way this is at most one person. Which of the two was typed is read
    # from the `@`, so a username is never tried as an address.
    term = body.term.lower()
    column = User.email if "@" in term else User.username
    person = db.scalar(select(User).where(func.lower(column) == term))

    if person is None:
        return MemberLookupOut(status="not_found")

    found = MemberLookupUser(
        id=person.id,
        username=person.username,
        full_name=person.full_name or "",
        competencies=person.get_final_competencies(),
    )
    already = db.scalar(
        select(org_unit_member.c.user_id).where(
            org_unit_member.c.org_unit_id == unit_id,
            org_unit_member.c.user_id == person.id,
        )
    )

    if already is not None:
        return MemberLookupOut(status="already_member", user=found)

    # Accounts nobody but an operator should be handed. Nothing about
    # the account travels with the refusal.
    if not person.is_active or (
        person.platform_role == "superadmin"
        and current_user.platform_role != "superadmin"
    ):
        return MemberLookupOut(status="not_addable")

    return MemberLookupOut(status="found", user=found)


@router.post(
    "/{unit_id}/members",
    response_model=OrgUnitStatusOut,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_STAFF_OR_SCOPED],
)
def add_org_unit_member(
    unit_id: int,
    body: AddOrgUnitMemberIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitStatusOut:
    """Record that somebody is at an org_unit, in a given capacity.

    The grant goes in the same request as the membership. Adding somebody
    and then separately remembering to give them competencies is two steps
    that can be half-done, and the half-done state is a new starter who
    can reach nothing.

    Recording the same membership twice changes the capacity rather than
    failing.

    Requires ``manage_staff_membership``, or a scoped manager at an
    org_unit the caller belongs to. A scoped manager may add anybody,
    grants only what it may grant, and gives a profession or changes an
    existing capacity only for somebody whose profession it may give.
    """
    unit = _require_visible(
        db, current_user, unit_id, "manage_staff_membership"
    )

    if not type_can_have_members(unit.type):
        raise HTTPException(
            status_code=422,
            detail=f"Nobody belongs to a {unit.type}.",
        )

    capacity = _known_capacity(body.capacity)

    person = db.get(User, body.user_id)

    if person is None:
        raise HTTPException(status_code=404, detail="User not found")

    existing = db.scalar(
        select(org_unit_member.c.capacity).where(
            org_unit_member.c.org_unit_id == unit_id,
            org_unit_member.c.user_id == body.user_id,
        )
    )

    if existing is None:
        db.execute(
            insert(org_unit_member).values(
                org_unit_id=unit_id,
                user_id=body.user_id,
                capacity=capacity,
            )
        )
        status = "added"
    else:
        db.execute(
            org_unit_member.update()
            .where(
                org_unit_member.c.org_unit_id == unit_id,
                org_unit_member.c.user_id == body.user_id,
            )
            .values(capacity=capacity)
        )
        status = "updated"

    if _through_a_scope(current_user, "manage_staff_membership"):
        # Anybody may be added: being at an org_unit is not a change to
        # their account, and somebody running the passport at a site
        # has to be able to bring a consultant into it. What stays
        # limited is everything that *is* a change to the account: the
        # capacity of somebody already here, a new profession, and
        # (below) the competencies granted.
        if existing is not None or body.base_profession is not None:
            _require_account_in_scope(current_user, person)
        if body.base_profession is not None:
            if not may_assign_profession(current_user, body.base_profession):
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "You may not give the profession "
                        f"{body.base_profession}."
                    ),
                )
        held_before = set(person.get_final_competencies())
    else:
        held_before = None

    # Read against the profession they have now, before any change to it:
    # asked afterwards, the new profession's competencies would all read
    # as "not held" and be kept from them.
    removed = person.removed_competency_ids
    outside = set(person.additional_competency_ids)

    if body.base_profession is not None:
        outside = set(
            competencies_kept_across_profession_change(
                outside,
                old_profession=person.base_profession,
                new_profession=body.base_profession,
            )
        )
        person.base_profession = body.base_profession

    # Granted on top of whatever they already held, never in its place.
    outside.update(body.additional_competencies or [])
    additional = sorted(outside)

    if held_before is not None:
        _require_in_scope(
            current_user,
            held_before
            ^ set(
                resolve_user_competencies(
                    person.base_profession, additional, removed
                )
            ),
        )
    # The term comes with the grant, for the reason the grant comes with
    # the membership: `passport_write` is written with its end date in
    # the same row, so a new starter is never left holding it with no
    # term, able to open their passport and not write to it.
    sync_competency_rows(
        person,
        additional=additional,
        removed=removed,
        source="admin",
        granted_by=current_user.id,
        org_unit_id=unit_id,
    )
    cover.membership_changed(
        db,
        unit_id,
        body.user_id,
        before=existing,
        after=capacity,
        changed_by=current_user,
    )

    db.flush()

    return OrgUnitStatusOut(status=status)


@router.delete(
    "/{unit_id}/members/{user_id}",
    response_model=OrgUnitStatusOut,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_STAFF_OR_SCOPED],
)
def remove_org_unit_member(
    unit_id: int,
    user_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitStatusOut:
    """Take somebody off an org_unit.

    Anything they hold here goes with them. Naming a clinical lead
    requires the person to be at the org_unit, so leaving them holding the
    post after taking them off it would leave the org_unit in a state the
    same surface refuses to create. The post is vacated rather than
    deleted, so the handover is recorded.

    Requires ``manage_staff_membership``, or a scoped manager for
    somebody whose profession it may give, at an org_unit the caller
    belongs to.
    """
    unit = _require_visible(
        db, current_user, unit_id, "manage_staff_membership"
    )

    if _through_a_scope(current_user, "manage_staff_membership"):
        person = _require_member(db, unit_id, user_id)
        _require_account_in_scope(current_user, person)

    if clinical_leads_of(db, [unit_id]).get(unit_id) == user_id:
        set_clinical_lead(db, unit, None, appointed_by=current_user)

    before = db.scalar(
        select(org_unit_member.c.capacity).where(
            org_unit_member.c.org_unit_id == unit_id,
            org_unit_member.c.user_id == user_id,
        )
    )
    result = db.execute(
        delete(org_unit_member).where(
            org_unit_member.c.org_unit_id == unit_id,
            org_unit_member.c.user_id == user_id,
        )
    )

    if result.rowcount == 0:  # type: ignore[attr-defined]
        raise HTTPException(status_code=404, detail="Membership not found")
    cover.membership_changed(
        db,
        unit_id,
        user_id,
        before=before,
        after=None,
        changed_by=current_user,
    )

    db.flush()

    return OrgUnitStatusOut(status="removed")


@router.put(
    "/{unit_id}/clinical-lead",
    response_model=OrgUnitStatusOut,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_STAFF_OR_SCOPED],
)
def set_org_unit_clinical_lead(
    unit_id: int,
    body: SetClinicalLeadIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitStatusOut:
    """Name the clinical lead of an org_unit, or leave the post vacant.

    A post is not a competency: it can be vacant, and "this ward has no
    clinical lead" is a real and actionable state. Passing no person
    vacates it, which is why this is one route rather than an add and a
    remove.

    Whoever holds it is stood down first, so a handover is
    recorded rather than the previous holder simply vanishing.

    The person has to be at the org_unit already. Naming somebody who is not
    would make the post say they are involved here when nothing else does.

    Requires ``manage_staff_membership``, or a scoped manager such as
    ``manage_teaching`` at an org_unit they act at. Whoever runs teaching
    somewhere names its lead, themselves included, at a site or at the
    organisation. The site pages already offered a teaching admin the
    "Clinical lead" role, and this route then refused it after the person
    had been added.
    """
    unit = _require_visible(
        db, current_user, unit_id, "manage_staff_membership"
    )

    if not type_can_hold_positions(unit.type):
        raise HTTPException(
            status_code=422,
            detail=f"Nobody is clinical lead of a {unit.type}.",
        )

    lead: User | None = None

    if body.user_id is not None:
        lead = db.get(User, body.user_id)
        if lead is None:
            raise HTTPException(status_code=404, detail="User not found")

        at_this_org_unit = db.scalar(
            select(org_unit_member.c.user_id).where(
                org_unit_member.c.org_unit_id == unit_id,
                org_unit_member.c.user_id == body.user_id,
            )
        )
        if at_this_org_unit is None:
            raise HTTPException(
                status_code=422,
                detail="That person is not at this place.",
            )

    try:
        set_clinical_lead(db, unit, lead, appointed_by=current_user)
    except ValueError:
        # The post refused them: it is full, or asks for a competency
        # they may not practise here. Said in words written here, since a
        # caught exception's text must not reach a client, and as a 409,
        # not left to surface as a 500.
        raise HTTPException(
            status_code=409,
            detail="That person cannot be made clinical lead here.",
        ) from None
    db.flush()

    return OrgUnitStatusOut(status="vacant" if lead is None else "set")


# ------------------------------------------------------------------
# Who may practise what, here
# ------------------------------------------------------------------


@router.get(
    "/{unit_id}/practising-competencies",
    response_model=PractisingCompetenciesOut,
    dependencies=[DEP_REQUIRE_MANAGE_PRACTISING_OR_SCOPED],
)
def list_practising_competencies(
    unit_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> PractisingCompetenciesOut:
    """Who may practise what at one place.

    The rows as stored, not narrowed to anybody's ceiling. A row beyond
    somebody's ceiling authorises nothing, but it is still a row somebody
    wrote and the person reviewing authorisations here needs to see it -
    narrowing silently would hide an authorisation that looks live in the
    database.

    Requires ``manage_practising_competencies``, or a scoped manager
    at an org_unit the caller belongs to, which sees only the rows for
    competencies it may grant.
    """
    _require_visible(
        db, current_user, unit_id, "manage_practising_competencies"
    )
    through_teaching = _through_a_scope(
        current_user, "manage_practising_competencies"
    )
    in_scope = scope_for(current_user).competencies

    rows = db.execute(
        select(
            User.id,
            User.username,
            User.full_name,
            PractisingCompetency.competency,
            PractisingCompetency.authorised_at,
            PractisingCompetency.authorised_by,
        )
        .join(PractisingCompetency, PractisingCompetency.user_id == User.id)
        .where(PractisingCompetency.org_unit_id == unit_id)
        .order_by(User.username, PractisingCompetency.competency)
    ).all()

    return PractisingCompetenciesOut(
        practising_competencies=[
            {
                "user_id": row.id,
                "username": row.username,
                "full_name": row.full_name or "",
                "competency": row.competency,
                "authorised_at": row.authorised_at.isoformat(),
                "authorised_by": row.authorised_by,
            }
            for row in rows
            if not through_teaching
            or in_scope is None
            or row.competency in in_scope
        ]
    )


@router.post(
    "/{unit_id}/practising-competencies",
    response_model=OrgUnitStatusOut,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_PRACTISING_OR_SCOPED],
)
def authorise_practising_competency(
    unit_id: int,
    body: AuthorisePractisingCompetencyIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitStatusOut:
    """Authorise somebody to practise a competency at a place.

    Not a grant of the competency itself: that is the person's ceiling,
    earned through training and sign-off, and written elsewhere. This says
    only that they may exercise it here. Authorising something outside
    their ceiling is allowed and does nothing until the ceiling catches up,
    which is what lets a place record its decision without waiting on
    somebody's paperwork.

    Authorising the same thing twice is not an error. The unique
    constraint makes the second write a no-op, and a surface that fails on
    a repeat would make a double-click look like a problem.

    Requires ``manage_practising_competencies``, or a scoped manager
    for a competency it may grant, for a member of an org_unit the caller
    belongs to.
    """
    refusal = practice_refusal(
        db,
        current_user,
        unit_id=unit_id,
        user_id=body.user_id,
        competency=body.competency,
        authorising=True,
    )

    if refusal is not None:
        raise refusal

    written = authorise_practice(
        db,
        user_id=body.user_id,
        org_unit_id=unit_id,
        competency=body.competency,
        authorised_by=current_user.id,
    )

    return OrgUnitStatusOut(status="authorised" if written else "unchanged")


@router.delete(
    "/{unit_id}/practising-competencies/{user_id}/{competency}",
    response_model=OrgUnitStatusOut,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_PRACTISING_OR_SCOPED],
)
def withdraw_practising_competency(
    unit_id: int,
    user_id: int,
    competency: str,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitStatusOut:
    """Stop somebody practising a competency at a place.

    The row is deleted and nothing is recorded in its place. Absence is
    already the unauthorised state, which is why the row carries no
    boolean: practice cannot be withdrawn without removing the thing that
    said who authorised it.

    Withdrawing something that was not authorised is not an error. The
    caller asked for it to be unauthorised here and it is, so refusing
    would report a problem where there is none.

    Their competency itself is untouched. Somebody suspended at one place
    stays qualified, and stays authorised everywhere else they hold a row.

    Requires ``manage_practising_competencies``, or a scoped manager
    for a competency it may grant, at an org_unit the caller belongs to.
    """
    refusal = practice_refusal(
        db,
        current_user,
        unit_id=unit_id,
        user_id=user_id,
        competency=competency,
        authorising=False,
    )

    if refusal is not None:
        raise refusal

    withdraw_practice(
        db, user_id=user_id, org_unit_id=unit_id, competency=competency
    )

    return OrgUnitStatusOut(status="withdrawn")


# ------------------------------------------------------------------
# One member, at one place
# ------------------------------------------------------------------


def _require_member(db: Session, unit_id: int, user_id: int) -> User:
    """Return the user, or 404 unless they are a member of the org_unit.

    Keeps the member routes to the people at this org_unit, so they
    cannot be pointed at anybody in the system by id.
    """
    person = db.get(User, user_id)
    is_member = db.scalar(
        select(org_unit_member.c.user_id).where(
            org_unit_member.c.org_unit_id == unit_id,
            org_unit_member.c.user_id == user_id,
        )
    )

    if person is None or is_member is None:
        raise HTTPException(status_code=404, detail="Member not found")

    return person


def _grant_refusal(
    db: Session, caller: User, person: User
) -> HTTPException | None:
    """Why *caller* may not add to *person*'s competencies, or None.

    The same three rules ``update_user`` applies, so this route is not a
    way round them: nobody grants themselves a competency, only an
    operator changes an operator, and an administrator acts only on
    somebody at an org_unit they reach, as
    ``org_units_whose_people_reached_by`` answers it. An operator passes
    all three.
    """
    held = set(caller.get_final_competencies())

    if "manage_users" not in held and held.isdisjoint(SCOPED_MANAGER_IDS):
        return HTTPException(status_code=403, detail="Not allowed")
    if caller.platform_role == "superadmin":
        return None
    if person.platform_role == "superadmin":
        return HTTPException(
            status_code=403, detail="Cannot modify superadmin users"
        )
    if person.id == caller.id:
        return HTTPException(
            status_code=403,
            detail=(
                "Competencies must be changed by another user who holds "
                "manage_users"
            ),
        )

    reached = org_units_whose_people_reached_by(db, caller)

    if reached is not None and not is_member_within(db, person.id, reached):
        return HTTPException(status_code=404, detail="Member not found")

    return None


@router.get(
    "/{unit_id}/members/{user_id}/practice",
    response_model=MemberPracticeOut,
    dependencies=[DEP_REQUIRE_MANAGE_PRACTISING_OR_SCOPED],
)
def get_member_practice(
    unit_id: int,
    user_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> MemberPracticeOut:
    """What one member holds, and what they may practise here.

    Their ceiling and this org_unit's rows for them, in one answer, so
    the page about one person at one place draws from one request. Rows
    beyond their ceiling are included: they authorise nothing, but they
    are rows somebody wrote.

    Requires ``manage_practising_competencies``, or a scoped manager
    at an org_unit the caller belongs to, which may change only the
    competencies ``may_change`` names.
    """
    unit = _require_visible(
        db, current_user, unit_id, "manage_practising_competencies"
    )
    person = _require_member(db, unit_id, user_id)
    through_teaching = _through_a_scope(
        current_user, "manage_users", "manage_practising_competencies"
    )
    in_scope = scope_for(current_user).competencies

    rows = (
        db.execute(
            select(PractisingCompetency)
            .where(
                PractisingCompetency.org_unit_id == unit_id,
                PractisingCompetency.user_id == user_id,
            )
            .order_by(PractisingCompetency.competency)
        )
        .scalars()
        .all()
    )
    names = _names_of(
        db, {row.authorised_by for row in rows if row.authorised_by}
    )

    return MemberPracticeOut(
        user_id=person.id,
        username=person.username,
        full_name=person.full_name or "",
        org_unit_id=unit.id,
        org_unit_name=unit.name,
        qualified=sorted(person.get_final_competencies()),
        authorised=[
            MemberAuthorisationItem(
                competency=row.competency,
                authorised_at=row.authorised_at.isoformat(),
                authorised_by=(
                    names.get(row.authorised_by) if row.authorised_by else None
                ),
            )
            for row in rows
        ],
        may_grant=_grant_refusal(db, current_user, person) is None,
        may_change=(
            sorted(in_scope)
            if through_teaching and in_scope is not None
            else None
        ),
    )


@router.post(
    "/{unit_id}/members/{user_id}/grant-and-authorise",
    response_model=OrgUnitStatusOut,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_USERS_OR_SCOPED],
)
def grant_and_authorise(
    unit_id: int,
    user_id: int,
    body: GrantAndAuthoriseIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitStatusOut:
    """Give a member a competency, and authorise them to practise it here.

    Two facts in one transaction: the competency joins their ceiling,
    which applies everywhere, and a ``practising_competency`` row is
    written at this org_unit only. Either both are written or neither
    is, so the page never leaves somebody qualified and not authorised,
    or authorised for something that does nothing, because the second
    request failed.

    Additive. Only this one competency changes on their ceiling, so two
    administrators granting different things at once cannot undo each
    other, as two saves of the whole list through ``PATCH /users`` can.
    Asking again once both are in place changes nothing.

    Requires ``manage_users`` and ``manage_practising_competencies``, or
    a scoped manager for a competency it may grant, at an org_unit the
    caller belongs to.
    """
    needs = ("manage_users", "manage_practising_competencies")
    through_teaching = _through_a_scope(current_user, *needs)

    if not through_teaching and not set(needs) <= set(
        current_user.get_final_competencies()
    ):
        raise HTTPException(status_code=403, detail="Not allowed")

    unit = _require_visible(db, current_user, unit_id, *needs)

    if not type_can_hold_competencies(unit.type):
        raise HTTPException(
            status_code=422,
            detail=f"Nobody practises anything at a {unit.type}.",
        )

    person = _require_member(db, unit_id, user_id)

    refusal = _grant_refusal(db, current_user, person)

    if refusal is not None:
        raise refusal

    competency = body.competency

    if through_teaching:
        _require_in_scope(current_user, {competency})

    granted = competency not in person.get_final_competencies()

    if granted:
        template = set(
            get_profession_base_competencies(person.base_profession)
        )
        additional = set(person.additional_competency_ids)
        removed = set(person.removed_competency_ids)
        # A competency their profession gives is restored by taking it
        # off the removed list; anything else is added beyond it.
        removed.discard(competency)
        if competency not in template:
            additional.add(competency)
        sync_competency_rows(
            person,
            additional=sorted(additional),
            removed=sorted(removed),
            source="admin",
            granted_by=current_user.id,
            org_unit_id=unit_id,
        )

    authorised = authorise_practice(
        db,
        user_id=user_id,
        org_unit_id=unit_id,
        competency=competency,
        authorised_by=current_user.id,
    )

    db.flush()
    if granted:
        return OrgUnitStatusOut(status="granted_and_authorised")
    if authorised:
        return OrgUnitStatusOut(status="authorised")

    return OrgUnitStatusOut(status="unchanged")


# ------------------------------------------------------------------
# What an org_unit carries
# ------------------------------------------------------------------


@router.get(
    "/{unit_id}/features",
    response_model=OrgUnitFeaturesOut,
    dependencies=[DEP_REQUIRE_MANAGE_USERS],
)
def list_org_unit_features(
    unit_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitFeaturesOut:
    """Which features are on at an org_unit. Requires ``manage_users``."""
    _require_visible(db, current_user, unit_id)

    rows = list(
        db.execute(
            select(OrgUnitFeature)
            .where(OrgUnitFeature.org_unit_id == unit_id)
            .order_by(OrgUnitFeature.feature_key)
        )
        .scalars()
        .unique()
        .all()
    )

    return OrgUnitFeaturesOut(
        features=[
            {
                "feature_key": row.feature_key,
                "enabled_at": (
                    row.enabled_at.isoformat() if row.enabled_at else None
                ),
                "enabled_by": row.enabled_by,
            }
            for row in rows
        ]
    )


@router.put(
    "/{unit_id}/features/{feature_key}",
    response_model=OrgUnitStatusOut,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_USERS],
)
def set_org_unit_feature(
    unit_id: int,
    feature_key: str,
    body: ToggleOrgUnitFeatureIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitStatusOut:
    """Switch a feature on or off at an org_unit.

    Any org_unit may carry a feature, whatever its type. What the feature
    reaches is decided by who is a member there, not by what the org_unit
    is called.

    ``ORGANISATION_ONLY_FEATURES`` are the exception: one of those is
    switched on for an organisation alone. Switching one off is allowed
    anywhere, so a site that already has it can be put right.

    Requires ``manage_users`` at an org_unit the caller may administer, which
    is what the organisations surface has always asked. An operator-only
    gate here would have taken a working thing away from every admin the
    day that surface was retired.
    """
    _require_visible(db, current_user, unit_id)

    # Passport cover gives away the paid half of the passport, so whoever
    # switches it controls the price. A superadmin only, in both
    # directions: a trust admin must not be able to make writing free
    # across their trust.
    if (
        feature_key == COVER_FEATURE
        and current_user.platform_role != "superadmin"
    ):
        raise HTTPException(
            status_code=403,
            detail="Only an operator may switch passport cover.",
        )

    existing = db.scalar(
        select(OrgUnitFeature).where(
            OrgUnitFeature.org_unit_id == unit_id,
            OrgUnitFeature.feature_key == feature_key,
        )
    )

    if body.enabled:
        if existing is not None:
            return OrgUnitStatusOut(status="already_enabled")
        if (
            feature_key in ORGANISATION_ONLY_FEATURES
            and db.scalar(
                organisation_org_unit_ids().where(OrgUnit.id == unit_id)
            )
            is None
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "That feature is switched on for an organisation, "
                    "and reaches its sites from there."
                ),
            )
        if feature_key == COVER_FEATURE and not _has_feature(
            db, unit_id, "passport"
        ):
            raise HTTPException(
                status_code=422,
                detail="Switch the passport on here before its cover.",
            )
        db.add(
            OrgUnitFeature(
                org_unit_id=unit_id,
                feature_key=feature_key,
                enabled_by=current_user.id,
            )
        )
        db.flush()
        if feature_key == COVER_FEATURE:
            cover.switch_on(db, unit_id, current_user)
        return OrgUnitStatusOut(status="enabled")

    if existing is None:
        return OrgUnitStatusOut(status="already_disabled")
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

    return OrgUnitStatusOut(status="disabled")


def _has_feature(db: Session, unit_id: int, feature_key: str) -> bool:
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


@router.get(
    "/{unit_id}/passport-cover",
    response_model=OrgUnitPassportCoverOut,
    dependencies=[DEP_REQUIRE_MANAGE_USERS],
)
def get_org_unit_passport_cover(
    unit_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitPassportCoverOut:
    """Whether the org_unit pays for its members' writing, and for how many.

    The count is what switching the cover off would take away, so the
    features page can say so before it is confirmed. Requires
    ``manage_users``.
    """
    _require_visible(db, current_user, unit_id)

    return OrgUnitPassportCoverOut(
        enabled=cover.is_covered(db, unit_id),
        covered_count=cover.covered_count(db, unit_id),
    )


def _lead_framework_ids(db: Session, unit_id: int) -> list[str]:
    """An org_unit's lead passport framework ids, in position order."""
    return list(
        db.scalars(
            select(OrgUnitPassportFramework.framework_id)
            .where(OrgUnitPassportFramework.org_unit_id == unit_id)
            .order_by(OrgUnitPassportFramework.position)
        ).all()
    )


@router.get(
    "/{unit_id}/passport-frameworks",
    response_model=OrgUnitPassportFrameworksOut,
    dependencies=[DEP_REQUIRE_MANAGE_USERS],
)
def list_org_unit_passport_frameworks(
    unit_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitPassportFrameworksOut:
    """An organisation's lead passport frameworks, in order.

    Every row as stored, including one naming a framework whose file has
    since gone, so an admin sees what is saved and can clear it. The
    holder's own list skips such a row instead. Requires ``manage_users``.
    """
    _require_visible(db, current_user, unit_id)

    return OrgUnitPassportFrameworksOut(
        framework_ids=_lead_framework_ids(db, unit_id)
    )


@router.put(
    "/{unit_id}/passport-frameworks",
    response_model=OrgUnitPassportFrameworksOut,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_USERS],
)
def set_org_unit_passport_frameworks(
    unit_id: int,
    body: SetOrgUnitPassportFrameworksIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitPassportFrameworksOut:
    """Replace an organisation's lead passport frameworks.

    The frameworks its people are offered first when they choose their
    own, in this order; the rest follow alphabetically. The whole list
    is replaced, because the order is the point, so positions are
    rewritten from 1 every time. An empty list clears it. It chooses no
    framework for anybody.

    Held at any org_unit, whatever its type, as a feature is. Requires
    ``manage_users`` at an org_unit the caller may administer.
    """
    _require_visible(db, current_user, unit_id)

    # Neither message repeats what was sent: a client's own text is not
    # echoed back in an error.
    if any(i not in FRAMEWORK_IDS for i in body.framework_ids):
        raise HTTPException(
            status_code=422,
            detail="Unknown framework. Must be one of: "
            + ", ".join(FRAMEWORK_IDS),
        )
    if len(set(body.framework_ids)) != len(body.framework_ids):
        raise HTTPException(
            status_code=422, detail="Each framework can be named once."
        )

    # A core DELETE, sent at once, so the old positions are gone before
    # the new rows are flushed against the one-position-each constraint.
    db.execute(
        delete(OrgUnitPassportFramework).where(
            OrgUnitPassportFramework.org_unit_id == unit_id
        )
    )
    for position, framework_id in enumerate(body.framework_ids, start=1):
        db.add(
            OrgUnitPassportFramework(
                org_unit_id=unit_id,
                framework_id=framework_id,
                position=position,
                set_by=current_user.id,
            )
        )
    db.flush()

    return OrgUnitPassportFrameworksOut(
        framework_ids=_lead_framework_ids(db, unit_id)
    )


@router.post(
    "/{unit_id}/patients",
    response_model=OrgUnitStatusOut,
    dependencies=[
        DEP_REQUIRE_CSRF,
        DEP_REQUIRE_CLINICAL,
        DEP_REQUIRE_MANAGE_PATIENTS,
    ],
)
def add_org_unit_patient(
    unit_id: int,
    body: AddOrgUnitPatientIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitStatusOut:
    """Record that an org_unit is responsible for a patient.

    Any org_unit may keep a patient list, whatever its type.

    Requires ``manage_patient_membership``.
    """
    _require_visible(db, current_user, unit_id)

    existing = db.execute(
        select(org_unit_patient_member).where(
            org_unit_patient_member.c.org_unit_id == unit_id,
            org_unit_patient_member.c.patient_id == body.patient_id,
        )
    ).first()

    if existing is not None:
        return OrgUnitStatusOut(status="already_added")

    db.execute(
        insert(org_unit_patient_member).values(
            org_unit_id=unit_id, patient_id=body.patient_id
        )
    )
    db.flush()

    return OrgUnitStatusOut(status="added")


@router.delete(
    "/{unit_id}/patients/{patient_id}",
    response_model=OrgUnitStatusOut,
    dependencies=[
        DEP_REQUIRE_CSRF,
        DEP_REQUIRE_CLINICAL,
        DEP_REQUIRE_MANAGE_PATIENTS,
    ],
)
def remove_org_unit_patient(
    unit_id: int,
    patient_id: str,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitStatusOut:
    """Stop an org_unit being responsible for a patient.

    Requires ``manage_patient_membership``.
    """
    _require_visible(db, current_user, unit_id)

    result = db.execute(
        delete(org_unit_patient_member).where(
            org_unit_patient_member.c.org_unit_id == unit_id,
            org_unit_patient_member.c.patient_id == patient_id,
        )
    )

    if result.rowcount == 0:  # type: ignore[attr-defined]
        raise HTTPException(status_code=404, detail="Membership not found")

    db.flush()

    return OrgUnitStatusOut(status="removed")


# ------------------------------------------------------------------
# Relationships that are not ownership
# ------------------------------------------------------------------


@router.get(
    "/{unit_id}/links",
    response_model=OrgUnitLinksOut,
    dependencies=[DEP_REQUIRE_MANAGE_USERS],
)
def list_org_unit_links(
    unit_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitLinksOut:
    """Every relationship this org_unit is either end of.

    Both directions. A school teaching at a trust is one fact and the
    reverse is another, so an org_unit has to see the links pointing at it as
    well as the ones it made.

    Requires ``manage_users``.
    """
    _require_visible(db, current_user, unit_id)

    return _links_out(db, unit_id)


@router.post(
    "/{unit_id}/links",
    response_model=OrgUnitLinksOut,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_USERS],
)
def create_org_unit_link(
    unit_id: int,
    body: CreateOrgUnitLinkIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitLinksOut:
    """Record a relationship from this org_unit to another.

    **The org_unit at the other end is not checked for ownership**, and that
    is the point: the relationships worth recording cross between
    organisations, and requiring both ends would make this useless for
    exactly those.

    Requires ``manage_users``, and the org_unit the link is *from* must be
    one the caller may administer.
    """
    _require_visible(db, current_user, unit_id)

    if body.target_id == unit_id:
        raise HTTPException(
            status_code=400, detail="A place cannot be linked to itself"
        )

    if db.get(OrgUnit, body.target_id) is None:
        raise HTTPException(status_code=404, detail="Target place not found")

    try:
        relation = validate_org_unit_relation(body.relation)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid relation. Must be one of: "
                + ", ".join(ORG_UNIT_RELATION_IDS)
            ),
        ) from None

    existing = db.scalar(
        select(OrgUnitLink).where(
            OrgUnitLink.source_id == unit_id,
            OrgUnitLink.target_id == body.target_id,
            OrgUnitLink.relation == relation,
        )
    )

    if existing is None:
        db.add(
            OrgUnitLink(
                source_id=unit_id,
                target_id=body.target_id,
                relation=relation,
                created_by=current_user.id,
            )
        )
        db.flush()

    return _links_out(db, unit_id)


@router.delete(
    "/{unit_id}/links/{link_id}",
    response_model=OrgUnitLinksOut,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_USERS],
)
def delete_org_unit_link(
    unit_id: int,
    link_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitLinksOut:
    """Remove a relationship this org_unit is either end of.

    Either end may remove it. A relationship somebody else recorded about
    your org_unit is still a claim about your org_unit.

    Requires ``manage_users``.
    """
    _require_visible(db, current_user, unit_id)

    link = db.get(OrgUnitLink, link_id)

    if link is None or unit_id not in (link.source_id, link.target_id):
        raise HTTPException(status_code=404, detail="Link not found")

    db.delete(link)
    db.flush()

    return _links_out(db, unit_id)


def _links_out(db: Session, unit_id: int) -> OrgUnitLinksOut:
    """Build the response listing every link an org_unit is an end of."""
    links = list(
        db.execute(
            select(OrgUnitLink)
            .where(
                (OrgUnitLink.source_id == unit_id)
                | (OrgUnitLink.target_id == unit_id)
            )
            .order_by(OrgUnitLink.id)
        )
        .scalars()
        .all()
    )

    wanted = {link.source_id for link in links} | {
        link.target_id for link in links
    }
    names: dict[int, str] = {}

    if wanted:
        names = {
            row.id: row.name
            for row in db.execute(
                select(OrgUnit.id, OrgUnit.name).where(OrgUnit.id.in_(wanted))
            ).all()
        }

    out: list[OrgUnitLinkItem] = []

    for link in links:
        relation = get_org_unit_relation(link.relation)
        out.append(
            OrgUnitLinkItem(
                id=link.id,
                source_id=link.source_id,
                source_name=names.get(link.source_id, ""),
                target_id=link.target_id,
                target_name=names.get(link.target_id, ""),
                relation=link.relation,
                relation_display_name=(
                    relation.display_name if relation else link.relation
                ),
                created_at=link.created_at.isoformat(),
            )
        )

    return OrgUnitLinksOut(links=out)

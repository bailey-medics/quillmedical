# backend/app/org_units/router.py
"""One surface for every place.

``/api/organisations`` and ``/api/sites`` grew up as two surfaces over two
tables. There is one table now, so there is one surface: every route here
takes a place id, and what a place *is* comes from its ``type``.

The two older surfaces stay until the frontend has moved across. They are
not views over this one — they answer in organisation ids and site ids,
which are different numbers — so both are served side by side and the old
pair is retired once nothing reads it.

**Nothing here is inherited.** A ward does not take on its trust's
features, members or patient list; each is a fact about one place. Only
scoping walks the tree, which is what decides who may see and edit what.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from app.cbac.base_professions import grant_staff_competencies
from app.cbac.positions import clinical_leads_of, set_clinical_lead
from app.db import get_core_db
from app.deps import (
    DEP_CURRENT_USER,
    DEP_REQUIRE_CLINICAL,
    get_current_user,
    has_competency,
)
from app.models import (
    MEMBER_CAPACITIES,
    Organisation,
    OrgUnit,
    OrgUnitFeature,
    OrgUnitLink,
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
    descendant_ids,
    root_ids_of_organisations,
    would_make_a_cycle,
)
from app.org_units.types import (
    ORG_UNIT_TYPE_IDS,
    get_org_unit_type,
    type_can_have_members,
    type_can_hold_features,
    type_can_hold_positions,
    type_requires_parent,
    validate_org_unit_type,
)
from app.organisations import get_member_org_ids
from app.schemas.org_units import (
    AddOrgUnitMemberIn,
    AddOrgUnitPatientIn,
    CreateOrgUnitIn,
    OrgUnitDetailOut,
    OrgUnitFeaturesOut,
    OrgUnitItem,
    OrgUnitMembersOut,
    OrgUnitsListOut,
    OrgUnitStatusOut,
    SetClinicalLeadIn,
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


router = APIRouter(prefix="/org-units", tags=["org-units"])


# ------------------------------------------------------------------
# Who may see what
# ------------------------------------------------------------------


def _visible_ids(db: Session, user: User) -> set[int] | None:
    """Return the places *user* may see, or None for all of them.

    An admin sees the organisations they belong to and everything beneath
    them, at any depth. A superadmin sees the estate, and gets None rather
    than a set of every id in the table.

    Reach is deliberately not used here. Reach is why somebody sees
    teaching content at a place they visit; it is not authority to
    administer that place, and these are the administration routes.
    """
    if user.platform_role == "superadmin":
        return None

    roots = root_ids_of_organisations(db, get_member_org_ids(db, user.id))
    return set(roots) | descendant_ids(db, roots)


def _require_visible(db: Session, user: User, unit_id: int) -> OrgUnit:
    """Return the place, or refuse with a 404.

    404 rather than 403 throughout, so a refusal does not confirm that a
    place exists to somebody who may not see it.
    """
    unit = db.get(OrgUnit, unit_id)
    if unit is None:
        raise HTTPException(status_code=404, detail="Place not found")

    visible = _visible_ids(db, user)
    if visible is not None and unit_id not in visible:
        raise HTTPException(status_code=404, detail="Place not found")
    return unit


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
    """Whether this place is the top of a tree.

    Declared by the type, never inferred from having no parent. That is
    the one piece of future-proofing the design pays for: the day a body
    has to sit above today's organisations, a trust keeps its type, gains
    a parent, and one flag changes in a configuration file.
    """
    return not type_requires_parent(unit.type)


def _keep_the_organisation_row_in_step(db: Session, unit: OrgUnit) -> None:
    """Write the organisation row that stands for a root place.

    Two tables still describe one thing. The organisations table is on
    its way out, but until it goes it is what answers in organisation
    ids — who may administer what, and which organisations the user form
    offers. A root created here without one would be a place only a
    superadmin could see and nobody could be made a member of.

    ``org_unit_id`` is set on the way in, so the listener that would
    otherwise create a *second* root for the new organisation returns
    early.
    """
    organisation = db.scalar(
        select(Organisation).where(Organisation.org_unit_id == unit.id)
    )
    if organisation is None:
        db.add(
            Organisation(
                name=unit.name,
                type=unit.type,
                location=unit.location,
                org_unit_id=unit.id,
            )
        )
    else:
        organisation.name = unit.name
        organisation.type = unit.type
        organisation.location = unit.location
    db.flush()


def _item(unit: OrgUnit) -> OrgUnitItem:
    """Build the list entry for one place."""
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

    Resolved in one query so a list of places does not cost one request
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


def _members_of(db: Session, unit_id: int) -> OrgUnitMembersOut:
    """Return everybody at one place, by username."""
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
    return OrgUnitMembersOut(
        members=[
            {
                "id": row.id,
                "username": row.username,
                "email": row.email,
                "full_name": row.full_name or "",
                "capacity": row.capacity,
            }
            for row in rows
        ]
    )


# ------------------------------------------------------------------
# Places
# ------------------------------------------------------------------


@router.get(
    "",
    response_model=OrgUnitsListOut,
    dependencies=[DEP_REQUIRE_MANAGE_USERS],
)
def list_org_units(
    roots: bool | None = None,
    parent_id: int | None = None,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitsListOut:
    """List the places the caller may administer.

    ``roots=true`` returns the organisations and ``roots=false`` the
    places inside them; ``parent_id`` narrows to one place's children.
    Given neither, every place the caller may administer comes back.

    Requires ``manage_users``.
    """
    stmt = select(OrgUnit).order_by(OrgUnit.name)

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
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_USERS],
)
def create_org_unit(
    body: CreateOrgUnitIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitItem:
    """Create a place.

    Naming no parent creates the top of a tree, which only an operator may
    do: a new organisation is not something an admin of one other
    organisation should be able to conjure. Naming a parent creates a
    place inside it, and the parent has to be one the caller may
    administer.

    The type decides which of the two is allowed, so neither can be
    produced by accident.

    Requires ``manage_users``.
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
        _require_visible(db, current_user, body.parent_id)

    unit = OrgUnit(
        name=body.name.strip(),
        type=unit_type,
        parent_id=body.parent_id,
        location=body.location.strip() if body.location else None,
    )
    db.add(unit)
    db.flush()

    if body.parent_id is None:
        _keep_the_organisation_row_in_step(db, unit)

    db.refresh(unit)
    return _item(unit)


@router.get(
    "/{unit_id}",
    response_model=OrgUnitDetailOut,
    dependencies=[DEP_REQUIRE_MANAGE_USERS],
)
def get_org_unit(
    unit_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitDetailOut:
    """One place, with who is here and what is inside it.

    Features and the patient list come back empty for anything but the top
    of a tree, because that is the only kind of place that carries them.

    Requires ``manage_users``.
    """
    unit = _require_visible(db, current_user, unit_id)

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
    if type_can_hold_features(unit.type):
        features = list(
            db.execute(
                select(OrgUnitFeature.feature_key)
                .where(OrgUnitFeature.org_unit_id == unit_id)
                .order_by(OrgUnitFeature.feature_key)
            )
            .scalars()
            .all()
        )
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
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_USERS],
)
def update_org_unit(
    unit_id: int,
    body: UpdateOrgUnitIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitItem:
    """Change a place. Only the fields given are changed.

    Moving a place is refused if it would put the place inside itself, at
    any depth, and if the new parent is one the caller may not administer.

    Requires ``manage_users``.
    """
    unit = _require_visible(db, current_user, unit_id)

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
        if would_make_a_cycle(db, unit_id, body.parent_id):
            raise HTTPException(
                status_code=400,
                detail="A place cannot sit inside itself",
            )
        _require_visible(db, current_user, body.parent_id)
        unit.parent_id = body.parent_id

    if _is_root(unit):
        _keep_the_organisation_row_in_step(db, unit)

    db.flush()
    db.refresh(unit)
    return _item(unit)


@router.patch(
    "/{unit_id}/active",
    response_model=OrgUnitItem,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_USERS],
)
def set_org_unit_active(
    unit_id: int,
    body: ToggleOrgUnitActiveIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitItem:
    """Put a place in or out of use. Requires ``manage_users``."""
    unit = _require_visible(db, current_user, unit_id)
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
    """Delete a place. Requires ``manage_users``.

    Deleting the top of a tree is an operator's job, matching what
    deleting an organisation has always required.
    """
    unit = _require_visible(db, current_user, unit_id)

    if _is_root(unit) and current_user.platform_role != "superadmin":
        raise HTTPException(
            status_code=403, detail="Requires superadmin permissions"
        )

    if _is_root(unit):
        organisation = db.scalar(
            select(Organisation).where(Organisation.org_unit_id == unit.id)
        )
        if organisation is not None:
            # Deleting the organisation takes its place with it, through
            # the listener on the model, which also clears everything
            # hanging off that place.
            db.delete(organisation)
            db.flush()
            return OrgUnitStatusOut(status="deleted")

    db.delete(unit)
    db.flush()
    return OrgUnitStatusOut(status="deleted")


# ------------------------------------------------------------------
# Who is here
# ------------------------------------------------------------------


@router.get(
    "/{unit_id}/members",
    response_model=OrgUnitMembersOut,
    dependencies=[DEP_REQUIRE_MANAGE_USERS],
)
def list_org_unit_members(
    unit_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitMembersOut:
    """Everybody at one place. Requires ``manage_users``."""
    _require_visible(db, current_user, unit_id)
    return _members_of(db, unit_id)


@router.post(
    "/{unit_id}/members",
    response_model=OrgUnitStatusOut,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_STAFF],
)
def add_org_unit_member(
    unit_id: int,
    body: AddOrgUnitMemberIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitStatusOut:
    """Record that somebody is at a place, in a given capacity.

    The grant goes in the same request as the membership. Adding somebody
    and then separately remembering to give them competencies is two steps
    that can be half-done, and the half-done state is a new starter who
    can reach nothing.

    Recording the same membership twice changes the capacity rather than
    failing.

    Requires ``manage_staff_membership``.
    """
    unit = _require_visible(db, current_user, unit_id)

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
        select(org_unit_member.c.user_id).where(
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

    grant_staff_competencies(
        person, body.base_profession, body.additional_competencies
    )
    db.flush()
    return OrgUnitStatusOut(status=status)


@router.delete(
    "/{unit_id}/members/{user_id}",
    response_model=OrgUnitStatusOut,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_STAFF],
)
def remove_org_unit_member(
    unit_id: int,
    user_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitStatusOut:
    """Take somebody off a place.

    Anything they hold here goes with them. Naming a clinical lead
    requires the person to be at the place, so leaving them holding the
    post after taking them off it would leave the place in a state the
    same surface refuses to create. The post is vacated rather than
    deleted, so the handover is recorded.

    Requires ``manage_staff_membership``.
    """
    unit = _require_visible(db, current_user, unit_id)

    if clinical_leads_of(db, [unit_id]).get(unit_id) == user_id:
        set_clinical_lead(db, unit, None, appointed_by=current_user)

    result = db.execute(
        delete(org_unit_member).where(
            org_unit_member.c.org_unit_id == unit_id,
            org_unit_member.c.user_id == user_id,
        )
    )
    if result.rowcount == 0:  # type: ignore[attr-defined]
        raise HTTPException(status_code=404, detail="Membership not found")

    db.flush()
    return OrgUnitStatusOut(status="removed")


@router.put(
    "/{unit_id}/clinical-lead",
    response_model=OrgUnitStatusOut,
    dependencies=[DEP_REQUIRE_CSRF, DEP_REQUIRE_MANAGE_STAFF],
)
def set_org_unit_clinical_lead(
    unit_id: int,
    body: SetClinicalLeadIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitStatusOut:
    """Name the clinical lead of a place, or leave the post vacant.

    A post is not a competency: it can be vacant, and "this ward has no
    clinical lead" is a real and actionable state. Passing no person
    vacates it, which is why this is one route rather than an add and a
    remove.

    Whoever holds it substantively is stood down first, so a handover is
    recorded rather than the previous holder simply vanishing.

    The person has to be at the place already. Naming somebody who is not
    would make the post say they are involved here when nothing else does.

    Requires ``manage_staff_membership``.
    """
    unit = _require_visible(db, current_user, unit_id)

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

        at_this_place = db.scalar(
            select(org_unit_member.c.user_id).where(
                org_unit_member.c.org_unit_id == unit_id,
                org_unit_member.c.user_id == body.user_id,
            )
        )
        if at_this_place is None:
            raise HTTPException(
                status_code=422,
                detail="That person is not at this place.",
            )

    set_clinical_lead(db, unit, lead, appointed_by=current_user)
    db.flush()
    return OrgUnitStatusOut(status="vacant" if lead is None else "set")


# ------------------------------------------------------------------
# What a place carries
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
    """Which features are on at a place. Requires ``manage_users``."""
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
    dependencies=[DEP_REQUIRE_CSRF],
)
def set_org_unit_feature(
    unit_id: int,
    feature_key: str,
    body: ToggleOrgUnitFeatureIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> OrgUnitStatusOut:
    """Switch a feature on or off at a place.

    Only the top of a tree carries features. Refusing here rather than
    writing a row nothing would ever read: a feature quietly enabled on a
    ward that does nothing is worse than being told it cannot be.

    Requires superadmin permissions, as switching a feature on always has.
    """
    if current_user.platform_role != "superadmin":
        raise HTTPException(
            status_code=403, detail="Requires superadmin permissions"
        )

    unit = _require_visible(db, current_user, unit_id)

    if not type_can_hold_features(unit.type):
        raise HTTPException(
            status_code=422,
            detail=f"A {unit.type} does not carry features.",
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
        db.add(
            OrgUnitFeature(
                org_unit_id=unit_id,
                feature_key=feature_key,
                enabled_by=current_user.id,
            )
        )
        db.flush()
        return OrgUnitStatusOut(status="enabled")

    if existing is None:
        return OrgUnitStatusOut(status="already_disabled")
    db.delete(existing)
    db.flush()
    return OrgUnitStatusOut(status="disabled")


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
    """Record that a place is responsible for a patient.

    Only the top of a tree keeps a patient list, for the same reason it is
    the only place that carries features.

    Requires ``manage_patient_membership``.
    """
    unit = _require_visible(db, current_user, unit_id)

    if not type_can_hold_features(unit.type):
        raise HTTPException(
            status_code=422,
            detail=f"A {unit.type} does not keep a patient list.",
        )

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
    """Stop a place being responsible for a patient.

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
    """Every relationship this place is either end of.

    Both directions. A school teaching at a trust is one fact and the
    reverse is another, so a place has to see the links pointing at it as
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
    """Record a relationship from this place to another.

    **The place at the other end is not checked for ownership**, and that
    is the point: the relationships worth recording cross between
    organisations, and requiring both ends would make this useless for
    exactly those.

    Requires ``manage_users``, and the place the link is *from* must be
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
    """Remove a relationship this place is either end of.

    Either end may remove it. A relationship somebody else recorded about
    your place is still a claim about your place.

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
    """Build the response listing every link a place is an end of."""
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

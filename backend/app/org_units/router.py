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

from app.cbac.competencies import FRAMEWORK_IDS, SCOPED_MANAGER_IDS
from app.cbac.grant_scope import scope_for
from app.cbac.positions import clinical_leads_of, set_clinical_lead
from app.cbac.practising import authorise_practice, withdraw_practice
from app.db import get_core_db
from app.deps import (
    DEP_CURRENT_USER,
    DEP_REQUIRE_CLINICAL,
    get_current_user,
    has_competency,
    requires_any_competency,
)
from app.features.passport import cover
from app.features.passport.models import OrgUnitPassportFramework
from app.models import (
    OrgUnit,
    OrgUnitFeature,
    OrgUnitLink,
    PractisingCompetency,
    User,
    org_unit_member,
    org_unit_patient_member,
)
from app.org_units.access import (
    require_editable,
    require_member,
    require_visible,
    scoped_manager_ids,
    through_a_scope,
    visible_ids,
)
from app.org_units.detail import names_of, org_unit_detail
from app.org_units.features import switch_feature
from app.org_units.links import add_link
from app.org_units.members import add_member, name_clinical_lead
from app.org_units.practice import (
    grant_refusal,
    grant_then_authorise,
    practice_refusal,
)
from app.org_units.relations import get_org_unit_relation
from app.org_units.structure import add_org_unit, change_org_unit
from app.org_units.types import get_org_unit_type, type_requires_parent
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
    OrgUnitChildItem,
    OrgUnitDetailOut,
    OrgUnitFeatureItem,
    OrgUnitFeaturesOut,
    OrgUnitItem,
    OrgUnitMemberItem,
    OrgUnitMembersOut,
    OrgUnitPassportCoverOut,
    OrgUnitPassportFrameworksOut,
    OrgUnitsListOut,
    OrgUnitStatusOut,
    PractisingCompetenciesOut,
    PractisingCompetencyItem,
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
from app.users.scope import check_account_in_scope

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
#: whitelist, which the route body enforces through ``through_a_scope``.
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


# ------------------------------------------------------------------
# Who may see what
# ------------------------------------------------------------------


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
            OrgUnitMemberItem(
                id=row.id,
                username=row.username,
                email=row.email,
                full_name=row.full_name or "",
                capacity=row.capacity,
                authorised_here=counts.get(row.id, 0),
            )
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

    if through_a_scope(current_user, "manage_users"):
        visible = scoped_manager_ids(db, current_user)
    else:
        visible = visible_ids(db, current_user)
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
    ``require_editable``; deleting one, and its features, still take
    ``manage_users``.
    """
    unit = add_org_unit(
        db,
        current_user,
        name=body.name,
        unit_type=body.type,
        parent_id=body.parent_id,
        location=body.location,
    )

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
    detail = org_unit_detail(db, current_user, unit_id)
    unit = detail.unit
    parent = detail.parent
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
        parent_name=parent.name if parent is not None else "",
        parent_is_root=_is_root(parent) if parent is not None else False,
        location=unit.location or "",
        is_active=unit.is_active,
        created_at=unit.created_at.isoformat(),
        updated_at=unit.updated_at.isoformat(),
        members=_members_of(db, unit_id).members,
        children=[
            OrgUnitChildItem(
                id=child.id,
                name=child.name,
                type=child.type,
                is_active=child.is_active,
                clinical_lead_id=detail.child_leads.get(child.id),
                clinical_lead_name=detail.lead_names.get(
                    detail.child_leads.get(child.id, 0), ""
                ),
            )
            for child in detail.children
        ],
        features=detail.features,
        patient_ids=detail.patient_ids,
        clinical_lead_id=detail.clinical_lead_id,
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
    ``require_editable``.
    """
    unit = change_org_unit(
        db,
        current_user,
        unit_id,
        name=body.name,
        unit_type=body.type,
        parent_id=body.parent_id,
        location=body.location,
    )

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
    ``manage_teaching`` at a site they act at. See ``require_editable``.
    """
    unit = require_editable(db, current_user, unit_id)
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
    unit = require_visible(db, current_user, unit_id)

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
    require_visible(db, current_user, unit_id, "manage_users")

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
    require_visible(db, current_user, unit_id, "manage_staff_membership")

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
    status = add_member(
        db,
        current_user,
        unit_id,
        user_id=body.user_id,
        capacity=body.capacity,
        base_profession=body.base_profession,
        additional_competencies=body.additional_competencies,
    )

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
    unit = require_visible(
        db, current_user, unit_id, "manage_staff_membership"
    )

    if through_a_scope(current_user, "manage_staff_membership"):
        person = require_member(db, unit_id, user_id)
        check_account_in_scope(current_user, person)

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
    status = name_clinical_lead(db, current_user, unit_id, body.user_id)

    return OrgUnitStatusOut(status=status)


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
    require_visible(
        db, current_user, unit_id, "manage_practising_competencies"
    )
    through_teaching = through_a_scope(
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
            PractisingCompetencyItem(
                user_id=row.id,
                username=row.username,
                full_name=row.full_name or "",
                competency=row.competency,
                authorised_at=row.authorised_at.isoformat(),
                authorised_by=row.authorised_by,
            )
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
    unit = require_visible(
        db, current_user, unit_id, "manage_practising_competencies"
    )
    person = require_member(db, unit_id, user_id)
    through_teaching = through_a_scope(
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
    names = names_of(
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
        may_grant=grant_refusal(db, current_user, person) is None,
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
    status = grant_then_authorise(
        db,
        current_user,
        unit_id=unit_id,
        user_id=user_id,
        competency=body.competency,
    )

    return OrgUnitStatusOut(status=status)


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
    require_visible(db, current_user, unit_id)

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
            OrgUnitFeatureItem(
                feature_key=row.feature_key,
                enabled_at=(
                    row.enabled_at.isoformat() if row.enabled_at else None
                ),
                enabled_by=row.enabled_by,
            )
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
    status = switch_feature(
        db, current_user, unit_id, feature_key, enabled=body.enabled
    )

    return OrgUnitStatusOut(status=status)


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
    require_visible(db, current_user, unit_id)

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
    require_visible(db, current_user, unit_id)

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
    require_visible(db, current_user, unit_id)

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
    require_visible(db, current_user, unit_id)

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
    require_visible(db, current_user, unit_id)

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
    require_visible(db, current_user, unit_id)

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
    add_link(
        db,
        current_user,
        unit_id,
        target_id=body.target_id,
        relation=body.relation,
    )

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
    require_visible(db, current_user, unit_id)

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

"""Making somebody an account: the whole of it, in one place.

The user form sends everything about a new person in one request. This
module checks it, checks the caller may make that account, and writes
it: the account, what they hold, where they belong, where they practise
and what they are enrolled on, calling the parts beside it that saving a
page calls too.

The order is the rule, here as in :mod:`app.users.update`. What was
sent is checked before who is asking; nothing is written until both
have passed; and the account, its competencies and its org units are
there before practice, which is checked against all three, and before
teaching enrolments, which come last.
"""

from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.orm import Session

from app.cbac.base_professions import resolve_user_competencies
from app.cbac.grant_scope import scope_for
from app.cbac.grants import sync_competency_rows
from app.features.passport import cover as passport_cover
from app.marketing.subscribers import fold_into_account
from app.models import OrgUnit, User, normalise_email, org_unit_member
from app.security import hash_password
from app.users.competencies import additional_for_platform_role
from app.users.enrolments import settle_teaching_enrolments
from app.users.errors import MissingRequiredFields, NoPlaceChosen
from app.users.identity import (
    check_email_free,
    check_password_long_enough,
    check_username_free,
)
from app.users.membership import (
    capacity_at,
    org_units_the_caller_administers,
)
from app.users.practice import settle_practice
from app.users.scope import (
    check_changes_in_scope,
    check_may_set_platform_role,
    check_profession_in_scope,
)


@dataclass(frozen=True)
class NewAccount:
    """What the user form sent for somebody new.

    The profession, the competencies and the platform role are ids the
    caller has already checked against their catalogues, as the request
    model does when the request is read.

    Attributes:
        name: Their full name. Held trimmed.
        email: Their address. Held trimmed and in lower case.
        password: Their password, as typed.
        username: What they sign in with. Left out or empty, it is made
            from the name: trimmed, its spaces taken out, in lower case.
        base_profession: The profession they are given.
        additional_competencies: What they are to hold beyond it.
        removed_competencies: What it gives that they are not to hold.
        platform_role: ``standard``, unless they are to operate Quill.
        org_unit_ids: Every org unit they are to belong to.
        practising: For each org unit sent, what they may practise
            there. Naming no org unit leaves them authorised nowhere.
        teaching_enrolments: For each organisation sent, each module
            they are to be enrolled on and when that ends. Naming no
            organisation is not looked at, which is where this differs
            from a save: there it is still asked whether the caller may
            settle enrolments at all.
    """

    name: str
    email: str
    password: str
    username: str | None = None
    base_profession: str = "patient"
    additional_competencies: list[str] = field(default_factory=list)
    removed_competencies: list[str] = field(default_factory=list)
    platform_role: str = "standard"
    org_unit_ids: list[int] = field(default_factory=list)
    practising: dict[int, list[str]] = field(default_factory=dict)
    teaching_enrolments: dict[int, dict[str, datetime | None]] = field(
        default_factory=dict
    )


def create_account(db: Session, actor: User, new: NewAccount) -> User:
    """Make the account the user form asked for, with everything on it.

    The checks run first, in a fixed order, so when two things are wrong
    the same one is always reported: what was sent, then the org units
    named, then whether a caller whose scope has a limit may make this
    account. Then the account is written and the parts are settled, each
    refusing in its own words: see the module each lives in for what it
    raises.

    An address the caller gives is taken as verified: an administrator
    vouches for it.

    Making an operator follows the rule a save follows, from the one
    function both call: only an operator may make another, and the new
    one is given the operator competencies beside whatever else they
    hold. It is asked last of the checks, as a save asks it after the
    checks on the caller's scope, and before anything is written.

    Everything is flushed and nothing is committed: the caller's
    transaction decides whether the account is kept, so a refusal
    part-way through leaves nobody behind once that transaction is
    rolled back.

    Args:
        db: Core database session.
        actor: The caller.
        new: What the form sent.

    Returns:
        The account, flushed and refreshed, so it has its id.

    Raises:
        MissingRequiredFields: If the address or the password is empty.
        PasswordTooShort: If the password is under eight characters.
        UsernameTaken: If an account has the username.
        EmailTaken: If an account has the address.
        PlaceNotFound: Naming the first org unit that does not exist or
            is outside the caller's reach.
        NoPlaceChosen: If the caller's scope has a limit and no org
            unit was named.
        PlatformRoleNotAllowed: If the caller's scope has a limit and
            the account is not a standard one.
        ProfessionOutOfScope: If the caller may not give the profession.
        CompetenciesOutOfScope: If the account would hold a competency
            the caller may not grant.
        SuperadminRoleNotAllowed: If the caller is not an operator and
            the account is to have the ``superadmin`` platform role.
        UserAdminError: Whatever practice or enrolments refuse, in that
            order, once the account is written.
    """
    email = normalise_email(new.email)
    username = new.username or new.name.strip().replace(" ", "").lower()

    if not email or not new.password:
        raise MissingRequiredFields()

    check_password_long_enough(new.password)
    check_username_free(db, username)
    check_email_free(db, email)

    places = org_units_the_caller_administers(db, actor, new.org_unit_ids)

    if not scope_for(actor).unlimited:
        _check_within_a_limited_scope(actor, new, places)

    # After the scope checks, as on a save, so a caller whose scope has
    # a limit is still told they may set no platform role at all. The
    # last thing that can refuse before the account is written.
    additional = additional_for_platform_role(
        actor, new.platform_role, new.additional_competencies
    )

    user = User(
        username=username,
        full_name=new.name.strip(),
        email=email,
        password_hash=hash_password(new.password),
        base_profession=new.base_profession,
        platform_role=new.platform_role,
        email_verified=True,
    )
    sync_competency_rows(
        user,
        additional=additional,
        removed=new.removed_competencies,
        source="admin",
        granted_by=actor.id,
    )
    db.add(user)
    db.flush()
    # An admin vouches for the address, so if it is on the mailing list
    # of people with no account, one record of them is kept.
    fold_into_account(db, user)

    _join(db, actor, user, places)
    db.flush()
    db.refresh(user)

    # Last, once they belong somewhere and hold something: where they
    # may practise it. Same transaction as the account itself.
    if new.practising:
        settle_practice(db, actor, user, new.practising)

    # After practice, so a place the form set is already there and
    # naming a module adds only what is still missing.
    if new.teaching_enrolments:
        settle_teaching_enrolments(db, actor, user, new.teaching_enrolments)

    return user


def _check_within_a_limited_scope(
    actor: User, new: NewAccount, places: list[OrgUnit]
) -> None:
    """Refuse an account a caller whose scope has a limit may not make.

    Asked only of such a caller. Somebody holding ``manage_users`` has
    no limit and is asked none of this.
    """
    # Somebody with a limited scope reaches an account only through a
    # shared org unit, so one they create in none would be out of
    # their reach the moment it existed.
    if not places:
        raise NoPlaceChosen()

    check_may_set_platform_role(
        actor, sets_platform_role=new.platform_role != "standard"
    )
    check_profession_in_scope(actor, new.base_profession)
    check_changes_in_scope(
        actor,
        set(),
        set(
            resolve_user_competencies(
                new.base_profession,
                new.additional_competencies,
                new.removed_competencies,
            )
        ),
    )


def _join(db: Session, actor: User, user: User, places: list[OrgUnit]) -> None:
    """Make the new account a member of each org unit, with cover in step.

    A new account has no membership to clear and no capacity to carry,
    which is why this is not ``settle_membership``.
    """
    # The one list, in org unit ids. Organisations and the org units
    # inside them are rows in the same table, so there is nothing to
    # split.
    for place in places:
        db.execute(
            org_unit_member.insert().values(
                org_unit_id=place.id,
                user_id=user.id,
                capacity=capacity_at(place),
            )
        )

    # Joining an org unit whose passport cover is on grants writing.
    passport_cover.memberships_changed(
        db,
        user.id,
        before={},
        after=passport_cover.capacities_of(db, user.id),
        changed_by=actor,
    )

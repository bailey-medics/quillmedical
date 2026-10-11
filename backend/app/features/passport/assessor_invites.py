"""Bringing an assessor in to a passport they were asked about.

An assessor is whoever a holder asks, by address. Somebody with an
account is given what they need to open the request as it is made:
:func:`let_existing_account_assess`. Somebody without one is sent an
invitation, a row and a signed token naming it, and is let in when they
accept it: :func:`invite_for` makes one and :func:`accept_invite` spends
it.

Either way they end up a member, in the ``external`` capacity, of one of
the holder's own org units, which is what the passport feature is
reached through.

**Accepting needs no sign-in.** What stands in for one is the token: it
is signed, it expires, and it names the invitation row. Nothing here
trusts anything else the caller sends about who they are.

This module decides who is let in and makes the token. Writing the
email, building the link and sending it belong to the router, which
knows the address of the site and holds the sender.
"""

from __future__ import annotations

import hashlib
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal, cast

from jose import JWTError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.marketing.subscribers import fold_into_account
from app.models import (
    OrgUnitFeature,
    ProfessionalRegistration,
    User,
    UserCompetency,
    normalise_email,
    org_unit_member,
)
from app.organisations import add_org_unit_member, feature_holder_ids_of
from app.registrations import canonical_authority
from app.security import (
    PASSPORT_INVITE_TTL_DAYS,
    create_passport_invite_token,
    decode_passport_invite_token,
    hash_password,
)

from .errors import (
    AccountDetailsNeeded,
    FullNameNeeded,
    HolderBelongsNowhere,
    InviteAlreadyAccepted,
    InviteNoLongerValid,
    InviteNotValid,
    InviterBelongsNowhere,
    PasswordTooShort,
    RegistrationNeeded,
    UnknownRegisteringBody,
    UsernameTaken,
)
from .models import Passport, PassportAssessorInvite

#: The competency that opens the assessor's side of the passport.
ASSESSOR_COMPETENCY = "assess_clinician_passport"

#: The profession somebody new is given when they accept. It carries
#: :data:`ASSESSOR_COMPETENCY` and nothing else.
EXTERNAL_ASSESSOR_PROFESSION = "passport_external_assessor"


@dataclass(frozen=True)
class AcceptedInvite:
    """What accepting an invitation did.

    Attributes:
        status: ``registered`` when an account was made, ``linked`` when
            the address already had one.
        user_id: The account that was let in.
        org_unit_id: The org unit it is now an external member of.
    """

    status: Literal["registered", "linked"]
    user_id: int
    org_unit_id: int


def _as_utc(moment: datetime) -> datetime:
    """A stored timestamp as an aware UTC one.

    Postgres hands back what it was given, but SQLite has no timezone
    type and drops the offset, so a column declared
    ``DateTime(timezone=True)`` reads back naive under the unit suite.
    Comparing that against the present raises rather than returning a
    wrong answer, which is the good version of this bug - but it still
    has to be handled, and assuming UTC is safe because UTC is the only
    thing ever written.
    """
    if moment.tzinfo is None:
        return moment.replace(tzinfo=UTC)

    return moment.astimezone(UTC)


def holder_org_unit(db: Session, passport_id: str) -> int:
    """The org_unit an assessor should join to reach this passport.

    One of the holder's own org_units where the passport is switched on,
    so joining it gives the assessor the access they need. What kind of
    org_unit it is does not matter: the tree has one kind of node, and a
    type says what a node is, never whether it may be chosen here.

    This once had two branches, one for a site and one for an
    organisation, and only the site branch looked for the passport. A
    holder whose only passport org_unit was an organisation had an
    assessor put in their first organisation instead, which on 28
    September 2026 was a teaching one: the assessor was granted the
    competency and still could not see the passport.

    Where several qualify, the lowest id. That is arbitrary, but stable,
    and any of them reaches the feature.

    Returns:
        The org_unit id.

    Raises:
        InviteNoLongerValid: If no passport has that id.
        InviterBelongsNowhere: If the holder belongs nowhere. Nothing
            can be derived then, and inventing an org_unit would be
            worse than saying so.
    """
    passport = db.get(Passport, passport_id)

    if passport is None:
        raise InviteNoLongerValid()

    member_ids = sorted(
        int(row)
        for row in cast(
            Sequence[int],
            db.execute(
                select(org_unit_member.c.org_unit_id).where(
                    org_unit_member.c.user_id == passport.user_id
                )
            )
            .scalars()
            .all(),
        )
    )

    # The same question `requires_feature` asks, so one that passes here
    # is one the gate will accept.
    with_feature = [
        unit_id
        for unit_id in member_ids
        if db.scalar(
            select(OrgUnitFeature.id).where(
                OrgUnitFeature.org_unit_id.in_(
                    feature_holder_ids_of(db, [unit_id])
                ),
                OrgUnitFeature.feature_key == "passport",
            )
        )
        is not None
    ]

    # A holder always reaches the passport, or they could not have asked,
    # so `with_feature` is empty only for data the gate would already
    # refuse. Falling back to any membership keeps that case as it was.
    usable = with_feature or member_ids

    if usable:
        return usable[0]

    raise InviterBelongsNowhere()


def join_as_external(db: Session, user_id: int, org_unit_id: int) -> None:
    """Make somebody an external member of an org_unit, unless they
    already belong there in any capacity.

    Checked first because writing a membership that exists changes its
    capacity, and a staff member asked to assess must not be demoted to
    external at the org_unit they work for.
    """
    already = db.scalar(
        select(org_unit_member.c.user_id).where(
            org_unit_member.c.org_unit_id == org_unit_id,
            org_unit_member.c.user_id == user_id,
        )
    )

    if already is None:
        add_org_unit_member(db, org_unit_id, user_id, "external")


def let_existing_account_assess(
    db: Session, assessor: User, passport_id: str, holder: User
) -> None:
    """Give an existing account what it needs to open the request.

    Somebody new to Quill gets this by accepting the invitation: the
    `passport_external_assessor` profession, which carries
    `assess_clinician_passport`, and an external membership where the
    holder is, which reaches the passport feature. An existing account is
    sent no invitation, so it got neither, on the assumption that every
    existing account asked to assess is a clinician at an organisation
    with the passport. A teaching delegate asked on 28 September 2026 was
    neither, and met a 404 on the page and a 403 from the API.

    So it gets the same two things here: the membership, and the
    competency as a grant of its own, leaving its profession alone. What
    it may act on is still only the requests that name it. Runs before
    the email, in the same transaction, so a failed send takes it back.

    The rows are flushed, not committed.

    Raises:
        InviteNoLongerValid: If no passport has that id.
        HolderBelongsNowhere: If the holder is at no org_unit, so there
            is nowhere to put the assessor.
    """
    try:
        org_unit_id = holder_org_unit(db, passport_id)
    except InviterBelongsNowhere:
        # Said to the holder here, where `holder_org_unit` speaks to the
        # person accepting an invitation.
        raise HolderBelongsNowhere() from None
    join_as_external(db, assessor.id, org_unit_id)

    if ASSESSOR_COMPETENCY not in assessor.get_final_competencies():
        assessor.competency_grants.append(
            UserCompetency(
                competency_id=ASSESSOR_COMPETENCY,
                starts_on=datetime.now(UTC),
                source="sign_off_request",
                org_unit_id=org_unit_id,
                granted_by=holder.id,
            )
        )
    db.flush()


def invite_for(
    db: Session,
    *,
    passport_id: str,
    invited_by_user_id: int,
    email: str,
    competency_id: str,
) -> str:
    """Make an invitation for somebody with no account, and its token.

    The row is what makes the link single-use: a token carries no record
    of having been spent. Only the token's hash is kept, so reading the
    row does not hand anybody the link.

    The row is flushed, not committed, so a send that then fails takes
    the invitation back with it.

    Args:
        db: Core database session.
        passport_id: The passport the assessor is being brought in to.
        invited_by_user_id: The holder who asked.
        email: The address the invitation goes to, and the only one that
            may redeem it.
        competency_id: What they were asked to judge.

    Returns:
        The signed token, to be put in the link that is emailed. It is
        returned to nobody else.
    """
    # token_hash is empty only until the token is made, just below.
    invite = PassportAssessorInvite(  # nosec B106
        id=str(uuid.uuid4()),
        passport_id=passport_id,
        invited_by_user_id=invited_by_user_id,
        # The holder gave an address and nothing else. The assessor
        # states their own name and registration when they accept,
        # which is the more trustworthy source for both, and is why
        # this row no longer carries columns for them.
        email=email,
        # So the accept page can say what they were asked to judge.
        # Not what they may sign: that is still resolved from the
        # request rows naming them.
        competency_id=competency_id,
        token_hash="",
        expires_at=datetime.now(UTC)
        + timedelta(days=PASSPORT_INVITE_TTL_DAYS),
    )
    token = create_passport_invite_token(
        invite_id=invite.id,
        email=invite.email,
    )
    invite.token_hash = hashlib.sha256(token.encode()).hexdigest()
    db.add(invite)
    db.flush()

    return token


def invite_named_by(
    db: Session, token: str
) -> tuple[PassportAssessorInvite, str]:
    """The invitation a token names, with the email it was sent to.

    Raises:
        InviteNotValid: If the token is unreadable, expired, or names
            an invitation that no longer exists. One message for all
            three: a caller holding a bad token learns only that it is
            bad, never whether a given invitation exists.
    """
    try:
        payload = decode_passport_invite_token(token)
    except JWTError:
        raise InviteNotValid() from None

    invite = db.get(PassportAssessorInvite, str(payload.get("invite_id", "")))

    if invite is None:
        raise InviteNotValid()

    # The token carries its own expiry and ``jwt.decode`` has already
    # enforced it. The row is checked as well, because the row is what
    # an administrator can see and reason about, and the two must not be
    # able to disagree.
    if _as_utc(invite.expires_at) <= datetime.now(UTC):
        raise InviteNotValid()

    return invite, str(payload["email"])


def _new_assessor(
    db: Session,
    email: str,
    *,
    username: str | None,
    password: str | None,
    full_name: str | None,
    registration_authority: str | None,
    registration_number: str | None,
) -> User:
    """Make the account of somebody accepting who has none.

    The row is flushed, not committed.

    Raises:
        AccountDetailsNeeded: If the username or the password is
            missing.
        PasswordTooShort: If the password is under eight characters.
        FullNameNeeded: If no name was given.
        RegistrationNeeded: If the registering body or the number is
            missing.
        UnknownRegisteringBody: If the jurisdiction does not list the
            body.
        UsernameTaken: If another account has the username.
    """
    if not username or not password:
        raise AccountDetailsNeeded()

    if len(password) < 8:
        raise PasswordTooShort()

    # Stated here rather than taken from the invitation. A trainee
    # asking for a sign-off gives an address and nothing else, so
    # the invitation carries no name or registration to copy - and
    # a number typed by its holder is worth more than one typed by
    # somebody who half-remembered it.
    name = (full_name or "").strip()
    authority = (registration_authority or "").strip()
    number = (registration_number or "").strip()

    if not name:
        raise FullNameNeeded()

    if not authority or not number:
        raise RegistrationNeeded()

    # A body the jurisdiction lists, in its own spelling: `gmc` is
    # taken to mean `GMC`. Anything else is refused here rather than
    # by the model, which would answer with a 500.
    listed = canonical_authority(authority)

    if listed is None:
        raise UnknownRegisteringBody()

    if db.scalar(select(User).where(User.username == username.strip())):
        raise UsernameTaken()

    user = User(
        username=username.strip(),
        email=email,
        full_name=name,
        password_hash=hash_password(password),
        # The profession is the whole grant: access to the passport
        # and nothing else. No PractisingCompetency row is written,
        # so the clinical authorisation table keeps meaning only
        # clinical things.
        base_profession=EXTERNAL_ASSESSOR_PROFESSION,
        is_active=True,
        # The invitation went to this address and the token proves
        # they read it, which is the same thing verification asks.
        email_verified=True,
    )
    user.registrations.append(
        ProfessionalRegistration(authority=listed, number=number)
    )
    db.add(user)
    db.flush()
    # The invitation proved the address, so if it is on the mailing
    # list of people with no account, one record of them is kept.
    fold_into_account(db, user)

    return user


def accept_invite(
    db: Session,
    token: str,
    *,
    username: str | None,
    password: str | None,
    full_name: str | None,
    registration_authority: str | None,
    registration_number: str | None,
) -> AcceptedInvite:
    """Let in whoever holds an invitation's token, and spend it.

    Only this sets ``accepted_at``, and only this is refused a second
    time. The token cannot enforce single use - a JWT carries no record
    of having been spent - so the row does.

    Who they are is the address in the token, and nothing they send.
    Where that address has an account, the account is the one let in
    and everything else sent is ignored. Where it has none, one is made
    from what they sent.

    An account made here is checked before the holder's org_unit is
    looked for, as it always was, so a refusal for a holder who belongs
    nowhere relies on the caller's transaction being rolled back. The
    rows are flushed, not committed.

    Args:
        db: Core database session.
        token: The token from the invitation link.
        username: The username for a new account.
        password: The password for a new account.
        full_name: Their name, as they state it.
        registration_authority: Their registering body, as they state
            it, in any case.
        registration_number: Their registration number, as they state
            it.

    Returns:
        What was done, and for which account at which org_unit.

    Raises:
        InviteNotValid: If the token does not name an invitation that
            can still be used.
        InviteAlreadyAccepted: If the invitation has been spent.
        AccountDetailsNeeded: If an account must be made and the
            username or the password is missing.
        PasswordTooShort: If the password is under eight characters.
        FullNameNeeded: If an account must be made and no name was
            given.
        RegistrationNeeded: If an account must be made and the
            registering body or the number is missing.
        UnknownRegisteringBody: If the jurisdiction does not list the
            body.
        UsernameTaken: If another account has the username.
        InviteNoLongerValid: If the passport is no longer there.
        InviterBelongsNowhere: If the holder is at no org_unit.
    """
    invite, email = invite_named_by(db, token)

    if invite.accepted_at is not None:
        raise InviteAlreadyAccepted()

    existing = db.scalar(
        select(User).where(User.email == normalise_email(email))
    )
    status: Literal["registered", "linked"]

    if existing is not None:
        user = existing
        status = "linked"
        # Nothing about an existing account is changed: not their
        # profession, not their competencies. All fourteen clinical
        # professions already carry assess_clinician_passport, and what
        # they may act on is resolved from the request rows naming them.
    else:
        user = _new_assessor(
            db,
            email,
            username=username,
            password=password,
            full_name=full_name,
            registration_authority=registration_authority,
            registration_number=registration_number,
        )
        status = "registered"

    org_unit_id = holder_org_unit(db, invite.passport_id)
    join_as_external(db, user.id, org_unit_id)

    invite.accepted_at = datetime.now(UTC)
    invite.accepted_user_id = user.id
    db.flush()

    return AcceptedInvite(
        status=status,
        user_id=user.id,
        org_unit_id=org_unit_id,
    )

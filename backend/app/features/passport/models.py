"""SQLAlchemy models for the clinician passport.

The database holds coordination state and an index of existence, never a
copy of the record. That division is the whole storage design: a passport
is a git repository of YAML the holder can carry between trusts, and a
row here would be a second version of the truth waiting to disagree with
the first.

So there is deliberately **no sign-off table**, no per-competency status
table, and no cached progress. A holder's page reads their repository.
What the database does hold is the two things files genuinely cannot
answer:

- **Where a repository is.** One row per holder, carrying the head commit
  so a read can tell whether it has moved, and the storage generation so
  the bucket backend can do compare-and-swap.
- **Who has been asked to sign what.** An assessor's inbox is a query
  across many passports, and no single repository can answer it. The row
  is the *request*, not the record: it closes when the sign-off file is
  written, and the file is what anyone later reads.

Tables:

- ``Passport`` — the pointer to one holder's repository.
- ``PassportSignOffRequest`` — an open ask, closed when resolved.
- ``PassportAssessorInvite`` — an outside assessor being brought in.
- ``AssessorRegistrationVerification`` — that an admin checked a register.
- ``SiteCommonCompetency`` — an admin-curated shortlist for the picker.
- ``PassportWriteEntitlement`` — until when somebody may add to their
  own passport, and what paid for it.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base

#: What a request can be. Mirrors the sign-off file's own vocabulary for
#: the states a *request* can reach — a file may also be ``superseded``,
#: which is a fact about the record rather than about the asking.
REQUEST_STATUSES: tuple[str, ...] = (
    "open",
    "signed_off",
    "declined",
    "withdrawn",
)


class Passport(Base):
    """Where one holder's passport repository is, and where it was.

    One row per holder. Creating the row and creating the repository
    happen together; neither is meaningful alone.

    ``head_commit`` is a cache of something the repository already knows,
    kept because reading it from the database is cheap and because the
    bucket backend would otherwise need to download a bundle to answer
    "has this moved". It is never authoritative: on any disagreement the
    repository wins, exactly as the directories win over the index.
    """

    __tablename__ = "passport"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)

    # One passport per person, enforced rather than assumed: a second row
    # would mean two records of the same career, each incomplete.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    #: The commit the application last wrote. A cache, never the truth.
    head_commit: Mapped[str | None] = mapped_column(String(40), nullable=True)

    #: The bucket object generation, for compare-and-swap once the GCS
    #: backend lands. Null on the local backend, which asserts HEAD
    #: instead.
    storage_generation: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )

    __table_args__ = (
        CheckConstraint(
            "length(id) = 32",
            name="ck_passport_id_is_32_hex",
        ),
    )


class PassportSignOffRequest(Base):
    """An ask that somebody sign off a competency.

    Workflow, not a projection. The sign-off file is the record; this row
    exists because an assessor's inbox spans many passports and files
    cannot answer that query. It closes when the file is written.

    ``signoff_id`` is the folder name inside the repository, so a row can
    be joined back to the record it produced without the row ever holding
    the record's contents.

    **The assessor is named by email, not by account.** Everything the
    row must know is known when the holder asks: the passport, the
    competency, the address the request went to, and its state. None of
    them is null at any point. ``assessor_user_id`` is the exception and
    means something different — who signed — so it is null for exactly
    as long as ``status`` says nobody has.
    """

    __tablename__ = "passport_signoff_request"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    passport_id: Mapped[str] = mapped_column(
        ForeignKey("passport.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    #: The sign-off folder name inside the repository.
    signoff_id: Mapped[str] = mapped_column(String(200), nullable=False)

    #: A competency id from shared/competency-definitions/. Deliberately
    #: a plain string with no foreign key: the catalogue is YAML, and a
    #: retired competency must stay readable on records that reference it.
    competency_id: Mapped[str] = mapped_column(String(100), nullable=False)

    #: Who was asked, as the holder named them. An email address rather
    #: than a user id because that is what a holder knows at the moment
    #: of asking: the assessor observing a registrar may have no Quill
    #: account, and requiring one first is what made this feature
    #: unreachable for the case it exists to serve. Matching it to a
    #: ``users`` row is a lookup, never a precondition.
    assessor_email: Mapped[str] = mapped_column(
        String(255), nullable=False, server_default=""
    )

    #: Who signed, set from the authenticated signer at the moment of
    #: signing. Null means nobody has yet — the same thing
    #: ``accepted_at`` records on an invite — not that the assessor is
    #: unknown, which ``assessor_email`` always answers. Never copied
    #: from the request, so it names whoever truly signed rather than
    #: whoever was expected to.
    assessor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="open"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        # One request per sign-off folder. A second row for the same
        # folder would put two entries in an inbox for one act.
        UniqueConstraint(
            "passport_id",
            "signoff_id",
            name="uq_passport_signoff_request_folder",
        ),
        # The inbox query: an assessor's open requests, found by the
        # address they were asked at rather than by account. An assessor
        # invited before they had a Quill account must see the request
        # that brought them here, and their user id did not exist when
        # it was written. Indexed together because that is how it is
        # read, and it is read on every page load for anyone who
        # assesses.
        Index(
            "ix_passport_signoff_request_inbox",
            "assessor_email",
            "status",
        ),
    )


class PassportAssessorInvite(Base):
    """An invitation asking somebody outside to sign a competency off.

    Workflow, like the request above, and for the same reason: bringing
    an assessor in spans accounts that may not exist yet, which no
    repository can record. Nothing here is part of the passport — the
    sign-off the assessor eventually makes is a file, and this row is
    only how they were reached.

    **This row, not the token, is what makes an invite single-use.** A
    JWT carries no record of having been spent, so
    ``create_passport_invite_token`` in ``security.py`` can only make one
    that expires. ``accepted_at`` is the check: the accept endpoint must
    refuse a row already carrying one.

    The declared registration is the assessor's own claim at the moment
    of inviting, stored because the sign-off has to say who signed and
    on what standing. Quill has not checked it here and the record says
    so elsewhere; verification is an administrator's act, later.
    """

    __tablename__ = "passport_assessor_invite"

    #: A uuid4 string, matching what the invite token carries as its
    #: ``invite_id``. The token names the invitation rather than the
    #: passport, so that a token can be spent once against this row
    #: instead of replayed against a passport.
    id: Mapped[str] = mapped_column(String(36), primary_key=True)

    passport_id: Mapped[str] = mapped_column(
        ForeignKey("passport.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    invited_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    #: Who it was sent to, and who may redeem it. Checked on acceptance
    #: against the token's own copy, so a forwarded link cannot be
    #: redeemed by whoever happened to receive it.
    email: Mapped[str] = mapped_column(String(255), nullable=False)

    #: The assessor's name as the holder gave it, for the email and for
    #: the invitation list. The name on the eventual sign-off comes from
    #: the account, not from here.
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    #: Self-declared at invite: "GMC", "NMC", "HCPC" and so on, with the
    #: number alongside. A plain string rather than an enumeration —
    #: the registers a visiting assessor might hold are not Quill's list
    #: to close, and refusing an unfamiliar one would block a legitimate
    #: sign-off.
    registration_authority: Mapped[str] = mapped_column(
        String(50), nullable=False
    )

    registration_number: Mapped[str] = mapped_column(
        String(50), nullable=False
    )

    #: What the assessor was asked to sign off, so the accept page can
    #: name it. Nullable because an invitation can precede a request: a
    #: holder may bring somebody in first and choose the competency
    #: afterwards, and invitations written before this column existed
    #: carry nothing.
    #:
    #: **It is not what they may sign.** That is still resolved from the
    #: request rows naming them, which is what an assessor's reach has
    #: always come from. This is the page's greeting, and nothing reads
    #: it to decide access.
    competency_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )

    #: A hash of the token, never the token itself. What is emailed is a
    #: credential, and a readable copy in the database would let anyone
    #: with a row redeem the invitation.
    token_hash: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    #: When the token stops working. Stored as well as signed into the
    #: token so that an invitation list can show it without decoding,
    #: and so expiry survives a key rotation that would make every
    #: outstanding token undecodable.
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    #: Set when the invite is consumed, and the reason it is single-use.
    #: Null means outstanding.
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    #: Who accepted, which may be a brand new account or one that
    #: already existed. Null until then, and null forever if the
    #: invitation lapses.
    accepted_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )


class AssessorRegistrationVerification(Base):
    """That somebody checked an assessor's registration against a register.

    **A row is the act, not a flag on a person.** ``Registration`` in the
    record model refuses ``verified`` without ``verified_by`` and
    ``verified_on``, because a bare flag asserts that a check happened
    while recording nothing about who did it or when — which is the part
    a later reader needs. The same reasoning applies here, so this is a
    row per check rather than a boolean on ``users``.

    **Per authority and number, not per person.** Somebody may hold a GMC
    and an NMC registration, and an admin who checked one has not checked
    the other. Verifying "the assessor" rather than a specific number
    would claim more than was done.

    **It records what was true when checked, and never expires itself.**
    A registration that later lapses does not make the check dishonest —
    it was accurate on the day. Acting on expiry is deferred in the plan,
    and would arrive as a separate reading of these rows rather than by
    mutating them.

    **Sign-offs already written are untouched.** The flag applies to
    sign-offs signed after the check, because a sign-off is a snapshot of
    what was known at the moment of signing. Revoking an assessor later
    leaves both the sign-offs and these rows standing.
    """

    __tablename__ = "passport_assessor_registration_verification"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    #: Whose registration was checked.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    #: The register consulted — "GMC", "NMC", "HCPC". A plain string for
    #: the same reason the invite's is: the registers a visiting assessor
    #: might hold are not Quill's list to close.
    registration_authority: Mapped[str] = mapped_column(
        String(50), nullable=False
    )

    #: The number as it stood when checked. Stored rather than read from
    #: the user's profile at render time, so that editing a number later
    #: cannot silently inherit a verification of a different one.
    registration_number: Mapped[str] = mapped_column(
        String(50), nullable=False
    )

    #: The admin who checked. RESTRICT rather than CASCADE: deleting an
    #: administrator must not erase the record of what they confirmed.
    verified_by_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )

    #: Whose admin checked it, so a reader can tell whose assurance this
    #: is. Two trusts may each check the same number, and one may be more
    #: diligent than the other.
    org_unit_id: Mapped[int] = mapped_column(
        ForeignKey("org_unit.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    verified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        # One standing check per number per organisation. A second would
        # make "is this verified" ambiguous, and re-checking is an update
        # of when it was last confirmed rather than a new fact.
        UniqueConstraint(
            "user_id",
            "registration_authority",
            "registration_number",
            "org_unit_id",
            name="uq_assessor_registration_verified_at_place",
        ),
    )


class SiteCommonCompetency(Base):
    """A competency an admin has put near the top of the picker.

    Interface furniture, and nothing more. It never gates anything: the
    picker shows these first and a full search beneath reaches every
    competency in the catalogue, so a shortlist can suggest without
    quietly becoming a syllabus. Nothing reads this table when deciding
    what a person may do or be signed off for.

    It lives outside the passport for the same reason: an exported record
    must not carry one trust's opinion of what matters into another.

    **One place column, not a pair.** This carried ``site_id`` and
    ``organisation_id`` with a check constraint saying exactly one was
    set — a ward list, with the trust's as a fallback. A trust is a
    place now, so the two collapse: the fallback is the parent's row in
    the same tree, and "exactly one" is what a single column says by
    existing.
    """

    __tablename__ = "site_common_competency"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    #: Whose shortlist this is — a ward, or an organisation's own row in
    #: the tree for a list that covers the whole trust.
    org_unit_id: Mapped[int] = mapped_column(
        ForeignKey("org_unit.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    competency_id: Mapped[str] = mapped_column(String(100), nullable=False)

    #: Where it sits in the list. An integer rather than an implicit
    #: ordering, so an admin can put the three things their centre
    #: actually does at the top.
    position: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )

    __table_args__ = (
        UniqueConstraint(
            "org_unit_id",
            "competency_id",
            name="uq_site_common_competency_place",
        ),
    )


class PassportWriteEntitlement(Base):
    """Until when somebody may add to their own passport.

    ``passport_write`` is sold, so unlike every other competency it ends.
    A competency is a string in a JSON list with nowhere to put a date,
    which is why this is a table rather than a flag: the warning has to
    name the day, and a boolean cannot say when.

    **This never gates reading.** A passport is somebody's professional
    record, and reading, rendering and exporting it are derived from
    owning it rather than from paying. An entitlement that has run out
    takes away the ability to add to the record and nothing else.

    **One row per source, not one per person.** Somebody may hold the
    entitlement from their organisation and from a subscription of their
    own at the same time, and losing one must not end the other. The
    question the gate asks is whether *any* row is still current, so the
    two come apart exactly as they should when somebody leaves a trust
    they were covered by.

    Rows are kept after they expire. What somebody was entitled to do,
    and until when, is what an audit trail needs in order to explain a
    write that happened last year.
    """

    __tablename__ = "passport_write_entitlement"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    #: Where the entitlement came from. ``organisation`` is granted at
    #: onboarding by a body that pays; ``individual`` is bought by the
    #: person. Nothing in the gate cares which, and both are recorded
    #: because renewing one is a different conversation from the other.
    source: Mapped[str] = mapped_column(String(20), nullable=False)

    #: The organisation that pays, where one does. Null for an
    #: individual subscription, which belongs to nobody but the person.
    org_unit_id: Mapped[int | None] = mapped_column(
        ForeignKey("org_unit.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    starts_on: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    #: The day it runs out. Not nullable: an entitlement without an end
    #: is one nobody ever has to renew, and the warning could not name a
    #: date. A long-running arrangement is a far-off date, not an absent
    #: one.
    ends_on: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        CheckConstraint(
            "source IN ('organisation', 'individual')",
            name="ck_passport_write_entitlement_source",
        ),
        CheckConstraint(
            "ends_on > starts_on",
            name="ck_passport_write_entitlement_ends_after_start",
        ),
        # The gate asks "has this person any row still current", so it
        # reads by user and date together on every write.
        Index(
            "ix_passport_write_entitlement_user_ends",
            "user_id",
            "ends_on",
        ),
    )

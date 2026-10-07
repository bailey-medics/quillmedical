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

- ``Passport`` – the pointer to one holder's repository.
- ``PassportSignOffRequest`` – an open ask, closed when resolved.
- ``PassportAssessorInvite`` – an outside assessor being brought in.
- ``PassportLogbookConfirmationRequest`` – an ask that a supervisor
  confirm one logbook entry, closed when answered.
- ``OrgUnitPassportFramework`` – one of an organisation's lead
  frameworks, which its people are offered first when choosing their own.

Until when somebody may add to their own passport is not a table here: it
is the ``ends_on`` of their ``passport_write`` row in ``user_competency``.
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
#: the states a *request* can reach – a file may also be ``superseded``,
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
    means something different – who signed – so it is null for exactly
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
    #: signing. Null means nobody has yet – the same thing
    #: ``accepted_at`` records on an invite – not that the assessor is
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


class PassportLogbookConfirmationRequest(Base):
    """An ask that a supervisor confirm one logbook entry.

    Workflow, as :class:`PassportSignOffRequest` is and for the same
    reason: a supervisor's inbox spans many passports, and no one
    repository can say what somebody has been asked to confirm. The
    entry is the record; this row is the ask, and it closes when the
    entry is confirmed or the supervisor says it is not theirs to.

    Its own table, though the shape is close to a sign-off request's.
    That one names a sign-off folder in a column that is never null, and
    a logbook entry has no such folder: it is named by its competency
    and its file.

    One row per entry. Asking again, of the same supervisor or another,
    reopens it, so an entry never has two people asked at once.
    """

    __tablename__ = "passport_logbook_confirmation_request"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    passport_id: Mapped[str] = mapped_column(
        ForeignKey("passport.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    #: The competency the entry is filed under, which with ``entry_stem``
    #: is where the entry lives in the repository.
    competency_id: Mapped[str] = mapped_column(String(100), nullable=False)

    #: The entry's file name, without ``.yaml``.
    entry_stem: Mapped[str] = mapped_column(String(200), nullable=False)

    #: Who was asked, by the address the holder typed, as a sign-off
    #: request names its assessor.
    supervisor_email: Mapped[str] = mapped_column(String(255), nullable=False)

    #: Who answered. Null until somebody has.
    supervisor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    #: ``open``, ``confirmed`` or ``declined``.
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
        UniqueConstraint(
            "passport_id",
            "competency_id",
            "entry_stem",
            name="uq_passport_logbook_confirmation_request_entry",
        ),
        Index(
            "ix_passport_logbook_confirmation_request_inbox",
            "supervisor_email",
            "status",
        ),
    )


class PassportAssessorInvite(Base):
    """An invitation asking somebody outside to sign a competency off.

    Workflow, like the request above, and for the same reason: bringing
    an assessor in spans accounts that may not exist yet, which no
    repository can record. Nothing here is part of the passport – the
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

    # `name`, `registration_authority` and `registration_number` were
    # here, and were retired on 22 September. The holder gave an address
    # and nothing else, so all three were written as empty strings on
    # every invitation and read by nothing: the assessor states their
    # own name and registration when they accept, which is the more
    # trustworthy source and is what the sign-off records.

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


class OrgUnitPassportFramework(Base):
    """One of an organisation's lead frameworks, at its place in the order.

    An organisation names the frameworks its people are offered first
    when they choose their own, so an oncology department can put the
    frameworks its trainees work to at the top. It orders a list and
    nothing else: it hides no framework and chooses none for anybody.

    It replaced ``org_unit_passport_specialty``, the lead specialties an
    organisation named while a holder chose a specialty. Those rows
    named specialties, and no specialty is a framework, so nothing was
    carried across and that table was dropped. See Phases 7 and 12 of
    docs/docs/plans/2026-10-07-passport-registrar-portfolios-plan.md.
    """

    __tablename__ = "org_unit_passport_framework"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    org_unit_id: Mapped[int] = mapped_column(
        ForeignKey("org_unit.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    #: A file name in shared/competency-definitions/, without ``.yaml``,
    #: of a file that declares a framework. A plain string with no
    #: foreign key, as on a profile: frameworks are YAML files and not a
    #: table, and a row naming one since withdrawn is skipped on read.
    framework_id: Mapped[str] = mapped_column(String(100), nullable=False)

    #: Where it comes in the organisation's list, counting from one.
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    #: Who set it. Null once that account is deleted.
    set_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    set_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        UniqueConstraint(
            "org_unit_id",
            "framework_id",
            name="uq_org_unit_passport_framework_unit_framework",
        ),
        UniqueConstraint(
            "org_unit_id",
            "position",
            name="uq_org_unit_passport_framework_unit_position",
        ),
        CheckConstraint(
            "position >= 1",
            name="ck_org_unit_passport_framework_position",
        ),
    )


#: How long a ``passport_write`` subscription somebody buys for themselves
#: runs for. Read by ``TERMS`` in ``app.cbac.grants``. A grant through a
#: site or organisation has no end.
#:
#: A year, because that is the shape of an individual subscription and
#: because a renewal somebody has to think about once a year is the point
#: of having an end date at all.
PASSPORT_ENTITLEMENT_DAYS = 365

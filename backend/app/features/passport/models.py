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
- ``SiteCommonCompetency`` — an admin-curated shortlist for the picker.
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

    assessor_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
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
        # The inbox query: an assessor's open requests. Indexed together
        # because that is how it is read, and it is read on every page
        # load for anyone who assesses.
        Index(
            "ix_passport_signoff_request_inbox",
            "assessor_user_id",
            "status",
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

    Exactly one of ``site_id`` and ``organisation_id`` is set — a site
    list with the organisation as fallback — enforced by a constraint
    rather than by convention, after the pattern
    ``practising_competency`` already uses for the same question.
    """

    __tablename__ = "site_common_competency"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    site_id: Mapped[int | None] = mapped_column(
        ForeignKey("sites.id", ondelete="CASCADE"), nullable=True, index=True
    )

    organisation_id: Mapped[int | None] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=True,
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
        CheckConstraint(
            "(site_id IS NULL) <> (organisation_id IS NULL)",
            name="ck_site_common_competency_one_place",
        ),
        UniqueConstraint(
            "site_id",
            "competency_id",
            name="uq_site_common_competency_site",
        ),
        UniqueConstraint(
            "organisation_id",
            "competency_id",
            name="uq_site_common_competency_org",
        ),
    )

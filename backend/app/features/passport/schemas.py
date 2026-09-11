"""The record model: what a passport file is allowed to contain.

Every file in a passport is validated against a model here, on the way
in *and* on the way out. Validating on read matters more than it looks:
a passport is a portable directory of YAML that someone may have edited
by hand, restored from a backup, or carried between deployments, and a
half-parsed clinical record is worse than one that refuses to load.

``extra="forbid"`` throughout, so an unrecognised field is an error
rather than silently dropped. A passport that round-trips through an
older version of this code must lose nothing quietly.

Two shapes run through the model and are worth naming up front.

**The human label travels beside every identifier.** A sign-off stores
``competency.id`` *and* ``competency.name``, the level's id *and* its
wording. The id stays authoritative and the label is a convenience copy,
but the copy is what makes a record read years later when a definition
has moved on. Where they disagree, the id wins.

**Trust is recorded, never inferred.** A registration is `declared`
until somebody checks a register, and the model says so with an explicit
flag rather than by omission. The same applies to `meaning`: what kind
of act a sign-off was is recorded, because "directly observed" and
"reviewed evidence" are clinically different and a record that does not
distinguish them is weaker than it looks.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

#: The current schema version written into every new passport. Bumped
#: only when a change would stop an older reader from understanding a
#: file — adding an optional field does not qualify.
SCHEMA_VERSION = 1

#: What a sign-off can be. ``requested`` exists because the record is
#: written when the holder asks, not when the assessor signs, so the
#: request itself is part of the history rather than a row that vanishes.
SignOffStatus = Literal["requested", "signed_off", "declined", "superseded"]

#: Why a later sign-off exists. Only ``correction`` supersedes anything:
#: conflating progression with correction would quietly imply an assessor
#: had got something wrong when they had not.
SignOffKind = Literal["initial", "progression", "reassessment", "correction"]

#: What the assessor actually did. Three clinically different acts, and a
#: record that does not say which one happened is weaker than it looks.
SignOffMeaning = Literal[
    "directly observed", "reviewed evidence", "countersigned"
]

#: Whether a logged procedure was supervised. Recorded from the holder's
#: point of view; nobody countersigns a logbook entry.
Supervision = Literal["supervised", "independent"]

#: What a CPD activity was. Open-ended enough to cover what people
#: actually claim, closed enough to tally by type.
CpdActivityType = Literal[
    "conference", "grand round", "teaching day", "course", "other"
]

_SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")
_COMPETENCY_ID = re.compile(r"^[a-z0-9]+(?:_[a-z0-9]+)*$")

#: Free text that must actually contain something. A field that accepts
#: "" is a field that silently records nothing.
NonEmptyText = Annotated[str, Field(min_length=1)]

CompetencyIdField = Annotated[str, Field(pattern=_COMPETENCY_ID.pattern)]


class PassportModel(BaseModel):
    """Base for every passport record.

    Forbids unknown fields, so a file written by a newer version fails
    loudly here rather than losing data silently on the next write.
    """

    model_config = ConfigDict(extra="forbid")


class Attachment(PassportModel):
    """One piece of evidence, named by its hash.

    The hash is the only pointer: ``sha256:ab12cd34…`` resolves to
    ``files/sha256/ab/12/ab12cd34…``, so no path is stored anywhere and
    nothing can drift out of step. The original filename is kept as data
    because it is often the only clue what a scan is, but it is never
    used to locate the bytes — a filename carrying a patient identifier
    must never reach a URL or a directory entry.
    """

    hash: str = Field(pattern=_SHA256.pattern)
    filename: NonEmptyText
    size_bytes: int = Field(ge=0)
    media_type: NonEmptyText


class Registration(PassportModel):
    """A professional registration, as declared.

    Quill checks no register. ``verified`` is false until an
    organisation admin has checked by hand, and the record says so
    rather than implying otherwise — a printed passport that showed an
    unchecked number as confirmed would be the false certainty this
    design exists to avoid.
    """

    body: NonEmptyText
    number: NonEmptyText
    verified: bool = False
    verified_by: str | None = None
    verified_on: date | None = None

    @model_validator(mode="after")
    def _verification_names_who_and_when(self) -> Registration:
        """A verified registration must say who checked it, and when.

        Otherwise the flag asserts that somebody looked at a register
        while recording nothing about who or when — which is the part
        that makes it worth anything to a later reader. Refusing the
        half-filled form here is what keeps ``verified`` meaningful.

        Raises:
            ValueError: If verified is set without both fields, or if
                either field is set without verified.
        """
        if self.verified and (
            self.verified_by is None or self.verified_on is None
        ):
            raise ValueError(
                "A verified registration must name verified_by and "
                "verified_on: a flag on its own records that somebody "
                "checked without saying who or when."
            )

        if not self.verified and (
            self.verified_by is not None or self.verified_on is not None
        ):
            raise ValueError(
                "verified_by and verified_on are only meaningful with "
                "verified set: a check that did not confirm anything "
                "should not look like one that did."
            )

        return self


class CompetencyRef(PassportModel):
    """A competency, by id and by the words that were shown.

    Both, always. The id is what everything references and what survives
    a rename; the name is what makes the record intelligible when the
    definition has since changed or the reader has no access to Quill.
    """

    id: CompetencyIdField
    name: NonEmptyText


class LevelRef(PassportModel):
    """One step on a competency's scale, as it read at the time.

    The wording is copied from the framework — the RCR entrustment
    scale, the UK SACT Board's levels — so a sign-off means what the
    framework said it meant on the day, even if the scale later gains a
    step.
    """

    id: NonEmptyText
    name: NonEmptyText


class Assessor(PassportModel):
    """Who signed, frozen as they were at the moment of signing.

    Deliberately a snapshot rather than a reference to a user row. An
    assessor's role changes, their registrations lapse, they leave; none
    of that may rewrite what a record said when it was signed. The
    registrations contribute to the content hash for the same reason —
    professional standing cannot be quietly edited afterwards.
    """

    user_id: NonEmptyText
    name: NonEmptyText
    role: NonEmptyText
    registrations: list[Registration] = Field(default_factory=list)
    registration_verified: bool = False
    care_location: str | None = None


class Manifest(PassportModel):
    """What this passport *is*, as distinct from what it contains.

    Anyone opening a passport years from now reads this first, to know
    what they are holding. ``passport_id`` matters more than it looks:
    without it the identifier exists only in the directory path, so a
    copied or renamed folder would lose it.

    There is deliberately no jurisdiction here. A passport belongs to a
    person and a person may practise in more than one country, so
    pinning the record to one would split a career that is not split.
    """

    passport_id: str = Field(pattern=r"^[0-9a-f]{32}$")
    schema_version: int = Field(ge=1)
    created_by: NonEmptyText
    created_at: date


class Profile(PassportModel):
    """Who the passport belongs to.

    Regenerated whenever the holder's details change rather than frozen
    at creation, because it is the *current* answer to "whose is this".
    The one place the passport says so, which is why no record repeats
    it — copying a name into every record would leave dozens of stale
    ones behind the first time somebody marries.
    """

    user_id: NonEmptyText
    name: NonEmptyText
    registrations: list[Registration] = Field(default_factory=list)


class EvidenceSnapshot(PassportModel):
    """What was in front of the assessor when they decided.

    Not a threshold that was met — the passport never judges sufficiency
    — but a record of what the evidence looked like at that moment. This
    is the part that matters if a sign-off is ever questioned.
    """

    logbook_entries: int = Field(ge=0)
    logbook_digest: str | None = Field(default=None, pattern=_SHA256.pattern)
    certificates: list[str] = Field(default_factory=list)


class SignOff(PassportModel):
    """The record itself, and the thing that is signed.

    Immutable once signed. A mistake is corrected by superseding it with
    a new record, never by editing this one: the earlier file is a named
    person's attestation that something was true at the time, and
    overwriting it would destroy that statement and change the hash
    covering it.
    """

    id: NonEmptyText
    competency: CompetencyRef
    kind: SignOffKind
    status: SignOffStatus
    level: LevelRef | None = None
    observed_on: date
    signed_at: datetime | None = None
    expires_on: date | None = None
    signed_off_by: Assessor | None = None
    meaning: SignOffMeaning | None = None
    comments: str | None = None
    corrects: str | None = None
    evidence: EvidenceSnapshot | None = None
    attachments: list[Attachment] = Field(default_factory=list)
    content_hash: str | None = Field(default=None, pattern=_SHA256.pattern)

    @field_validator("signed_at")
    @classmethod
    def _signed_at_must_be_aware(
        cls, value: datetime | None
    ) -> datetime | None:
        """Refuse a naive timestamp on the moment of signing.

        The three clocks a sign-off carries are kept apart deliberately,
        and a naive one cannot be compared with the others. Guessing a
        timezone is how a sign-off ends up an hour out with nothing on
        the record to show it.
        """
        if value is not None and value.tzinfo is None:
            raise ValueError(
                "signed_at must be timezone-aware, so it can be compared "
                "with observed_on and the commit time without guessing."
            )
        return value

    @model_validator(mode="after")
    def _only_a_correction_corrects(self) -> SignOff:
        """``corrects`` belongs to a correction and nothing else.

        Progression and reassessment supersede nothing: the earlier
        record stays correct and valid, and the holder simply moved on or
        was confirmed again. Letting either set ``corrects`` would
        quietly imply an assessor had got something wrong when they had
        not — which is a statement about a named person, made by a field
        default.

        Raises:
            ValueError: If a non-correction names a record it corrects,
                or a correction names none.
        """
        if self.kind == "correction" and self.corrects is None:
            raise ValueError(
                "A correction must name the sign-off it corrects; "
                "otherwise nothing records what was wrong."
            )

        if self.kind != "correction" and self.corrects is not None:
            raise ValueError(
                f"kind {self.kind!r} must not set corrects: only a "
                "correction supersedes an earlier sign-off, and implying "
                "otherwise misrepresents the earlier assessor."
            )

        return self

    @model_validator(mode="after")
    def _a_signed_record_says_who_signed_it(self) -> SignOff:
        """A signed-off record must carry its assessor and its meaning.

        The whole value of the record is a second named person accepting
        accountability, so a ``signed_off`` status with nobody attached
        is the one state that must not be representable. ``meaning`` is
        required with it because "directly observed" and "reviewed
        evidence" are clinically different acts.

        Raises:
            ValueError: If the status says signed but the record does not
                say by whom, when, or on what basis.
        """
        if self.status != "signed_off":
            return self

        missing = [
            name
            for name, value in (
                ("signed_off_by", self.signed_off_by),
                ("signed_at", self.signed_at),
                ("meaning", self.meaning),
            )
            if value is None
        ]

        if missing:
            raise ValueError(
                "A signed-off sign-off must record "
                + ", ".join(missing)
                + ": a record that says it was signed without saying by "
                "whom, when, or on what basis asserts more than it holds."
            )

        return self


class Certificate(PassportModel):
    """A course, qualification or award the holder is claiming.

    Self-declared: nobody countersigns it, which is the whole difference
    between this and a sign-off. It may relate to several competencies
    at once, which is why certificates are filed flat rather than under
    a competency.
    """

    id: NonEmptyText
    title: NonEmptyText
    issuer: NonEmptyText
    awarded_on: date
    expires_on: date | None = None
    competencies: list[CompetencyRef] = Field(default_factory=list)
    description: str | None = None
    attachments: list[Attachment] = Field(default_factory=list)


class LogbookEntry(PassportModel):
    """One procedure, as the holder recorded it.

    Self-declared and editable, because a mistyped date should be
    fixable in seconds. ``performed_on`` has no time: nobody recalls
    whether a procedure was at 09:30 or 11:00 when they log five of them
    on a Friday evening.

    May name further competencies it also counts towards, so an unusual
    case need not be duplicated.
    """

    performed_on: date
    setting: str | None = None
    supervision: Supervision | None = None
    supervisor: str | None = None
    indication: str | None = None
    outcome: str | None = None
    notes: str | None = None
    also_counts_towards: list[CompetencyIdField] = Field(default_factory=list)
    attachments: list[Attachment] = Field(default_factory=list)


class Reflection(PassportModel):
    """The frontmatter of a reflection; the prose is the file body.

    Holder-only, and not readable by an assessor or an organisation
    admin. Written reflection can be disclosed in legal proceedings and
    UK doctors are wary of it for good reason, so the narrower default
    is the safer one.
    """

    title: NonEmptyText
    written_on: date
    competencies: list[CompetencyRef] = Field(default_factory=list)
    attachments: list[Attachment] = Field(default_factory=list)


class CpdEntry(PassportModel):
    """One continuing professional development activity.

    Grouped by year on disk, because UK appraisal runs annually and asks
    what you did this year.
    """

    activity_on: date
    title: NonEmptyText
    activity_type: CpdActivityType
    hours: float | None = Field(default=None, ge=0)
    competencies: list[CompetencyRef] = Field(default_factory=list)
    certificate: str | None = None
    notes: str | None = None
    attachments: list[Attachment] = Field(default_factory=list)


class IndexEntry(PassportModel):
    """One competency's state, in the derived index.

    Regenerated on every write and never hand-edited. If it disagrees
    with the directories beneath, they win and it is rebuilt.

    Carries counts and never comparisons: ``logbook_entries: 38`` and no
    target, no percentage, no ready-or-not. How many is enough is a
    judgement belonging to the assessor, and a system that appears to
    have decided first invites them to defer to it.
    """

    id: CompetencyIdField
    name: NonEmptyText
    status: SignOffStatus
    level: LevelRef | None = None
    signed_on: date | None = None
    signed_off_by: str | None = None
    expires_on: date | None = None
    sign_off: str | None = None
    previous_sign_offs: list[str] = Field(default_factory=list)
    logbook_entries: int = Field(default=0, ge=0)
    certificates: list[str] = Field(default_factory=list)


class Index(PassportModel):
    """The whole derived index: one entry per competency with evidence."""

    schema_version: int = Field(ge=1)
    generated_at: datetime
    competencies: list[IndexEntry] = Field(default_factory=list)

    @field_validator("generated_at")
    @classmethod
    def _generated_at_must_be_aware(cls, value: datetime) -> datetime:
        """An index timestamp without a zone cannot be compared."""
        if value.tzinfo is None:
            raise ValueError("generated_at must be timezone-aware.")
        return value

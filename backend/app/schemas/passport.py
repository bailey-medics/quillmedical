# backend/app/schemas/passport.py
"""Pydantic request and response schemas for the passport API.

Deliberately separate from ``app.features.passport.schemas``, which
models what a passport *file* contains. These model what crosses the
wire. They look similar today and will diverge, because the two answer
to different rules:

**The file model is the storage contract.** It is validated on read as
well as write, because a passport is a portable directory somebody may
have hand-edited or restored from a backup.

**These are the API contract**, held to ``.claude/rules/backend.md``:
additive only, so removing or retyping a field needs the expand-contract
two-deploy pattern. If the routes returned the file models directly,
every change to the on-disk format would become a breaking API change,
and the storage layer could never be refactored without a release cycle.

Two shapes carry through from the record model and are load-bearing
here too.

**The human label travels beside every identifier.** A competency is
returned as id *and* name, a level as id *and* wording, so a client
renders a passport without holding the catalogue.

**Counts, never comparisons.** The index reports how many logbook
entries a competency has and never a target, a percentage or a
ready-or-not verdict. How many is enough is a judgement belonging to the
assessor; a response that appeared to have decided first would invite
them to defer to it.
"""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.features.passport.schemas import (
    CompetencyIdField,
    CpdActivityType,
    NonEmptyText,
    SignOffKind,
    SignOffMeaning,
    SignOffStatus,
    Supervision,
)

# The enums are imported rather than restated. They are the same closed
# vocabularies in both places, and a second copy would drift: a new CPD
# activity type added to the record model and forgotten here would be
# accepted on disk and refused at the door, or the reverse.


class _In(BaseModel):
    """Base for request bodies.

    ``extra="forbid"`` so an unrecognised field is refused rather than
    ignored. A client sending ``competancy_id`` should be told, not
    silently have the field dropped and the request half-applied.
    """  # cspell:ignore competancy

    model_config = ConfigDict(extra="forbid")


# --------------------------------------------------------------------
# Shared pieces
# --------------------------------------------------------------------


class CompetencyRefOut(BaseModel):
    """A competency, by id and by the words shown at the time."""

    id: CompetencyIdField
    name: NonEmptyText


class LevelRefOut(BaseModel):
    """One step on a competency's scale, as it read at the time."""

    id: NonEmptyText
    name: NonEmptyText


class LevelOptionOut(BaseModel):
    """A level a competency offers, for populating a form.

    ``position`` is the order the framework lists them in, which is
    where a scale's ordering belongs — never a number stored on a
    record, which would be wrong the moment a scale gained a step.
    """

    id: NonEmptyText
    name: NonEmptyText
    position: int = Field(ge=0)


class RegistrationOut(BaseModel):
    """A professional registration, as declared.

    ``verified`` is false until an organisation admin has checked a
    register by hand. Quill checks none itself, and the response says so
    rather than implying otherwise.
    """

    body: NonEmptyText
    number: NonEmptyText
    verified: bool = False
    verified_by: str | None = None
    verified_on: date | None = None


class AttachmentOut(BaseModel):
    """One piece of evidence, named by the hash of its own bytes.

    The hash is the only pointer. The original filename is data, never a
    path: a filename carrying a patient identifier must not reach a URL.
    """

    hash: str
    filename: NonEmptyText
    size_bytes: int = Field(ge=0)
    media_type: NonEmptyText


class AssessorOut(BaseModel):
    """Who signed, frozen as they were at the moment of signing.

    A snapshot rather than a live reference: an assessor's role changes
    and their registrations lapse, and none of that may rewrite what a
    record said when it was signed.
    """

    user_id: NonEmptyText
    name: NonEmptyText
    role: NonEmptyText
    registrations: list[RegistrationOut] = Field(default_factory=list)
    registration_verified: bool = False
    care_location: str | None = None


class EvidenceSnapshotOut(BaseModel):
    """What was in front of the assessor when they decided.

    Not a threshold that was met — the passport never judges sufficiency
    — but a record of what the evidence looked like at that moment.
    """

    logbook_entries: int = Field(ge=0)
    logbook_digest: str | None = None
    certificates: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------
# Passport
# --------------------------------------------------------------------


class PassportOut(BaseModel):
    """A passport's identity and whose it is."""

    passport_id: str
    holder_user_id: NonEmptyText
    holder_name: NonEmptyText
    registrations: list[RegistrationOut] = Field(default_factory=list)
    created_at: date
    head_commit: str | None = None


class CompetencyStateOut(BaseModel):
    """One competency's state, from the derived index.

    Carries counts and never comparisons. ``expires_on`` is reported and
    nothing acts on it: what a lapsed sign-off implies is a clinical
    decision that has not been made, so the date is there to be read by
    somebody who can judge it.
    """

    id: CompetencyIdField
    name: NonEmptyText
    status: SignOffStatus
    level: LevelRefOut | None = None
    signed_on: date | None = None
    signed_off_by: str | None = None
    expires_on: date | None = None
    sign_off: str | None = None
    previous_sign_offs: list[str] = Field(default_factory=list)
    logbook_entries: int = Field(default=0, ge=0)
    certificates: list[str] = Field(default_factory=list)


class PassportDetailOut(BaseModel):
    """A passport with every competency it holds evidence for."""

    passport: PassportOut
    competencies: list[CompetencyStateOut] = Field(default_factory=list)


# --------------------------------------------------------------------
# Sign-offs
# --------------------------------------------------------------------


class SignOffOut(BaseModel):
    """One sign-off in full.

    ``kind`` is derived rather than chosen by a caller: letting one be
    picked would allow a progression to be recorded as a correction,
    quietly implying an earlier assessor had got something wrong.
    """

    name: NonEmptyText
    id: NonEmptyText
    competency: CompetencyRefOut
    kind: SignOffKind
    status: SignOffStatus
    level: LevelRefOut | None = None
    observed_on: date
    signed_at: datetime | None = None
    expires_on: date | None = None
    signed_off_by: AssessorOut | None = None
    meaning: SignOffMeaning | None = None
    comments: str | None = None
    corrects: str | None = None
    evidence: EvidenceSnapshotOut | None = None
    attachments: list[AttachmentOut] = Field(default_factory=list)
    content_hash: str | None = None


class SignOffRequestIn(_In):
    """The holder asking for a sign-off.

    ``assessor_user_id`` names who is being asked. The holder chooses,
    because the judgement about who is appropriate belongs to them and
    their supervisor. The one rule the API enforces is that it may not
    be the holder themselves.
    """

    assessor_user_id: int
    observed_on: date
    level_id: str | None = None
    comments: str | None = None
    reflection: str | None = None
    attachment_hashes: list[str] = Field(default_factory=list)


class SignOffIn(_In):
    """The assessor signing.

    ``declaration_confirmed`` must be true. It is what makes signing a
    deliberate act rather than a click — the software equivalent of
    reading a statement and putting your name to it — so the route
    refuses without it and writes nothing.
    """

    meaning: SignOffMeaning
    declaration_confirmed: bool
    level_id: str | None = None
    comments: str | None = None
    assessment: str | None = None


class SignOffDeclineIn(_In):
    """The assessor declining, with a reason.

    A decline is recorded like anything else. A record that only showed
    successes would be worth less to everyone reading it.
    """

    reason: NonEmptyText


class SignOffResultOut(BaseModel):
    """What a write to a sign-off produced."""

    name: NonEmptyText
    status: SignOffStatus
    commit: NonEmptyText


class VerificationOut(BaseModel):
    """Whether a sign-off still matches its own fingerprint.

    ``proves`` and ``does_not_prove`` are returned as text because the
    limits matter as much as the result: a match shows the record has
    not changed since it was written. It does not prove a professional
    registration, and it proves nothing to a reader who distrusts Quill,
    since the same system computed and stored the hash.
    """

    name: NonEmptyText
    unchanged: bool
    content_hash: str | None = None
    recomputed_hash: str | None = None
    proves: str
    does_not_prove: str


# --------------------------------------------------------------------
# Self-declared evidence
# --------------------------------------------------------------------


class CertificateIn(_In):
    """A course, qualification or award the holder is claiming.

    Self-declared: nobody countersigns it, which is the whole difference
    between this and a sign-off.
    """

    title: NonEmptyText
    issuer: NonEmptyText
    awarded_on: date
    expires_on: date | None = None
    competencies: list[CompetencyIdField] = Field(default_factory=list)
    description: str | None = None
    attachment_hashes: list[str] = Field(default_factory=list)


class CertificateOut(BaseModel):
    """A certificate as stored."""

    name: NonEmptyText
    id: NonEmptyText
    title: NonEmptyText
    issuer: NonEmptyText
    awarded_on: date
    expires_on: date | None = None
    competencies: list[CompetencyRefOut] = Field(default_factory=list)
    description: str | None = None
    attachments: list[AttachmentOut] = Field(default_factory=list)


class LogbookEntryIn(_In):
    """One procedure, as the holder recorded it.

    ``performed_on`` carries no time: nobody recalls whether a procedure
    was at 09:30 or 11:00 when logging five on a Friday evening.
    """

    performed_on: date
    setting: str | None = None
    supervision: Supervision | None = None
    supervisor: str | None = None
    indication: str | None = None
    outcome: str | None = None
    notes: str | None = None
    also_counts_towards: list[CompetencyIdField] = Field(default_factory=list)
    attachment_hashes: list[str] = Field(default_factory=list)


class LogbookEntryOut(BaseModel):
    """A logbook entry as stored."""

    filename: NonEmptyText
    competency: CompetencyIdField
    performed_on: date
    setting: str | None = None
    supervision: Supervision | None = None
    supervisor: str | None = None
    indication: str | None = None
    outcome: str | None = None
    notes: str | None = None
    also_counts_towards: list[CompetencyIdField] = Field(default_factory=list)
    attachments: list[AttachmentOut] = Field(default_factory=list)


class LogbookOut(BaseModel):
    """A competency's logbook entries, and how many there are.

    A count and no target, deliberately. Two hundred bronchoscopies
    prove activity, not competence; the sign-off is what turns evidence
    into a conclusion, and the API must not appear to draw it.
    """

    competency: CompetencyIdField
    count: int = Field(ge=0)
    entries: list[LogbookEntryOut] = Field(default_factory=list)


class ReflectionIn(_In):
    """A reflection on a case, a complaint or a significant event.

    Holder-only, and excluded from every other reader including
    organisation admins. Written reflection can be disclosed in legal
    proceedings, so the narrower default is the safer one.

    ``anonymised_confirmed`` must be true: reflections are written about
    real cases and are one of only two places patient data could enter a
    passport.
    """

    title: NonEmptyText
    written_on: date
    body: NonEmptyText
    anonymised_confirmed: bool
    competencies: list[CompetencyIdField] = Field(default_factory=list)
    attachment_hashes: list[str] = Field(default_factory=list)


class ReflectionOut(BaseModel):
    """A reflection as stored, with its prose."""

    name: NonEmptyText
    title: NonEmptyText
    written_on: date
    body: str
    competencies: list[CompetencyRefOut] = Field(default_factory=list)
    attachments: list[AttachmentOut] = Field(default_factory=list)


class CpdEntryIn(_In):
    """One continuing professional development activity."""

    activity_on: date
    title: NonEmptyText
    activity_type: CpdActivityType
    hours: float | None = Field(default=None, ge=0)
    competencies: list[CompetencyIdField] = Field(default_factory=list)
    certificate: str | None = None
    notes: str | None = None
    attachment_hashes: list[str] = Field(default_factory=list)


class CpdEntryOut(BaseModel):
    """A CPD activity as stored."""

    filename: NonEmptyText
    year: int
    activity_on: date
    title: NonEmptyText
    activity_type: CpdActivityType
    hours: float | None = None
    competencies: list[CompetencyRefOut] = Field(default_factory=list)
    certificate: str | None = None
    notes: str | None = None
    attachments: list[AttachmentOut] = Field(default_factory=list)


class RecordResultOut(BaseModel):
    """What a write to a self-declared record produced.

    ``name`` identifies what was written, so a client can address it
    again without re-reading the whole passport.
    """

    name: NonEmptyText
    commit: NonEmptyText


# --------------------------------------------------------------------
# Evidence upload
# --------------------------------------------------------------------


class EvidenceUploadOut(BaseModel):
    """An uploaded file, addressed by the hash of its bytes.

    Returned so a client can name it in the record it is about to
    create. Uploading the same bytes twice yields the same hash and
    stores one copy, so an interrupted upload can simply be retried.
    """

    hash: str
    filename: NonEmptyText
    size_bytes: int = Field(ge=0)
    media_type: NonEmptyText


# --------------------------------------------------------------------
# Competency catalogue
# --------------------------------------------------------------------


class CompetencyOptionOut(BaseModel):
    """One competency a holder may request a sign-off for.

    ``commonly_used_here`` marks a site's curated shortlist. It suggests
    and never gates: every competency is reachable, nothing is hidden,
    and the wording matters as much as the behaviour — "required" would
    quietly turn a convenience list into a syllabus, which is the
    sufficiency judgement the passport refuses to make.
    """

    id: CompetencyIdField
    name: NonEmptyText
    levels: list[LevelOptionOut] = Field(default_factory=list)
    expires_after_months: int | None = None
    commonly_used_here: bool = False


class CompetencyCatalogueOut(BaseModel):
    """Every competency, shortlist first."""

    competencies: list[CompetencyOptionOut] = Field(default_factory=list)


class CommonCompetenciesIn(_In):
    """An admin curating a site's shortlist.

    Interface furniture only. Nothing reads it when deciding what a
    person may do or be signed off for.
    """

    competency_ids: list[CompetencyIdField] = Field(default_factory=list)


class CommonCompetenciesOut(BaseModel):
    """A site's curated shortlist, in the order an admin set."""

    site_id: int
    competency_ids: list[CompetencyIdField] = Field(default_factory=list)

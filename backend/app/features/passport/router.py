"""HTTP routes for the clinician passport.

The boundary between the web and the record. Everything below this line
is authorisation and translation; the writing itself belongs to
:mod:`.service` and :mod:`.records`, which know nothing about requests.

Four rules hold across every route here, and each is a decision the plan
argues for rather than a convention:

**Authorisation is resolved before storage is touched.** Every route
establishes the caller's relationship to the passport – holder, a named
assessor, or an admin of the holder's organisation – as a guard clause,
so no work runs against a passport the caller may not see. A passport id
also decides a filesystem path, so it is validated as 32 hex characters
before it reaches the store.

**Self-sign-off is refused, and it is the only eligibility rule.** Who is
fit to assess whom is a clinical judgement that varies by procedure,
department and the people involved; any rule table encoding it would be
wrong somewhere on the day it shipped. The record names its assessor,
their role and their registration, so a reader can judge for themselves.
What the API enforces is that a second named person was involved at all.

**Reflections are holder-only.** Not readable by an assessor, an
organisation admin, or anyone else. Written reflection can be disclosed
in legal proceedings and UK doctors are wary of it for good reason, so
the narrower default is the safer one.

**Nothing here judges sufficiency.** Counts are returned; targets,
percentages and ready-or-not verdicts are not. How many procedures is
enough belongs to the assessor, and an API that appeared to have decided
first would invite them to defer to it.

The lazy imports of ``get_current_user`` and ``require_csrf`` mirror
:mod:`app.features.teaching.router`: ``app.main`` imports this router, so
importing them at module scope would be circular.
"""

from __future__ import annotations

import hashlib
import logging
import re
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.cbac.competencies import get_competency_details
from app.config import settings
from app.db import get_core_db
from app.deps import has_competency
from app.email_send import (
    EmailNotAllowedError,
    EmailRateLimitError,
    send_email,
)
from app.features.gating import requires_feature, user_has_feature
from app.models import (
    OrgUnitFeature,
    ProfessionalRegistration,
    User,
    UserCompetency,
    normalise_email,
    org_unit_member,
)
from app.org_units.tree import descendant_ids
from app.organisations import (
    add_org_unit_member,
    feature_holder_ids_of,
    get_member_org_unit_ids,
    get_reachable_org_unit_ids,
    remove_org_unit_member,
)
from app.passport_storage import get_blob_store, get_passport_store
from app.registrations import REGISTRATION_AUTHORITIES, canonical_authority
from app.schemas.passport import (
    AppraisalPeriodOut,
    AppraisalPeriodsIn,
    AppraisalPeriodsOut,
    AssessorInviteAcceptIn,
    AssessorInviteAcceptOut,
    AssessorMatchOut,
    AssessorRevokeOut,
    AssessorSearchOut,
    AttachmentIn,
    CertificateIn,
    CertificateOut,
    CompetencyRefOut,
    CompetencyStateOut,
    CpdEntryIn,
    CpdEntryOut,
    EntitlementOut,
    EvidenceUploadOut,
    FrameworkChoiceOut,
    FrameworkOut,
    FrameworksIn,
    InboxItemOut,
    InvitePreviewOut,
    LogbookConfirmAnswerOut,
    LogbookConfirmationOut,
    LogbookConfirmIn,
    LogbookEntryIn,
    LogbookEntryOut,
    LogbookOut,
    PassportCreateIn,
    PassportDetailOut,
    PassportOut,
    RecordResultOut,
    ReflectionIn,
    ReflectionOut,
    RegistrationOut,
    SignOffDeclineIn,
    SignOffIn,
    SignOffOut,
    SignOffRequestIn,
    SignOffResultOut,
    SpecialtiesIn,
    SpecialtyChoiceOut,
    SpecialtyOut,
    VerificationOut,
    WholeLogbookOut,
)
from app.security import (
    PASSPORT_INVITE_TTL_DAYS,
    create_passport_invite_token,
    decode_passport_invite_token,
    hash_password,
)

from . import (
    definitions,
    email_templates,
    export,
    frameworks,
    hashing,
    ids,
    paths,
    pdf,
    reconcile,
    records,
    render,
    service,
    specialties,
)
from .blobs import (
    BlobConflictError,
    BlobError,
    BlobNotFoundError,
    BlobStore,
)
from .commits import Actor
from .entitlements import passport_write_ends_on
from .gcs_store import GcsBlobStore
from .models import (
    Passport,
    PassportAssessorInvite,
    PassportLogbookConfirmationRequest,
    PassportSignOffRequest,
)
from .schemas import (
    AppraisalPeriod,
    Assessor,
    Attachment,
    Certificate,
    CompetencyRef,
    CpdEntry,
    FrameworkRef,
    Index,
    LevelRef,
    LogbookEntry,
    Profile,
    Reflection,
    ScopeRef,
    SignOff,
    SpecialtyRef,
)
from .serialise import from_yaml, reflection_from_markdown
from .store import PassportNotFoundError, PassportStore

logger = logging.getLogger(__name__)

_FEATURE_GATE = requires_feature("passport")


def _feature_unless_reading_your_own(
    request: Request, db: Session = Depends(get_core_db)
) -> None:
    """The passport feature gate, waived for a holder reading their own.

    Reading and exporting a passport you hold come from owning it, never
    from paying, and not from where you work either. Somebody who belongs
    nowhere the passport is switched on, because they were removed from
    the org_unit that had it, must still be able to open their own record
    and take it with them.

    Waived only for a ``GET`` on the caller's own passport: ``/me``, and
    anything beneath a ``/{passport_id}`` they hold. Every write stays
    behind the gate, and so does reading anybody else's, the assessor
    inbox and the assessor search. The route's own checks still run
    afterwards, so this never widens who may read what.

    The passport id is taken from the path and never from the query, so
    it cannot be supplied to a route that has none.

    Raises:
        HTTPException: 403 as ``requires_feature`` raises it.
    """
    if request.method == "GET":
        user = _get_current_user(request, db)
        passport_id = request.path_params.get("passport_id")
        if passport_id is None:
            if request.url.path.endswith("/passport/me"):
                return
        elif _PASSPORT_ID.match(passport_id):
            owner = db.scalar(
                select(Passport.user_id).where(Passport.id == passport_id)
            )
            if owner == user.id:
                return
    _FEATURE_GATE(request, db)


passport_router = APIRouter(
    prefix="/passport",
    tags=["passport"],
    dependencies=[Depends(_feature_unless_reading_your_own)],
)

#: A passport id is 32 lower-case hex characters and decides a filesystem
#: path. Checked at the door as well as in ``paths.shard``, so a
#: malformed id is a 404 rather than an exception from the store.
_PASSPORT_ID = re.compile(r"^[0-9a-f]{32}$")

_DEP_SESSION = Depends(get_core_db)


def _get_current_user(request: Request, db: Session = _DEP_SESSION) -> User:
    """Resolve the authenticated user (lazy import, as teaching does)."""
    from app.main import get_current_user

    return get_current_user(request, db)


def _require_csrf(request: Request, db: Session = _DEP_SESSION) -> None:
    """Validate the CSRF token, lazily for the same reason."""
    from app.main import require_csrf

    require_csrf(request, _get_current_user(request, db))


_DEP_USER = Depends(_get_current_user)
_DEP_REQUIRE_CSRF = Depends(_require_csrf)
#: Reaching the passport feature at all.
#:
#: Free, granted by base profession, and never lapsing for payment, so
#: an assessor asked to sign off a colleague never meets a wall. Every
#: read carries it, and so do the writes that belong to an assessor
#: rather than to a holder: signing off, declining, and the admin
#: actions on an assessor's own standing.
_DEP_PASSPORT = Depends(has_competency("assess_clinician_passport"))

_DEP_STORE = Depends(get_passport_store)
_DEP_BLOBS = Depends(get_blob_store)

#: What evidence may be. Deliberately short: a scan, a photograph of a
#: logbook page, or a PDF of a course certificate is what this is for.
#: `blobs.py` decides none of this on purpose – storing is separate from
#: admitting – so the allow-list lives at the boundary that admits.
ALLOWED_EVIDENCE_TYPES: frozenset[str] = frozenset(
    {
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/heic",
        "image/webp",
    }
)

#: The most evidence may be, enforced by reading rather than by trusting
#: a header. `limit_request_body_size` in ``app.main`` applies
#: ``MAX_REQUEST_BODY_BYTES`` from ``Content-Length``, but skips the
#: check when the header is absent – so a chunked request would
#: otherwise be unbounded, and reading it whole would put it all in
#: memory.
#:
#: Deliberately below the middleware's ceiling. At the same 10 MB the
#: route's limit could never be reached: multipart framing adds the
#: boundaries, the headers and the filename on top of the file itself,
#: so a 10 MB file always makes an 11 MB body and dies at the
#: middleware with its plain-text refusal. The gap leaves room for that
#: overhead, so a file between the two is answered here, by the handler
#: that knows it is evidence.
MAX_EVIDENCE_BYTES = 8 * 1024 * 1024  # 8 MB

#: How much to read at a time while enforcing that ceiling.
_UPLOAD_CHUNK = 64 * 1024


def _looks_like(data: bytes, media_type: str) -> bool:
    """Whether the bytes begin the way *media_type* says they should.

    A caller sets ``Content-Type``, so the allow-list alone checks a
    claim rather than a file: anything at all can be uploaded as a PDF.
    This checks the magic bytes instead.

    Deliberately a short table rather than a dependency. Five formats,
    all with fixed signatures that have not changed in decades, and a
    library would be a supply-chain surface for something this small.
    It is a sanity check and not a parser: a well-formed header on
    malformed content still passes, which is the right depth here
    because nothing executes or serves these bytes by path – a blob is
    addressed by its own hash and handed back only as a download.
    """
    if media_type == "application/pdf":
        return data.startswith(b"%PDF-")

    if media_type == "image/png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")

    if media_type == "image/jpeg":
        return data.startswith(b"\xff\xd8\xff")

    if media_type == "image/webp":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"

    if media_type == "image/heic":
        # ISO base media format: a four-byte length, then `ftyp`, then a
        # brand. `heic` and `heix` are the still-image brands; `mif1`
        # appears on images written by some phones.
        return data[4:8] == b"ftyp" and data[8:12] in (
            b"heic",
            b"heix",
            b"mif1",
        )

    return False


def _actor(user: User) -> Actor:
    """Describe a user as the commit trailers will record them.

    The role is the base profession rather than a system permission:
    what a reader of the history wants to know is that a consultant
    signed, not that the account could manage users.
    """
    registrations = _registration_strings(user)

    return Actor(
        name=user.full_name or user.username,
        role=user.base_profession,
        email=user.email,
        registrations=tuple(registrations),
    )


def _registration_strings(user: User) -> list[str]:
    """Registrations as ``GMC 1234567`` strings for commit trailers.

    From the person's current ``professional_registration`` rows, which
    cannot hold a malformed registration the way the JSON they replaced
    could.
    """
    return [
        f"{row.authority} {row.number}" for row in user.current_registrations
    ]


def _registration_dicts(user: User) -> list[dict[str, object]]:
    """Registrations as the record model stores them.

    What was declared, and nothing more: Quill checks no register, so a
    sign-off records the number without implying anybody looked it up.
    """
    return [
        {"body": row.authority, "number": row.number}
        for row in user.current_registrations
    ]


def _checked_id(passport_id: str) -> str:
    """Refuse an id that is not 32 hex characters.

    A 404 rather than a 400: an id that cannot exist and one that does
    not exist should be indistinguishable to a caller who is guessing.
    """
    if not _PASSPORT_ID.fullmatch(passport_id):
        raise HTTPException(404, "Passport not found")

    return passport_id


def _passport_row(db: Session, passport_id: str) -> Passport:
    """The row for a passport, or 404."""
    row = db.get(Passport, _checked_id(passport_id))

    if row is None:
        raise HTTPException(404, "Passport not found")

    return row


def _is_named_assessor(
    db: Session, passport_id: str, user: User, signoff_id: str | None = None
) -> bool:
    """Whether this user has been asked to sign something here.

    An external assessor's whole reach is resolved from request rows
    naming them. They see the sign-offs they were asked about and
    nothing else: not the holder's full passport, not other holders.
    """
    query = select(PassportSignOffRequest.id).where(
        PassportSignOffRequest.passport_id == passport_id,
        func.lower(PassportSignOffRequest.assessor_email)
        == user.email.strip().lower(),
    )

    if signoff_id is not None:
        query = query.where(PassportSignOffRequest.signoff_id == signoff_id)

    return db.scalar(query) is not None


def _require_holder(db: Session, passport_id: str, user: User) -> Passport:
    """Require that the caller owns this passport.

    Used where nobody else may act at all: writing evidence, withdrawing
    a request, reading reflections. A passport belongs permanently to the
    person it describes, and there is no operation that transfers it.
    """
    row = _passport_row(db, passport_id)

    if row.user_id != user.id:
        raise HTTPException(404, "Passport not found")

    return row


def _require_writer(
    db: Session,
    passport_id: str,
    user: User,
    store: PassportStore | None = None,
) -> Passport:
    """Require that the caller owns this passport *and* may write to it.

    **Ownership is checked first, and that order is the point.** Somebody
    who is not the holder gets 404, exactly as :func:`_require_holder`
    gives them, so a passport's existence is never confirmed to a
    stranger. Only once the caller is known to be the holder does the
    competency question arise, and a holder who lacks it gets 403.

    Checking the competency first would have been one line as a route
    dependency, and it would have answered 403 to an organisation
    administrator posting to somebody else's passport – telling them the
    passport is real, which is what the 404 exists to withhold.

    ``passport_write`` is sold. A holder whose entitlement has lapsed
    keeps everything they can read: the record, its rendering and its
    export are derived from owning it, never from paying. What they lose
    is the ability to add to it.

    Args:
        db: Core database session.
        passport_id: The passport being written to.
        user: The caller.
        store: The store, where the caller is about to write to the
            repository. Passing it adds the divergence check – see
            :func:`_reconcile_before_writing`. Omitted by the one writer
            that does not move HEAD, evidence upload, which writes a
            blob addressed by its own hash and commits nothing.

    Returns:
        The passport row.

    Raises:
        HTTPException: 404 if the caller is not the holder, 403 if they
            may not write, 409 if the record and the repository disagree
            in a way that cannot be healed.
    """
    row = _require_holder(db, passport_id, user)

    # One question, where it used to be two. A `passport_write` grant is
    # a dated row, so holding the competency now *is* having a current
    # term: a lapsed row is simply not held.
    if "passport_write" not in user.get_final_competencies():
        raise HTTPException(
            403,
            "Your passport is read-only. You can still read and export "
            "it; adding to it needs an active entitlement.",
        )

    if store is not None:
        _reconcile_before_writing(db, store, row)

    return row


def _reconcile_before_writing(
    db: Session, store: PassportStore, row: Passport
) -> None:
    """Refuse to build on a head the repository disagrees with.

    Checked before every repository write rather than after, because a
    write is built on the head that was read: starting from a stale one
    either fails the store's own fast-forward rule with a confusing
    error, or succeeds and buries the divergence one commit deeper.

    **A row merely behind is healed and the write proceeds.** That is
    the recoverable case – a commit landed and the request died before
    the row caught up – and the holder should not be stopped by a
    previous request's accident.

    **Anything else is refused with a 409.** A row naming a commit the
    repository does not have means history was rewritten, which nothing
    here may paper over; and an unreadable repository means there is no
    record to append to. Both need a person, so the write stops rather
    than writing into an unknown state.

    Args:
        db: Core database session.
        store: The store holding the repository.
        row: The passport being written to.

    Raises:
        HTTPException: 409 where the divergence cannot be healed.
    """
    divergence = reconcile.heal(db, store, row)

    if divergence.is_aligned or divergence.is_healable:
        return

    raise HTTPException(
        409,
        (
            "Your passport could not be written to because its record "
            "and its history disagree. Nothing has been changed. Please "
            "report this."
        ),
    )


def _require_reader(db: Session, passport_id: str, user: User) -> Passport:
    """Require that the caller may read this passport as a whole.

    **The holder alone.** An assessor is named on one request and may
    read that sign-off, which :func:`_require_signoff_reader` allows –
    but the whole record is a different thing. Somebody asked to judge a
    bronchoscopy has no business reading a year of CPD, a logbook of
    every procedure, or the sign-offs another assessor declined.

    This used to admit any named assessor, and the gap was invisible
    while an assessor arrived by invitation and was named on nothing.
    Asking for a sign-off is now what brings them in, so every assessor
    is named on a request and the whole passport was open to them.

    Organisation admins are deliberately not included: how "admin of the
    holder's organisation" is evaluated is being settled by the
    org-scoped access plan, and the wider reading role that plan
    describes is Phase 10 of the passport plan, not something to invent
    here.
    """
    row = _passport_row(db, passport_id)

    if row.user_id == user.id:
        return row

    raise HTTPException(404, "Passport not found")


def _require_signoff_reader(
    db: Session, passport_id: str, signoff_id: str, user: User
) -> Passport:
    """Require that the caller may read *this* sign-off.

    The holder, or the assessor named on this particular request. The
    ``signoff_id`` is what keeps it narrow: being asked about one
    competency does not open the others.
    """
    row = _passport_row(db, passport_id)

    if row.user_id == user.id:
        return row

    if _is_named_assessor(db, passport_id, user, signoff_id=signoff_id):
        return row

    raise HTTPException(404, "Passport not found")


def _read_index(store: PassportStore, passport_id: str) -> Index:
    """The derived index, or an empty one if the passport has no commits."""
    try:
        raw = store.read(passport_id, paths.INDEX)
    except PassportNotFoundError:
        raise HTTPException(404, "Passport not found") from None

    return from_yaml(Index, raw)


def _read_profile(store: PassportStore, passport_id: str) -> Profile:
    """Who the passport belongs to, from the repository itself."""
    try:
        raw = store.read(passport_id, paths.PROFILE)
    except PassportNotFoundError:
        raise HTTPException(404, "Passport not found") from None

    return from_yaml(Profile, raw)


def _passport_out(row: Passport, profile: Profile) -> PassportOut:
    """Describe a passport from its row and its profile file."""
    return PassportOut(
        passport_id=row.id,
        holder_user_id=profile.user_id,
        holder_name=profile.name,
        registrations=[
            RegistrationOut(
                body=registration.body,
                number=registration.number,
            )
            for registration in profile.registrations
        ],
        specialties=[
            SpecialtyOut(id=specialty.id, name=specialty.name)
            for specialty in profile.specialties
        ],
        frameworks=[
            FrameworkOut(id=framework.id, name=framework.name)
            for framework in profile.frameworks
        ],
        created_at=row.created_at.date(),
        head_commit=row.head_commit,
    )


def _entitlement_out(db: Session, user_id: int) -> EntitlementOut:
    """When this person's right to write runs out, for the page to warn on.

    Carried on the passport rather than behind an endpoint of its own,
    so somebody is told on the way in rather than at the moment a write
    is refused. ``days_remaining`` is counted here so the frontend does
    not have to do date arithmetic against a clock that may differ from
    the server's.

    ``can_write`` answers what ``_require_writer`` asks, whether they hold
    ``passport_write``, so the page can disable a control rather than
    offer one that always refuses. A grant with no end carries no date. Stated rather
    than left for the client to infer from a null ``ends_on``, which
    also means "this response predates these fields".
    """
    holder = db.get(User, user_id)
    if holder is None or (
        "passport_write" not in holder.get_final_competencies()
    ):
        return EntitlementOut(can_write=False)

    # Writing sits behind the feature gate, and reading their own does
    # not. Somebody who belongs nowhere the passport is on still holds
    # the competency, so without this the page would offer them an "add"
    # control that every save refused.
    if not user_has_feature(db, user_id, "passport"):
        return EntitlementOut(can_write=False)

    ends_on = passport_write_ends_on(db, user_id)

    # Held with no end: given through a site or an organisation, which
    # does not lapse. Nothing to count down to, and nothing to warn about.
    if ends_on is None:
        return EntitlementOut(can_write=True)

    # The stored value comes back naive from SQLite and aware from
    # Postgres, so the comparison is made on whichever the row gives.
    now = _now() if ends_on.tzinfo else _now().replace(tzinfo=None)
    remaining = (ends_on - now).days

    return EntitlementOut(
        ends_on=ends_on,
        days_remaining=max(remaining, 0),
        can_write=True,
    )


def _detail(
    db: Session, row: Passport, store: PassportStore
) -> PassportDetailOut:
    """A passport and every competency it holds evidence for."""
    profile = _read_profile(store, row.id)
    index = _read_index(store, row.id)

    return PassportDetailOut(
        passport=_passport_out(row, profile),
        competencies=[
            CompetencyStateOut.model_validate(entry.model_dump(mode="json"))
            for entry in index.competencies
        ],
        # The holder's own term, not the reader's: an assessor reading
        # somebody else's passport is told about that passport.
        entitlement=_entitlement_out(db, row.user_id),
    )


@passport_router.post(
    "",
    response_model=PassportOut,
    status_code=201,
    # The one write gated by a dependency rather than by
    # `_require_writer`. There is no passport yet, so there is no
    # ownership to check first and no existence a 403 could leak.
    dependencies=[
        _DEP_PASSPORT,
        Depends(has_competency("passport_write")),
        _DEP_REQUIRE_CSRF,
    ],
)
def create_passport(
    body: PassportCreateIn | None = None,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> PassportOut:
    """Create the caller's passport.

    One per person, enforced by a unique constraint on the row as well as
    checked here: a second would mean two records of the same career,
    each incomplete.

    The body is optional. A holder's specialties only order their
    competency picker, so a passport created without any is Generic
    rather than incomplete; the page asks, and the API does not insist.
    """
    existing = db.scalar(select(Passport).where(Passport.user_id == user.id))

    if existing is not None:
        raise HTTPException(409, "You already have a passport")

    chosen = _specialty_refs(body.specialties if body is not None else [])
    chosen_frameworks = _framework_refs(
        body.frameworks if body is not None else []
    )

    passport_id = ids.new_passport_id()

    # The holder's name comes from the actor, so the profile and the
    # commit trailers cannot disagree about who this passport is for.
    commit = service.create_passport(
        store,
        passport_id,
        _actor(user),
        user_id=str(user.id),
        registrations=list(_registration_dicts(user)),
        specialties=chosen,
        frameworks=chosen_frameworks,
    )

    row = Passport(id=passport_id, user_id=user.id, head_commit=commit)
    db.add(row)
    db.flush()

    profile = _read_profile(store, passport_id)

    return _passport_out(row, profile)


def _specialty_refs(specialty_ids: list[str]) -> list[SpecialtyRef]:
    """Resolve chosen specialty ids, or refuse with a 400 naming them.

    Raises:
        HTTPException: 400 if an id has no file, or appears twice.
    """
    try:
        return specialties.specialty_refs(specialty_ids)
    except specialties.UnknownSpecialtyError as error:
        raise HTTPException(400, str(error)) from None


@passport_router.put(
    "/{passport_id}/specialties",
    response_model=PassportOut,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def set_specialties(
    passport_id: str,
    body: SpecialtiesIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> PassportOut:
    """Change the holder's specialties, which order their picker.

    Behind ``_require_writer`` like every other change to the record:
    without the right to write there is nothing to pick a competency for,
    so there is nothing for the order to affect. An empty list is
    Generic.
    """
    row = _require_writer(db, passport_id, user, store)
    chosen = _specialty_refs(body.specialties)

    commit = records.set_specialties(store, row.id, _actor(user), chosen)
    row.head_commit = commit
    db.flush()

    return _passport_out(row, _read_profile(store, row.id))


def _framework_refs(framework_ids: list[str]) -> list[FrameworkRef]:
    """Resolve chosen framework ids, or refuse with a 400.

    Raises:
        HTTPException: 400 if an id has no file, or appears twice.
    """
    try:
        return frameworks.framework_refs(framework_ids)
    except frameworks.UnknownFrameworkError as error:
        raise HTTPException(400, str(error)) from None


@passport_router.put(
    "/{passport_id}/frameworks",
    response_model=PassportOut,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def set_frameworks(
    passport_id: str,
    body: FrameworksIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> PassportOut:
    """Change the frameworks the holder works to.

    Behind ``_require_writer`` like every other change to the record.
    Dropping a framework removes nothing recorded under it.
    """
    row = _require_writer(db, passport_id, user, store)
    chosen = _framework_refs(body.frameworks)

    commit = records.set_frameworks(store, row.id, _actor(user), chosen)
    row.head_commit = commit
    db.flush()

    return _passport_out(row, _read_profile(store, row.id))


def _appraisal_periods_out(profile: Profile) -> AppraisalPeriodsOut:
    """The holder's CPD date ranges on the wire, oldest first."""
    return AppraisalPeriodsOut(
        periods=[
            AppraisalPeriodOut(
                starts_on=period.starts_on, ends_on=period.ends_on
            )
            for period in profile.appraisal_periods
        ]
    )


@passport_router.get(
    "/{passport_id}/appraisal-periods",
    response_model=AppraisalPeriodsOut,
    dependencies=[_DEP_PASSPORT],
)
def get_appraisal_periods(
    passport_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> AppraisalPeriodsOut:
    """The holder's CPD date ranges, which CPD is totalled over.

    The holder alone, as for the rest of the record. Readable while the
    passport is read-only, so a holder can still see what they declared.
    """
    row = _require_reader(db, passport_id, user)

    return _appraisal_periods_out(_read_profile(store, row.id))


@passport_router.put(
    "/{passport_id}/appraisal-periods",
    response_model=AppraisalPeriodsOut,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def set_appraisal_periods(
    passport_id: str,
    body: AppraisalPeriodsIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> AppraisalPeriodsOut:
    """Replace the holder's CPD date ranges.

    The whole list at once: a page that edits one range sends them all,
    and the check that none overlap happens in one place. A range that
    ends before it starts, or two that share a day, are refused with a
    400 saying which.
    """
    row = _require_writer(db, passport_id, user, store)

    try:
        periods = [
            AppraisalPeriod(starts_on=period.starts_on, ends_on=period.ends_on)
            for period in body.periods
        ]
    except ValidationError:
        raise HTTPException(
            400, "A date range cannot end before it starts."
        ) from None

    try:
        commit = records.set_appraisal_periods(
            store, row.id, _actor(user), periods
        )
    except records.AppraisalPeriodOverlapError as error:
        raise HTTPException(400, str(error)) from None

    row.head_commit = commit
    db.flush()

    return _appraisal_periods_out(_read_profile(store, row.id))


@passport_router.get(
    "/me",
    response_model=PassportDetailOut,
    dependencies=[_DEP_PASSPORT],
)
def get_my_passport(
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> PassportDetailOut:
    """The caller's passport, with every competency it holds evidence for."""
    row = db.scalar(select(Passport).where(Passport.user_id == user.id))

    if row is None:
        raise HTTPException(404, "You do not have a passport yet")

    return _detail(db, row, store)


# Declared before ``/{passport_id}``, which would otherwise take
# "specialties" for a passport id and answer 404.
@passport_router.get(
    "/specialties",
    response_model=list[SpecialtyChoiceOut],
    dependencies=[_DEP_PASSPORT],
)
def list_specialties(
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> list[SpecialtyChoiceOut]:
    """Every specialty the caller may choose, in the order to offer them.

    Their organisations' lead specialties first, then the rest
    alphabetically, worked out by ``specialties.specialty_order_for`` so
    the create step and the settings card agree without either deciding.
    Needs no passport: the create step asks before there is one.
    """
    return [
        SpecialtyChoiceOut(
            id=choice.specialty.id,
            display_name=choice.specialty.display_name,
            lead=choice.lead,
        )
        for choice in specialties.specialty_order_for(db, user.id)
    ]


# Declared before ``/{passport_id}`` for the same reason.
@passport_router.get(
    "/frameworks",
    response_model=list[FrameworkChoiceOut],
    dependencies=[_DEP_PASSPORT],
)
def list_frameworks(
    q: str | None = Query(default=None, max_length=100),
    specialty: str | None = Query(default=None, max_length=100),
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> list[FrameworkChoiceOut]:
    """The frameworks the caller may choose, in the order to offer them.

    Their organisations' lead frameworks first, then the rest
    alphabetically. ``q`` finds words in a framework's name or
    publisher, and ``specialty`` narrows to one specialty: a framework
    filed under none belongs to all of them and is always kept. Needs no
    passport: the create step asks before there is one.
    """
    try:
        choices = frameworks.frameworks_for(
            db, user.id, query=q, specialty=specialty
        )
    except frameworks.UnknownSpecialtyFilterError as error:
        raise HTTPException(400, str(error)) from None

    return [
        FrameworkChoiceOut(
            id=choice.framework.id,
            name=choice.framework.name,
            publisher=choice.framework.publisher,
            version=choice.framework.version,
            specialties=list(choice.framework.specialties),
            lead=choice.lead,
            items=choice.items,
        )
        for choice in choices
    ]


@passport_router.get(
    "/requests/inbox",
    response_model=list[InboxItemOut],
    dependencies=[_DEP_PASSPORT],
)
def get_inbox(
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> list[InboxItemOut]:
    """The caller's open requests as an assessor.

    A cross-passport query, which is the entire reason a request row
    exists: no single repository can answer "what have I been asked to
    sign". The row is the ask; each record is read from its own passport.

    Declared before ``/{passport_id}`` so the literal path wins over the
    parameterised one.
    """
    rows = (
        db.execute(
            select(PassportSignOffRequest).where(
                func.lower(PassportSignOffRequest.assessor_email)
                == user.email.strip().lower(),
                PassportSignOffRequest.status == "open",
            )
        )
        .scalars()
        .all()
    )

    found: list[InboxItemOut] = []

    for row in rows:
        try:
            record = service.read_sign_off(
                store, row.passport_id, row.signoff_id
            )
        except PassportNotFoundError:
            # The row outlived its record, which should not happen. Skip
            # it rather than failing the whole inbox: one broken request
            # must not stop an assessor seeing the rest.
            logger.warning(
                "Sign-off request %s names a record that is not there",
                row.id,
            )
            continue

        found.append(
            InboxItemOut(
                passport_id=row.passport_id,
                sign_off=_sign_off_out(row.signoff_id, record),
            )
        )

    return found


def _confirmation_asked_of(
    db: Session, request_id: int, user: User
) -> PassportLogbookConfirmationRequest:
    """The open ask with this id, if it names the caller.

    A 404 for anything else, as a sign-off the caller was not asked
    about answers: an ask that exists is not confirmed to a stranger.
    """
    request_row = db.get(PassportLogbookConfirmationRequest, request_id)

    if (
        request_row is None
        or request_row.status != "open"
        or request_row.supervisor_email != user.email.strip().lower()
    ):
        raise HTTPException(404, "Nothing to confirm")

    return request_row


@passport_router.get(
    "/requests/logbook-confirmations/{request_id}",
    response_model=LogbookConfirmationOut,
    dependencies=[_DEP_PASSPORT],
)
def get_logbook_confirmation(
    request_id: int,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> LogbookConfirmationOut:
    """One logbook entry the caller has been asked to confirm.

    The entry and nothing else of the passport: being asked about one
    procedure opens no other entry, no sign-off and no reflection.
    """
    request_row = _confirmation_asked_of(db, request_id, user)
    passport = _passport_row(db, request_row.passport_id)

    try:
        entry = from_yaml(
            LogbookEntry,
            store.read(
                passport.id,
                paths.logbook_entry(
                    request_row.competency_id, request_row.entry_stem
                ),
            ),
        )
        competency = definitions.competency_ref(request_row.competency_id)
    except (
        PassportNotFoundError,
        paths.PassportPathError,
        definitions.UnknownCompetencyError,
    ):
        raise HTTPException(404, "Nothing to confirm") from None

    holder = db.get(User, passport.user_id)

    return LogbookConfirmationOut(
        id=request_row.id,
        passport_id=passport.id,
        holder_name=(
            (holder.full_name or holder.username)
            if holder is not None
            else "A clinician"
        ),
        competency=CompetencyRefOut(id=competency.id, name=competency.name),
        entry=_logbook_entry_out(
            request_row.competency_id, request_row.entry_stem, entry, {}
        ),
    )


@passport_router.post(
    "/requests/logbook-confirmations/{request_id}",
    response_model=LogbookConfirmAnswerOut,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def answer_logbook_confirmation(
    request_id: int,
    body: LogbookConfirmIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> LogbookConfirmAnswerOut:
    """Confirm a logbook entry, or say it is not the caller's to confirm.

    Confirming writes the caller's name and standing onto the entry, as
    signing a sign-off does, and says only that the procedure happened
    as recorded. Declining closes the ask and leaves the entry as the
    holder wrote it.
    """
    request_row = _confirmation_asked_of(db, request_id, user)
    passport = _passport_row(db, request_row.passport_id)

    if passport.user_id == user.id:
        # Refused when asking too, so this means the holder's address
        # changed to the one they asked. Still not theirs to confirm.
        raise HTTPException(403, "You cannot confirm your own logbook entry.")

    if body.confirmed:
        actor = _actor(user)
        try:
            passport.head_commit = records.confirm_logbook_entry(
                store,
                passport.id,
                actor,
                request_row.competency_id,
                request_row.entry_stem,
                confirmer=Assessor.model_validate(
                    {
                        "user_id": str(user.id),
                        "name": actor.name,
                        "role": actor.role,
                        "registrations": _registration_dicts(user),
                    }
                ),
            )
        except (records.RecordNotFoundError, paths.PassportPathError):
            raise HTTPException(404, "Nothing to confirm") from None
        except records.AlreadyConfirmedError as error:
            raise HTTPException(409, str(error)) from None

    request_row.status = "confirmed" if body.confirmed else "declined"
    request_row.supervisor_user_id = user.id
    request_row.resolved_at = _now()
    db.flush()

    return LogbookConfirmAnswerOut(
        status="confirmed" if body.confirmed else "declined"
    )


def _sign_off_out(name: str, record: SignOff) -> SignOffOut:
    """Describe a sign-off on the wire."""
    return SignOffOut.model_validate(
        {"name": name, **record.model_dump(mode="json")}
    )


@passport_router.get(
    "/{passport_id}",
    response_model=PassportDetailOut,
    dependencies=[_DEP_PASSPORT],
)
def get_passport(
    passport_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> PassportDetailOut:
    """A passport the caller may read."""
    row = _require_reader(db, passport_id, user)

    return _detail(db, row, store)


def _requests_today(db: Session, passport_id: str) -> int:
    """How many sign-offs this passport has asked for in the last day.

    Counted for the same reason invitations are, and alongside them:
    asking now sends mail to an address somebody typed, so a limit on
    one and not the other is no limit at all. A rolling twenty-four
    hours rather than a calendar day, which would let twice the limit
    go out either side of midnight.
    """
    since = _now() - timedelta(days=1)

    sign_offs = db.scalar(
        select(func.count())
        .select_from(PassportSignOffRequest)
        .where(
            PassportSignOffRequest.passport_id == passport_id,
            PassportSignOffRequest.created_at >= since,
        )
    )
    # Asking a supervisor to confirm a logbook entry mails an address
    # somebody typed too, so it counts against the same limit.
    confirmations = db.scalar(
        select(func.count())
        .select_from(PassportLogbookConfirmationRequest)
        .where(
            PassportLogbookConfirmationRequest.passport_id == passport_id,
            PassportLogbookConfirmationRequest.created_at >= since,
        )
    )

    return (sign_offs or 0) + (confirmations or 0)


def _join_as_external(db: Session, user_id: int, org_unit_id: int) -> None:
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


def _let_existing_account_assess(
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
    """
    try:
        org_unit_id = _holder_org_unit(db, passport_id)
    except HTTPException as error:
        if error.status_code != 409:
            raise
        # Said to the holder here, where `_holder_org_unit` speaks to the
        # person accepting an invitation.
        raise HTTPException(
            409,
            "You do not belong anywhere on Quill, so your assessor "
            "cannot be given access to your request.",
        ) from None
    _join_as_external(db, assessor.id, org_unit_id)

    if "assess_clinician_passport" not in assessor.get_final_competencies():
        assessor.competency_grants.append(
            UserCompetency(
                competency_id="assess_clinician_passport",
                starts_on=_now(),
                source="sign_off_request",
                org_unit_id=org_unit_id,
                granted_by=holder.id,
            )
        )
    db.flush()


def _checked_request(
    competency_id: str, level_id: str | None, scope_id: str | None = None
) -> LevelRef | None:
    """Refuse, before anybody is emailed, a request that cannot be saved.

    Each refusal is logged at error, not warning, because the request
    form should never send one: arriving here means the form and the
    server disagree, as they did when the form had no level field, and
    an error is what reaches the team. The message to the holder is
    plain English; the ids are in the log.

    Returns:
        The level to record, or ``None`` for a competency with no scale.
    """
    try:
        return service.check_request(competency_id, level_id, scope_id)
    except definitions.UnknownCompetencyError:
        raise HTTPException(404, "Unknown competency") from None
    except definitions.UnknownScopeError as error:
        logger.error("sign-off request refused: %s", error)
        raise HTTPException(
            400, "That is not something this competency is signed off for."
        ) from None
    except definitions.UnknownLevelError as error:
        logger.error("sign-off request refused: %s", error)
        raise HTTPException(
            400, "That level is not one this competency is signed off at."
        ) from None
    except service.SignOffError as error:
        logger.error(
            "sign-off request refused: %s (competency %r, level %r, "
            "scope %r)",
            error,
            competency_id,
            level_id,
            scope_id,
        )
        raise HTTPException(400, str(error)) from None


def _email_sign_off_request(
    *,
    holder: User,
    assessor_email: str,
    assessor: User | None,
    competency_id: str,
    passport_id: str,
    invited_by_user_id: int,
    db: Session,
    level_name: str | None = None,
    scope_name: str | None = None,
    confirming_logbook: bool = False,
) -> None:
    """Tell the assessor they have been asked, whoever they are.

    Two cases, one email. Somebody with an account is told to sign in;
    somebody without gets a single-use link to register behind. The link
    is what an invitation row exists for – a token carries no record of
    having been spent, so the row is what makes it single-use.

    **A failure here undoes the request, and this runs before anything
    is written.** The email is the only way an assessor learns they have
    been asked: there is no other notification, and somebody without a
    Quill account has no inbox to find it in. So a request whose mail
    never got out is invisible to everybody except the holder, who has
    been told it was sent. That is worse than a clean failure they can
    retry, which is what they get instead.

    This reverses an earlier reading, which kept the request on the
    grounds that the holder had asked and the ask should stand. It was
    right that losing the ask costs something, and wrong about what
    replaces it: "an assessor who has to be told by other means" assumed
    somebody knows to tell them, and nothing here ever does.
    """
    try:
        competency_name: str | None = definitions.competency_ref(
            competency_id
        ).name
    except definitions.UnknownCompetencyError:
        competency_name = None

    if assessor is not None:
        # They can already sign in, so no invitation and no token: the
        # request is waiting in their inbox when they arrive. The page is
        # `/inbox`, which lists everything waiting on them, sign-off
        # requests among it. It was `/passport/inbox` until the passport's
        # own queue folded into the one inbox on 4 October 2026.
        url = f"{settings.FRONTEND_URL.rstrip('/')}/inbox"
        expires_in_days = PASSPORT_INVITE_TTL_DAYS
    else:
        invite = PassportAssessorInvite(
            id=str(uuid.uuid4()),
            passport_id=passport_id,
            invited_by_user_id=invited_by_user_id,
            # The holder gave an address and nothing else. The assessor
            # states their own name and registration when they accept,
            # which is the more trustworthy source for both, and is why
            # this row no longer carries columns for them.
            email=assessor_email,
            # So the accept page can say what they were asked to judge.
            # Not what they may sign: that is still resolved from the
            # request rows naming them.
            competency_id=competency_id,
            token_hash="",
            expires_at=_now() + timedelta(days=PASSPORT_INVITE_TTL_DAYS),
        )
        token = create_passport_invite_token(
            invite_id=invite.id,
            email=invite.email,
        )
        invite.token_hash = hashlib.sha256(token.encode()).hexdigest()
        db.add(invite)
        db.flush()

        url = email_templates.accept_url(settings.FRONTEND_URL, token)
        expires_in_days = PASSPORT_INVITE_TTL_DAYS

    message = email_templates.render_invite(
        # No name was collected, so the greeting uses the address. Better
        # than a blank "Dear ," and honest about what the holder gave.
        assessor_name=(
            assessor.full_name or assessor.username
            if assessor is not None
            else assessor_email
        ),
        holder_name=holder.full_name or holder.username,
        competency_name=competency_name,
        level_name=level_name,
        scope_name=scope_name,
        confirming_logbook=confirming_logbook,
        url=url,
        expires_in_days=expires_in_days,
    )

    try:
        send_email(
            to=assessor_email,
            subject=message["subject"],
            html_body=message["html_body"],
            text_body=message["text_body"],
        )
    except EmailRateLimitError:
        # 429 rather than the 502 below, because "too many already" and
        # "the mail server is unreachable" need different things from
        # the holder: one waits, the other retries or reports it.
        logger.warning(
            "sign-off request mail not sent: address rate limited",
        )
        raise HTTPException(
            429,
            (
                "That assessor has been emailed several times in the "
                "last hour. Try again later."
            ),
        ) from None
    except EmailNotAllowedError:
        # Only reachable where EMAIL_ALLOWED_RECIPIENTS is set, which is
        # a development machine. Said plainly so the tester sees the
        # setting rather than a mail-server problem that is not one.
        logger.warning(
            "sign-off request mail not sent: recipient not allowed here",
        )
        raise HTTPException(
            400,
            (
                "This environment may only email approved addresses. "
                "Nothing has been saved."
            ),
        ) from None
    except Exception:
        # Every other mail failure: unreachable, refused, timed out.
        # Caught broadly on purpose – what they have in common is that
        # the assessor was not told, and none of them is something the
        # holder can diagnose. The traceback is logged; the request is
        # abandoned by raising, which leaves nothing written.
        logger.exception("sign-off request mail could not be sent")
        raise HTTPException(
            502,
            (
                "We could not email that assessor, so the request has "
                "not been made. Nothing has been saved. Please try "
                "again."
            ),
        ) from None


#: How many people a lookup can name. One, because an address names one
#: mailbox: this route confirms a person the caller already has an
#: address for, and never offers a choice between candidates.
ASSESSOR_SEARCH_LIMIT = 1


@passport_router.get(
    "/assessors/search",
    response_model=AssessorSearchOut,
    dependencies=[_DEP_PASSPORT],
)
def search_assessors(
    q: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> AssessorSearchOut:
    """Confirm whether an address already belongs to somebody on Quill.

    **An exact email address, and nothing else.** It used to match a
    substring of an address, a username or a full name, which made it a
    directory: the authorisation review on 22 September found that any
    holder of ``assess_clinician_passport`` – sixteen base professions,
    and every external assessor ever invited – could read back the
    address and professional registration number of every active
    account in the deployment. A three-character minimum and a limit of
    ten slowed that down; neither bounded it.

    Requiring the whole address closes it without narrowing who can be
    named. The caller must already know the address, because that is
    what the invitation is sent to, so nothing a holder could legitimately
    do is lost. Scoping to the caller's own organisations would have cost
    something real: the assessor who observed the work is often at another
    trust, which is what external assessors are for.

    **Finding nobody is an ordinary answer**, and the commonest one. The
    caller goes on to ask by the address they typed, and an invitation
    is emailed instead.
    """
    term = q.strip()

    # Nothing that is not an address can match, so a partial one is
    # answered with the empty list rather than an error: the caller is
    # part way through typing, which is not a mistake.
    if "@" not in term:
        return AssessorSearchOut(matches=[])

    rows = (
        db.execute(
            select(User)
            .where(
                User.is_active.is_(True),
                User.id != user.id,
                # Whole address, compared without regard to case. An
                # address typed with capitals is the same mailbox.
                func.lower(User.email) == term.lower(),
            )
            .limit(ASSESSOR_SEARCH_LIMIT)
        )
        .unique()
        .scalars()
        .all()
    )

    return AssessorSearchOut(
        matches=[
            AssessorMatchOut(
                user_id=row.id,
                username=row.username,
                full_name=row.full_name,
                email=row.email,
                registrations=[
                    RegistrationOut(**reg) for reg in _registration_dicts(row)
                ],
            )
            for row in rows
        ]
    )


@passport_router.post(
    "/{passport_id}/competencies/{competency_id}/requests",
    response_model=SignOffResultOut,
    status_code=201,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def request_sign_off(
    passport_id: str,
    competency_id: str,
    body: SignOffRequestIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> SignOffResultOut:
    """Ask an assessor, by email, to sign off a competency.

    The holder chooses their assessor, because the judgement about who is
    appropriate sits with them and their supervisor. The one rule is that
    it may not be the holder – the whole value of the record is a second
    named person accepting accountability.

    **The address need not belong to a Quill account.** That is the
    point: the consultant who observed the work is often at another
    trust, or not on Quill at all. The assessor is emailed either way;
    they sign in or register, and the account is joined to the request
    when they sign.

    **No mail, no request.** The email is sent before anything is
    written, and a failure to send abandons the whole thing: a 502, with
    nothing saved and nothing committed. An assessor learns of a request
    only by email, so one that was never delivered would leave the
    holder believing they had asked and the assessor never knowing.
    """
    row = _require_writer(db, passport_id, user, store)

    # Before the email, since nothing can be unsent: a request for a
    # competency that does not exist, or that nobody can be assessed on,
    # must not reach an assessor's inbox. Nor may one the service would
    # then refuse, such as a scaled competency asked for with no level,
    # which is what an assessor was once emailed about on the live site.
    _offered_refs(store, row.id, [competency_id])
    requested_level = _checked_request(
        competency_id, body.level_id, body.scope_id
    )
    # Already checked, so this only fetches the wording for the email.
    requested_scope = (
        definitions.scope_ref(competency_id, body.scope_id)
        if body.scope_id is not None
        else None
    )

    assessor_email = body.assessor_email.strip().lower()

    if assessor_email == user.email.strip().lower():
        raise HTTPException(
            400,
            "You cannot ask yourself to sign off your own competency.",
        )

    # The same backstop the invite route carries, for the same reason:
    # this route now sends mail to an address somebody typed, so without
    # it a holder could mail an unbounded number of strangers in Quill's
    # name. Requests alone are the whole count: asking is now the only
    # thing that sends this mail, and an invitation is minted by an ask
    # rather than beside one – so adding the two together would charge a
    # single ask twice and halve the limit without saying so.
    if _requests_today(db, row.id) >= INVITES_PER_DAY:
        raise HTTPException(
            429,
            (
                f"You can ask up to {INVITES_PER_DAY} assessors a day. "
                "Try again tomorrow."
            ),
        )

    # Whether they already have an account decides what the email asks
    # them to do, so it is looked up here. A missing account is not an
    # error: the invitation below is what brings them in.
    assessor = db.scalar(
        select(User).where(func.lower(User.email) == assessor_email)
    )
    if assessor is not None:
        _let_existing_account_assess(db, assessor, row.id, user)

    # The mail goes before the record, which is the whole shape of this
    # route. A failed send must leave nothing behind, and only the
    # database can be rolled back: the repository commit below cannot,
    # because git takes no part in this transaction. Committing first
    # and mailing second is what left a passport holding a request the
    # database had no row for.
    #
    # Nothing here needs the commit. The invitation is a database row
    # with an id this process generates, and the email names the
    # competency and the holder, neither of which the write creates.
    _email_sign_off_request(
        holder=user,
        assessor_email=assessor_email,
        assessor=assessor,
        competency_id=competency_id,
        level_name=requested_level.name if requested_level else None,
        scope_name=requested_scope.name if requested_scope else None,
        passport_id=row.id,
        invited_by_user_id=user.id,
        db=db,
    )

    try:
        name, commit = service.request_sign_off(
            store,
            row.id,
            _actor(user),
            competency_id=competency_id,
            observed_on=body.observed_on,
            level_id=body.level_id,
            scope_id=body.scope_id,
            comments=body.comments,
            reflection=body.reflection,
        )
    except (
        definitions.UnknownCompetencyError,
        definitions.UnknownLevelError,
        definitions.UnknownScopeError,
        service.SignOffError,
    ) as error:
        # `_checked_request` refused all of these before the email went,
        # so arriving here means the two checks disagree, and the
        # assessor has been emailed about a request that will not exist.
        logger.error(
            "sign-off request refused after its email was sent: %s", error
        )
        raise HTTPException(
            500,
            "Your request could not be saved. The team has been told.",
        ) from None

    db.add(
        PassportSignOffRequest(
            passport_id=row.id,
            signoff_id=name,
            competency_id=competency_id,
            assessor_email=assessor_email,
            # Null until somebody signs. Who was asked is the address
            # above; this records who actually signed, taken from the
            # signer rather than from here.
            assessor_user_id=None,
            status="open",
        )
    )
    row.head_commit = commit
    db.flush()

    return SignOffResultOut(name=name, status="requested", commit=commit)


@passport_router.get(
    "/{passport_id}/sign-offs",
    response_model=list[SignOffOut],
    dependencies=[_DEP_PASSPORT],
)
def list_sign_offs(
    passport_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> list[SignOffOut]:
    """Every sign-off in the passport, newest first.

    One per request, not one per competency. The passport's competency
    list carries only each competency's latest sign-off, so a page built
    from it showed a declined request and the sign-off that followed as
    a single row, and never showed the declined one at all.

    The holder alone, as for the whole passport: an assessor may read
    the one sign-off they were asked about, never the others.
    """
    row = _require_reader(db, passport_id, user)

    found: list[tuple[str, SignOff]] = []

    for folder in store.list_dir(row.id, paths.SIGN_OFFS):
        try:
            found.append(
                (
                    folder.name,
                    service.read_sign_off(store, row.id, folder.name),
                )
            )
        except PassportNotFoundError:
            # A folder with no sign-off.yaml is not a sign-off, as the
            # index treats it too.
            continue

    found.sort(key=lambda pair: (pair[1].observed_on, pair[0]), reverse=True)

    asked = _assessor_emails(db, row.id)

    return [
        _sign_off_out(name, record).model_copy(
            update={"assessor_email": asked.get(name)}
        )
        for name, record in found
    ]


def _assessor_emails(db: Session, passport_id: str) -> dict[str, str]:
    """Who each of a passport's sign-offs was asked of, by sign-off name.

    Kept in the request row rather than the signed record, which names
    only who signed. So a request nobody has answered can still say who
    it is waiting on. An empty address, the column's default on rows
    from before it was kept, counts as not known.
    """
    rows = db.execute(
        select(
            PassportSignOffRequest.signoff_id,
            PassportSignOffRequest.assessor_email,
        ).where(PassportSignOffRequest.passport_id == passport_id)
    ).all()

    return {signoff_id: email for signoff_id, email in rows if email}


@passport_router.get(
    "/{passport_id}/sign-offs/{signoff_id}",
    response_model=SignOffOut,
    dependencies=[_DEP_PASSPORT],
)
def get_sign_off(
    passport_id: str,
    signoff_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> SignOffOut:
    """One sign-off in full, for the holder or the assessor asked."""
    row = _require_signoff_reader(db, passport_id, signoff_id, user)

    try:
        record = service.read_sign_off(store, row.id, signoff_id)
    except (PassportNotFoundError, paths.PassportPathError):
        raise HTTPException(404, "Sign-off not found") from None

    out = _sign_off_out(signoff_id, record)

    # Only for the holder. An assessor reading the request they were
    # sent already knows it went to them.
    if row.user_id != user.id:
        return out

    return out.model_copy(
        update={"assessor_email": _assessor_emails(db, row.id).get(signoff_id)}
    )


@passport_router.post(
    "/{passport_id}/sign-offs/{signoff_id}/sign-off",
    response_model=SignOffResultOut,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def sign_off(
    passport_id: str,
    signoff_id: str,
    body: SignOffIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> SignOffResultOut:
    """Sign a requested sign-off.

    Refused unless the caller is named on the request, is not the holder,
    and confirmed the declaration. All three are guard clauses in the
    service before a byte is written, so a refusal leaves HEAD where it
    was and the record still ``requested``.
    """
    passport = _passport_row(db, passport_id)
    request_row = db.scalar(
        select(PassportSignOffRequest).where(
            PassportSignOffRequest.passport_id == passport.id,
            PassportSignOffRequest.signoff_id == signoff_id,
        )
    )

    if request_row is None:
        raise HTTPException(404, "Sign-off not found")

    if (
        request_row.assessor_email.strip().lower()
        != user.email.strip().lower()
    ):
        raise HTTPException(403, "You were not asked to sign this")

    if request_row.status != "open":
        raise HTTPException(409, f"Already {request_row.status}")

    try:
        commit = service.sign_off(
            store,
            passport.id,
            _actor(user),
            name=signoff_id,
            assessor_user_id=str(user.id),
            holder_user_id=str(passport.user_id),
            meaning=body.meaning,
            declaration_confirmed=body.declaration_confirmed,
            level_id=body.level_id,
            comments=body.comments,
            assessment=body.assessment,
            registrations=list(_registration_dicts(user)),
        )
    except service.SelfSignOffError:
        raise HTTPException(
            403,
            "A passport records a second person's judgement, so you "
            "cannot sign off your own competency.",
        ) from None
    except service.DeclarationNotConfirmedError:
        raise HTTPException(
            400, "The declaration must be confirmed before signing."
        ) from None
    except service.LevelReasonMissingError as error:
        raise HTTPException(400, str(error)) from None
    except definitions.UnknownLevelError as error:
        # The form offers only the competency's own levels, so this means
        # the form and the server disagree: logged at error to reach the
        # team, with the ids, and said plainly to the assessor.
        logger.error("sign-off refused: %s", error)
        raise HTTPException(
            400, "That level is not one this competency is signed off at."
        ) from None
    except service.SignOffStateError as error:
        raise HTTPException(409, str(error)) from None

    request_row.status = "signed_off"
    request_row.resolved_at = _now()
    # Taken from the caller, never from the row: the column records who
    # actually signed, and the address only says who was asked.
    request_row.assessor_user_id = user.id
    passport.head_commit = commit
    db.flush()

    return SignOffResultOut(
        name=signoff_id, status="signed_off", commit=commit
    )


@passport_router.post(
    "/{passport_id}/sign-offs/{signoff_id}/decline",
    response_model=SignOffResultOut,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def decline_sign_off(
    passport_id: str,
    signoff_id: str,
    body: SignOffDeclineIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> SignOffResultOut:
    """Decline a request, with a reason.

    Recorded like anything else. A record that only showed successes
    would be worth less to everyone reading it.
    """
    passport = _passport_row(db, passport_id)
    request_row = db.scalar(
        select(PassportSignOffRequest).where(
            PassportSignOffRequest.passport_id == passport.id,
            PassportSignOffRequest.signoff_id == signoff_id,
        )
    )

    if request_row is None:
        raise HTTPException(404, "Sign-off not found")

    if (
        request_row.assessor_email.strip().lower()
        != user.email.strip().lower()
    ):
        raise HTTPException(403, "You were not asked to sign this")

    if request_row.status != "open":
        raise HTTPException(409, f"Already {request_row.status}")

    try:
        commit = service.decline_sign_off(
            store,
            passport.id,
            _actor(user),
            name=signoff_id,
            assessor_user_id=str(user.id),
            holder_user_id=str(passport.user_id),
            reason=body.reason,
        )
    except service.SignOffStateError as error:
        raise HTTPException(409, str(error)) from None

    request_row.status = "declined"
    request_row.resolved_at = _now()
    # Recorded on a decline too: somebody answered, and who they were is
    # part of that answer.
    request_row.assessor_user_id = user.id
    passport.head_commit = commit
    db.flush()

    return SignOffResultOut(name=signoff_id, status="declined", commit=commit)


@passport_router.post(
    "/{passport_id}/sign-offs/{signoff_id}/withdraw",
    response_model=SignOffResultOut,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def withdraw_sign_off(
    passport_id: str,
    signoff_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> SignOffResultOut:
    """Withdraw a request the holder no longer wants assessed."""
    passport = _require_writer(db, passport_id, user, store)
    request_row = db.scalar(
        select(PassportSignOffRequest).where(
            PassportSignOffRequest.passport_id == passport.id,
            PassportSignOffRequest.signoff_id == signoff_id,
        )
    )

    if request_row is None:
        raise HTTPException(404, "Sign-off not found")

    if request_row.status != "open":
        raise HTTPException(409, f"Already {request_row.status}")

    try:
        commit = service.withdraw_sign_off(
            store, passport.id, _actor(user), name=signoff_id
        )
    except service.SignOffStateError as error:
        raise HTTPException(409, str(error)) from None

    request_row.status = "withdrawn"
    request_row.resolved_at = _now()
    passport.head_commit = commit
    db.flush()

    return SignOffResultOut(name=signoff_id, status="declined", commit=commit)


@passport_router.get(
    "/{passport_id}/sign-offs/{signoff_id}/verify",
    response_model=VerificationOut,
    dependencies=[_DEP_PASSPORT],
)
def verify_sign_off(
    passport_id: str,
    signoff_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> VerificationOut:
    """Recompute a sign-off's fingerprint and report whether it matches.

    The response states its own limits rather than leaving them to be
    inferred. A match shows the record has not changed since it was
    written. It does not prove a professional registration, and it proves
    nothing to a reader who distrusts Quill, since the same system
    computed and stored the hash.
    """
    row = _require_signoff_reader(db, passport_id, signoff_id, user)

    try:
        record = service.read_sign_off(store, row.id, signoff_id)
    except (PassportNotFoundError, paths.PassportPathError):
        raise HTTPException(404, "Sign-off not found") from None

    recomputed = hashing.content_hash(record)

    return VerificationOut(
        name=signoff_id,
        unchanged=hashing.matches(record),
        content_hash=record.content_hash,
        recomputed_hash=recomputed,
        proves=(
            "This record has not changed since it was written, and a "
            "named account signed it off."
        ),
        does_not_prove=(
            "It does not prove the assessor's professional "
            "registration, which Quill records as declared and never "
            "checks against a register. It proves nothing to a reader "
            "who distrusts Quill itself, since the same system computed "
            "and stored the hash."
        ),
    )


@passport_router.get(
    "/{passport_id}/competencies/{competency_id}",
    response_model=CompetencyStateOut,
    dependencies=[_DEP_PASSPORT],
)
def get_competency_state(
    passport_id: str,
    competency_id: str,
    scope_id: str | None = None,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> CompetencyStateOut:
    """Where one competency stands.

    Reports what the latest record says and draws no conclusion. An
    expired sign-off still reports ``signed_off``: what a lapsed
    sign-off implies is a clinical decision that has not been made, so
    the expiry date is returned for a person to judge.

    A competency signed off scope by scope stands somewhere different
    for each, so ``scope_id`` says which. Without it the first entry
    for the competency is returned, which is the only one where the
    competency is assessed as a whole.
    """
    row = _require_reader(db, passport_id, user)
    index = _read_index(store, row.id)

    for entry in index.competencies:
        if entry.id != competency_id:
            continue

        entry_scope = entry.scope.id if entry.scope is not None else None
        if scope_id is None or entry_scope == scope_id:
            return CompetencyStateOut.model_validate(
                entry.model_dump(mode="json")
            )

    raise HTTPException(404, "No evidence for that competency")

    # --------------------------------------------------------------------
    # Self-declared evidence
    # --------------------------------------------------------------------
    #
    # Certificates, logbook entries, reflections and CPD are the holder's own
    # claims: they enter them, nobody countersigns, and they are editable
    # because a mistyped date should be fixable in seconds. That is the whole
    # difference between these and a sign-off, which is immutable once signed
    # and corrected only by superseding it – the difference follows from who
    # is accountable for each.
    #
    # So every route below requires the holder and nobody else.


def _competency_refs(ids_given: list[str]) -> list[CompetencyRef]:
    """Resolve competency ids to id-and-name pairs.

    The label travels with the id into the stored record, so a
    certificate read years later stays intelligible even if the
    definition has since moved on.

    Raises:
        HTTPException: 404 if any id is not in the catalogue.
    """
    try:
        return [definitions.competency_ref(given) for given in ids_given]
    except definitions.UnknownCompetencyError as error:
        raise HTTPException(404, str(error)) from None


def _assessable_refs(ids_given: list[str]) -> list[CompetencyRef]:
    """Resolve competency ids for a record being created.

    Stricter than :func:`_competency_refs`: each id must also be one the
    passport may record, so ``manage_users`` cannot be logged or signed
    off. Amending keeps the looser check, so an old record naming a
    competency since marked not assessable can still have its date put
    right.

    Raises:
        HTTPException: 404 if any id is not in the catalogue, 400 if one
            is not assessable.
    """
    try:
        return [definitions.assessable_ref(given) for given in ids_given]
    except definitions.UnknownCompetencyError as error:
        raise HTTPException(404, str(error)) from None
    except definitions.NotAssessableError as error:
        raise HTTPException(400, str(error)) from None


#: Said to a holder asking to record something outside their frameworks.
#: Plain English, and it says what to do about it.
OUTSIDE_FRAMEWORKS_MESSAGE = (
    "That is not in a framework you work to. Add its framework under "
    "Clinician passport in Settings, then try again."
)


def _offered_refs(
    store: PassportStore, passport_id: str, ids_given: list[str]
) -> list[CompetencyRef]:
    """Resolve competency ids for a record being created in a passport.

    Each must be one the passport may record, as :func:`_assessable_refs`
    requires, and must belong to a framework the holder works to. A
    passport offers its holder the competencies in their frameworks and
    no others, and there is no way round: somebody who wants one that is
    not there adds its framework first.

    Only on creating. Amending keeps the looser check and reading never
    checks, so dropping a framework hides and freezes nothing already
    recorded under it.

    Raises:
        HTTPException: 404 if any id is not in the catalogue, 400 if one
            is not assessable or is outside the holder's frameworks.
    """
    refs = _assessable_refs(ids_given)
    working_to = {
        framework.id
        for framework in _read_profile(store, passport_id).frameworks
    }

    for ref in refs:
        entry = get_competency_details(ref.id)
        if entry is None or entry.framework_id not in working_to:
            raise HTTPException(400, OUTSIDE_FRAMEWORKS_MESSAGE)

    return refs


def _attachments(
    blobs: BlobStore | GcsBlobStore,
    passport_id: str,
    named: list[AttachmentIn],
) -> list[Attachment]:
    """Check evidence exists, and describe it as the record will.

    The caller supplies the filename and media type because it is the
    only party that knows them: a blob is bytes at a path named by their
    hash, and nothing beside it records what the file was called. The
    record is where that description lives, which is why ``Attachment``
    carries all four fields and the store carries none of them.

    What is verified here is existence, and against this passport rather
    than in general. A record naming a blob that is not there would be a
    dangling reference in a document whose whole claim is that it can be
    checked years later; naming one stored against somebody else's
    passport would attach evidence the holder has never seen.

    The media type is verified too, against the stored bytes. Upload
    sniffs what it is given, but that guards only the moment of upload:
    this is a second call, and until this check it took the caller's
    word. A PNG uploaded honestly could be named here as
    ``application/pdf`` and the record would say so permanently, which
    is the same lie the sniff at upload exists to refuse – just told one
    step later. The record outlives the request, so it is the record
    that has to be true.
    """
    found: list[Attachment] = []

    for item in named:
        try:
            present = blobs.exists(passport_id, item.hash)
        except paths.PassportPathError:
            raise HTTPException(400, "That is not a valid hash") from None

        if not present:
            raise HTTPException(
                400,
                "That evidence is not stored against this passport. "
                "Upload it before naming it.",
            )

        if item.media_type not in ALLOWED_EVIDENCE_TYPES:
            allowed = ", ".join(sorted(ALLOWED_EVIDENCE_TYPES))
            raise HTTPException(
                400, f"Unsupported evidence type (allowed: {allowed})"
            )

        # Only the first bytes decide the signature, but the stores hand
        # back whole blobs. Bounded above by the upload ceiling, so this
        # reads at most one already-admitted file.
        stored = blobs.get(passport_id, item.hash)

        if not _looks_like(stored, item.media_type):
            raise HTTPException(
                400,
                f"That evidence is not {item.media_type}",
            )

        found.append(
            Attachment(
                hash=item.hash,
                filename=item.filename,
                size_bytes=item.size_bytes,
                media_type=item.media_type,
            )
        )

    return found


# api-schema-check: allow-opaque-permanent is not needed here: this
# returns a typed body describing what was stored, not the bytes.
@passport_router.post(
    "/{passport_id}/evidence",
    response_model=EvidenceUploadOut,
    status_code=201,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
async def upload_evidence(
    passport_id: str,
    file: UploadFile,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    blobs: BlobStore | GcsBlobStore = _DEP_BLOBS,
) -> EvidenceUploadOut:
    """Store one piece of evidence and return the hash to name it by.

    **The bytes come through this application deliberately.** A blob is
    addressed by the SHA-256 of its contents, which is what lets a
    holder check their own record years later with nothing but a
    checksum tool – so the address cannot be computed without reading
    every byte. That rules out the signed-URL pattern the teaching
    videos use, where the browser uploads straight to the bucket: a
    video is addressed by a generated id, so nobody has to look inside
    it.

    Uploading the same file twice yields the same hash and stores one
    copy, so an interrupted upload is retried rather than reconciled.
    """
    row = _require_writer(db, passport_id, user)

    media_type = (file.content_type or "").split(";")[0].strip().lower()

    if media_type not in ALLOWED_EVIDENCE_TYPES:
        allowed = ", ".join(sorted(ALLOWED_EVIDENCE_TYPES))
        raise HTTPException(
            400, f"Unsupported evidence type (allowed: {allowed})"
        )

    # Read in bounded chunks so an oversize upload is stopped partway
    # rather than after. The middleware's ceiling comes from
    # `Content-Length` and is skipped when that header is absent, so a
    # chunked upload reaches here undeclared and nothing above has
    # bounded it.
    #
    # This is not a memory optimisation, and an earlier comment here
    # wrongly claimed it was: the join below materialises the whole file
    # anyway, and Starlette has already spooled any part over 1 MB to
    # disk. What it buys is a ceiling that holds when the header is
    # missing, and a refusal that arrives without reading the rest.
    # Hashing and storing need every byte together, so the join stays.
    limit_mb = MAX_EVIDENCE_BYTES // (1024 * 1024)
    chunks: list[bytes] = []
    total = 0

    while chunk := await file.read(_UPLOAD_CHUNK):
        total += len(chunk)

        if total > MAX_EVIDENCE_BYTES:
            raise HTTPException(
                413,
                f"That file is larger than {limit_mb} MB",
            )

        chunks.append(chunk)

    data = b"".join(chunks)

    if not data:
        raise HTTPException(400, "That file is empty")

    # The allow-list above checks what the caller said; this checks what
    # they sent. A mismatch is refused rather than corrected: guessing
    # the real type and storing it under that would mean recording
    # something the holder never claimed.
    if not _looks_like(data, media_type):
        raise HTTPException(
            400,
            f"That file does not look like {media_type}",
        )

    try:
        attachment = blobs.put(
            row.id,
            data,
            filename=file.filename or "evidence",
            media_type=media_type,
        )
    except BlobConflictError:
        # The hash is the name, so this means the same address already
        # holds different bytes. Not something a caller can fix, and not
        # something to overwrite: every record naming that hash would
        # silently come to mean something else.
        raise HTTPException(
            409, "Stored evidence already exists at that hash"
        ) from None
    except BlobError:
        raise HTTPException(500, "That file could not be stored") from None

    logger.info(
        "Passport evidence stored: passport=%s bytes=%d type=%s",
        row.id,
        attachment.size_bytes,
        media_type,
    )

    return EvidenceUploadOut(
        hash=attachment.hash,
        filename=attachment.filename,
        size_bytes=attachment.size_bytes,
        media_type=attachment.media_type,
    )


@passport_router.post(
    "/{passport_id}/certificates",
    response_model=RecordResultOut,
    status_code=201,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def add_certificate(
    passport_id: str,
    body: CertificateIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
    blobs: BlobStore | GcsBlobStore = _DEP_BLOBS,
) -> RecordResultOut:
    """File a certificate the holder is claiming.

    Self-declared, with nobody countersigning. A certificate may relate
    to several competencies at once, which is why they are filed flat
    rather than under one.
    """
    row = _require_writer(db, passport_id, user, store)

    # The service's generator, not a second one: the monotonic guarantee
    # holds per instance, so two would each be monotonic alone and could
    # still issue ids that interleave.
    certificate = Certificate(
        id=service.next_id(),
        title=body.title,
        issuer=body.issuer,
        awarded_on=body.awarded_on,
        expires_on=body.expires_on,
        competencies=_offered_refs(store, row.id, body.competencies),
        description=body.description,
        attachments=_attachments(blobs, row.id, body.attachments),
    )

    name, commit = records.add_certificate(
        store, row.id, _actor(user), certificate
    )
    row.head_commit = commit
    db.flush()

    return RecordResultOut(name=name, commit=commit)


@passport_router.get(
    "/{passport_id}/certificates",
    response_model=list[CertificateOut],
    dependencies=[_DEP_PASSPORT],
)
def list_certificates(
    passport_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> list[CertificateOut]:
    """Every certificate in the passport."""
    row = _require_reader(db, passport_id, user)

    found: list[CertificateOut] = []

    for entry in store.list_dir(row.id, paths.CERTIFICATES):
        name = entry.name
        raw = store.read(row.id, paths.certificate_file(name))
        certificate = from_yaml(Certificate, raw)
        found.append(
            CertificateOut.model_validate(
                {"name": name, **certificate.model_dump(mode="json")}
            )
        )

    return found


@passport_router.patch(
    "/{passport_id}/certificates/{name}",
    response_model=RecordResultOut,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def amend_certificate(
    passport_id: str,
    name: str,
    body: CertificateIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
    blobs: BlobStore | GcsBlobStore = _DEP_BLOBS,
) -> RecordResultOut:
    """Correct a certificate.

    The folder name does not change even when the title or date does: it
    is the handle the index refers to, and renaming would orphan every
    reference to it.

    **Attachments are replaced only when the request names them.** A
    body with an ``attachments`` field, empty or not, is the holder
    changing the file: an empty list takes it away, and a new one
    replaces it. A body without the field keeps what the certificate
    has, so an older client correcting a date cannot delete the file by
    leaving it out. Until 29 September 2026 the file could not be
    changed at all once recorded.
    """
    row = _require_writer(db, passport_id, user, store)
    existing = _existing_certificate(store, row.id, name)

    attachments = (
        _attachments(blobs, row.id, body.attachments)
        if "attachments" in body.model_fields_set
        else existing.attachments
    )

    certificate = Certificate(
        id=existing.id,
        title=body.title,
        issuer=body.issuer,
        awarded_on=body.awarded_on,
        expires_on=body.expires_on,
        competencies=_competency_refs(body.competencies),
        description=body.description,
        attachments=attachments,
    )

    commit = records.amend_certificate(
        store, row.id, _actor(user), name, certificate
    )
    row.head_commit = commit
    db.flush()

    return RecordResultOut(name=name, commit=commit)


# api-schema-check: allow-opaque-permanent
@passport_router.get(
    "/{passport_id}/certificates/{name}/attachments/{blob_digest}",
    dependencies=[_DEP_PASSPORT],
    response_class=Response,
    responses={
        200: {
            "content": {
                media_type: {} for media_type in ALLOWED_EVIDENCE_TYPES
            }
        }
    },
)
def get_certificate_attachment(
    passport_id: str,
    name: str,
    blob_digest: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
    blobs: BlobStore | GcsBlobStore = _DEP_BLOBS,
) -> Response:
    """One file attached to a certificate, to show on its page.

    **Reached through the certificate, not by hash alone.** The record
    is what says a file belongs to it and what kind of file it is: the
    blob store keeps bytes and nothing else. So a hash the certificate
    does not name is a 404 even where the bytes exist, and the type sent
    is the one checked at upload, never a guess from the bytes.

    Holder only, as every certificate route is. Sent ``inline`` so the
    page can show it, with ``nosniff`` so a browser cannot decide an
    image is something else, and ``private`` so no shared cache keeps a
    copy.
    """
    row = _require_holder(db, passport_id, user)
    certificate = _existing_certificate(store, row.id, name)

    attachment = next(
        (item for item in certificate.attachments if item.hash == blob_digest),
        None,
    )
    if attachment is None or attachment.media_type not in (
        ALLOWED_EVIDENCE_TYPES
    ):
        raise HTTPException(404, "Attachment not found")

    try:
        data = blobs.get(row.id, attachment.hash)
    except BlobNotFoundError:
        raise HTTPException(404, "Attachment not found") from None
    except BlobError:
        raise HTTPException(500, "That file could not be read") from None

    return Response(
        content=data,
        media_type=attachment.media_type,
        headers={
            # No filename: the one uploaded may carry a patient
            # identifier, and it must not reach a header any more than a
            # URL.
            "Content-Disposition": "inline",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=3600",
        },
    )


def _existing_certificate(
    store: PassportStore, passport_id: str, name: str
) -> Certificate:
    """Read a certificate, or 404.

    Amending preserves the identifier and the attachments rather than
    letting a caller replace them: the id is what the history refers to,
    and evidence is added through its own route.
    """
    try:
        raw = store.read(passport_id, paths.certificate_file(name))
    except (PassportNotFoundError, paths.PassportPathError):
        raise HTTPException(404, "Certificate not found") from None

    return from_yaml(Certificate, raw)


@passport_router.delete(
    "/{passport_id}/certificates/{name}",
    response_model=RecordResultOut,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def remove_certificate(
    passport_id: str,
    name: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> RecordResultOut:
    """Remove a certificate recorded in error.

    The file goes; the history keeps it, as it keeps everything.
    """
    row = _require_writer(db, passport_id, user, store)

    try:
        commit = records.remove_certificate(store, row.id, _actor(user), name)
    except records.RecordNotFoundError:
        raise HTTPException(404, "Certificate not found") from None

    row.head_commit = commit
    db.flush()

    return RecordResultOut(name=name, commit=commit)


def _ask_a_supervisor(
    db: Session,
    row: Passport,
    holder: User,
    competency_id: str,
    supervisor_email: str | None,
) -> str | None:
    """Email a supervisor asked to confirm a logbook entry, if one is named.

    Everything that can refuse the ask runs here, and the email goes
    last, before the caller writes the entry. So a refusal or a failed
    send leaves nothing behind, as with a sign-off request.

    Returns:
        The address asked, folded to lower case, or ``None`` where the
        holder named nobody.
    """
    if supervisor_email is None:
        return None

    email = supervisor_email.strip().lower()

    if email == holder.email.strip().lower():
        raise HTTPException(400, "You cannot confirm your own logbook entry.")

    if _requests_today(db, row.id) >= INVITES_PER_DAY:
        raise HTTPException(
            429,
            (
                f"You can ask up to {INVITES_PER_DAY} people a day. "
                "Try again tomorrow."
            ),
        )

    supervisor = db.scalar(select(User).where(func.lower(User.email) == email))
    if supervisor is not None:
        _let_existing_account_assess(db, supervisor, row.id, holder)

    _email_sign_off_request(
        holder=holder,
        assessor_email=email,
        assessor=supervisor,
        competency_id=competency_id,
        passport_id=row.id,
        invited_by_user_id=holder.id,
        db=db,
        confirming_logbook=True,
    )

    return email


def _open_confirmation_request(
    db: Session,
    passport_id: str,
    competency_id: str,
    stem: str,
    supervisor_email: str,
) -> None:
    """Record who has been asked to confirm one logbook entry.

    One row per entry. Asking again reopens it for whoever is now named,
    so an entry never has two people asked at once.
    """
    request_row = db.scalar(
        select(PassportLogbookConfirmationRequest).where(
            PassportLogbookConfirmationRequest.passport_id == passport_id,
            PassportLogbookConfirmationRequest.competency_id == competency_id,
            PassportLogbookConfirmationRequest.entry_stem == stem,
        )
    )

    if request_row is None:
        db.add(
            PassportLogbookConfirmationRequest(
                passport_id=passport_id,
                competency_id=competency_id,
                entry_stem=stem,
                supervisor_email=supervisor_email,
            )
        )
        return

    request_row.supervisor_email = supervisor_email
    request_row.supervisor_user_id = None
    request_row.status = "open"
    request_row.created_at = _now()
    request_row.resolved_at = None


def _asked_to_confirm(
    db: Session, passport_id: str
) -> dict[tuple[str, str], str]:
    """Who each logbook entry is still waiting on, by competency and file."""
    rows = db.execute(
        select(
            PassportLogbookConfirmationRequest.competency_id,
            PassportLogbookConfirmationRequest.entry_stem,
            PassportLogbookConfirmationRequest.supervisor_email,
        ).where(
            PassportLogbookConfirmationRequest.passport_id == passport_id,
            PassportLogbookConfirmationRequest.status == "open",
        )
    ).all()

    return {(competency, stem): email for competency, stem, email in rows}


def _logbook_entry_out(
    competency_id: str,
    stem: str,
    entry: LogbookEntry,
    asked: dict[tuple[str, str], str],
) -> LogbookEntryOut:
    """Describe a logbook entry on the wire."""
    return LogbookEntryOut.model_validate(
        {
            "filename": stem,
            "competency": competency_id,
            **entry.model_dump(mode="json"),
            "confirmation_asked_of": asked.get((competency_id, stem)),
        }
    )


def _logbook_scope(
    competency_id: str, scope_id: str | None
) -> ScopeRef | None:
    """The scope a logbook entry names, or none.

    Optional, where a sign-off requires one: an entry is the holder's
    own and can be corrected. But a scope that is named must be one the
    competency declares, since it decides which sign-off the entry is
    counted under.
    """
    if scope_id is None:
        return None

    try:
        return definitions.scope_ref(competency_id, scope_id)
    except definitions.UnknownCompetencyError:
        raise HTTPException(404, "Unknown competency") from None
    except definitions.UnknownScopeError as error:
        # The form offers only the competency's own scopes, so this means
        # the form and the server disagree.
        logger.error("logbook entry refused: %s", error)
        raise HTTPException(
            400, "That is not something this competency is logged under."
        ) from None


@passport_router.post(
    "/{passport_id}/logbook/{competency_id}",
    response_model=RecordResultOut,
    status_code=201,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def add_logbook_entry(
    passport_id: str,
    competency_id: str,
    body: LogbookEntryIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
    blobs: BlobStore | GcsBlobStore = _DEP_BLOBS,
) -> RecordResultOut:
    """Log one procedure against a competency.

    ``performed_on`` carries no time, because nobody recalls whether a
    procedure was at 09:30 or 11:00 when logging five on a Friday
    evening. The filename records when it was written; the clinical date
    lives inside the file.
    """
    row = _require_writer(db, passport_id, user, store)
    _offered_refs(store, row.id, [competency_id])
    scope = _logbook_scope(competency_id, body.scope_id)

    # Before the entry is written, for the reason a sign-off request
    # mails first: an email cannot be unsent, and a failed send must
    # leave nothing behind.
    supervisor_email = _ask_a_supervisor(
        db, row, user, competency_id, body.confirmer_email
    )

    entry = LogbookEntry(
        performed_on=body.performed_on,
        scope=scope,
        setting=body.setting,
        supervision=body.supervision,
        supervisor=body.supervisor,
        indication=body.indication,
        outcome=body.outcome,
        notes=body.notes,
        also_counts_towards=body.also_counts_towards,
        attachments=_attachments(blobs, row.id, body.attachments),
    )

    stem, commit = records.add_logbook_entry(
        store, row.id, _actor(user), competency_id, entry
    )
    row.head_commit = commit
    if supervisor_email is not None:
        _open_confirmation_request(
            db, row.id, competency_id, stem, supervisor_email
        )
    db.flush()

    return RecordResultOut(name=stem, commit=commit)


@passport_router.get(
    "/{passport_id}/logbook",
    response_model=WholeLogbookOut,
    dependencies=[_DEP_PASSPORT],
)
def get_whole_logbook(
    passport_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> WholeLogbookOut:
    """Every logged procedure, grouped by the competency it counts to.

    Declared before ``/{passport_id}/logbook/{competency_id}`` so the
    literal path wins over the parameterised one.

    Which competencies appear is read from the directories on disk
    rather than from the passport index: a competency with logbook
    entries and nothing else is exactly the case this answers, and it
    is the one the index describes least well.

    Groups rather than one flat list, because an entry is about one
    procedure and the competency it counts towards is part of what it
    says. Sorted within each group by the clinical date recorded, as
    the per-competency response is.
    """
    row = _require_reader(db, passport_id, user)
    asked = _asked_to_confirm(db, row.id)

    groups: list[LogbookOut] = []
    total = 0

    for directory in store.list_dir(row.id, paths.LOGBOOK):
        competency_id = directory.name
        entries: list[LogbookEntryOut] = []

        for path in store.list_dir(row.id, directory):
            raw = store.read(row.id, path)
            entry = from_yaml(LogbookEntry, raw)
            entries.append(
                _logbook_entry_out(competency_id, path.stem, entry, asked)
            )

        if not entries:
            continue

        entries.sort(key=lambda item: item.performed_on)
        total += len(entries)
        groups.append(
            LogbookOut(
                competency=competency_id,
                count=len(entries),
                entries=entries,
            )
        )

    groups.sort(key=lambda group: group.competency)

    return WholeLogbookOut(competencies=groups, count=total)


@passport_router.get(
    "/{passport_id}/logbook/{competency_id}",
    response_model=LogbookOut,
    dependencies=[_DEP_PASSPORT],
)
def get_logbook(
    passport_id: str,
    competency_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> LogbookOut:
    """A competency's logbook entries, and how many there are.

    A count and no target, deliberately. Two hundred bronchoscopies
    prove activity, not competence; the sign-off is what turns evidence
    into a conclusion, and this response must not appear to draw it.

    Entries sort by the clinical date they record rather than by
    filename, since the filename is the moment Quill wrote the file.
    """
    row = _require_reader(db, passport_id, user)
    asked = _asked_to_confirm(db, row.id)

    entries: list[LogbookEntryOut] = []

    for path in store.list_dir(row.id, paths.logbook_dir(competency_id)):
        raw = store.read(row.id, path)
        entry = from_yaml(LogbookEntry, raw)
        entries.append(
            _logbook_entry_out(competency_id, path.stem, entry, asked)
        )

    entries.sort(key=lambda item: item.performed_on)

    return LogbookOut(
        competency=competency_id, count=len(entries), entries=entries
    )


@passport_router.patch(
    "/{passport_id}/logbook/{competency_id}/{stem}",
    response_model=RecordResultOut,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def amend_logbook_entry(
    passport_id: str,
    competency_id: str,
    stem: str,
    body: LogbookEntryIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
    blobs: BlobStore | GcsBlobStore = _DEP_BLOBS,
) -> RecordResultOut:
    """Correct a logged procedure.

    Attachments given replace the entry's; none given keeps the ones it
    has. This once wrote an empty list whatever was sent, so correcting
    a date on the edit page, which sends no attachments, would have
    deleted every file attached to the entry.
    """
    row = _require_writer(db, passport_id, user, store)

    try:
        existing = from_yaml(
            LogbookEntry,
            store.read(row.id, paths.logbook_entry(competency_id, stem)),
        )
    except (PassportNotFoundError, paths.PassportPathError):
        raise HTTPException(404, "Logbook entry not found") from None

    scope = _logbook_scope(competency_id, body.scope_id)
    supervisor_email = _ask_a_supervisor(
        db, row, user, competency_id, body.confirmer_email
    )

    # Built afresh from what was sent, so a confirmation on the entry is
    # not carried over: the supervisor confirmed what it said before.
    entry = LogbookEntry(
        performed_on=body.performed_on,
        scope=scope,
        setting=body.setting,
        supervision=body.supervision,
        supervisor=body.supervisor,
        indication=body.indication,
        outcome=body.outcome,
        notes=body.notes,
        also_counts_towards=body.also_counts_towards,
        attachments=(
            _attachments(blobs, row.id, body.attachments)
            if body.attachments
            else existing.attachments
        ),
    )

    try:
        commit = records.amend_logbook_entry(
            store, row.id, _actor(user), competency_id, stem, entry
        )
    except (records.RecordNotFoundError, paths.PassportPathError):
        raise HTTPException(404, "Logbook entry not found") from None

    row.head_commit = commit
    if supervisor_email is not None:
        _open_confirmation_request(
            db, row.id, competency_id, stem, supervisor_email
        )
    db.flush()

    return RecordResultOut(name=stem, commit=commit)


@passport_router.delete(
    "/{passport_id}/logbook/{competency_id}/{stem}",
    response_model=RecordResultOut,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def remove_logbook_entry(
    passport_id: str,
    competency_id: str,
    stem: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> RecordResultOut:
    """Remove a logged procedure recorded in error."""
    row = _require_writer(db, passport_id, user, store)

    try:
        commit = records.remove_logbook_entry(
            store, row.id, _actor(user), competency_id, stem
        )
    except (records.RecordNotFoundError, paths.PassportPathError):
        raise HTTPException(404, "Logbook entry not found") from None

    row.head_commit = commit
    # An ask about an entry that is gone has nothing to open.
    db.execute(
        delete(PassportLogbookConfirmationRequest).where(
            PassportLogbookConfirmationRequest.passport_id == row.id,
            PassportLogbookConfirmationRequest.competency_id == competency_id,
            PassportLogbookConfirmationRequest.entry_stem == stem,
        )
    )
    db.flush()

    return RecordResultOut(name=stem, commit=commit)


@passport_router.post(
    "/{passport_id}/reflections",
    response_model=RecordResultOut,
    status_code=201,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def add_reflection(
    passport_id: str,
    body: ReflectionIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
    blobs: BlobStore | GcsBlobStore = _DEP_BLOBS,
) -> RecordResultOut:
    """Write a reflection.

    Holder-only in both directions: nobody else writes one, and nobody
    else reads one. Written reflection can be disclosed in legal
    proceedings and UK doctors are wary of it for good reason, so the
    narrower default is the safer one.

    The anonymisation confirmation is required rather than defaulted.
    Reflections are written about real cases and are one of only two
    org_units patient data could enter a passport.
    """
    row = _require_writer(db, passport_id, user, store)

    if not body.anonymised_confirmed:
        raise HTTPException(
            400,
            "Confirm the reflection is anonymised before saving it. A "
            "passport holds no patient data.",
        )

    reflection = Reflection(
        title=body.title,
        written_on=body.written_on,
        competencies=_offered_refs(store, row.id, body.competencies),
        attachments=_attachments(blobs, row.id, body.attachments),
    )

    name, commit = records.add_reflection(
        store, row.id, _actor(user), reflection, body.body
    )
    row.head_commit = commit
    db.flush()

    return RecordResultOut(name=name, commit=commit)


@passport_router.get(
    "/{passport_id}/reflections",
    response_model=list[ReflectionOut],
    dependencies=[_DEP_PASSPORT],
)
def list_reflections(
    passport_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> list[ReflectionOut]:
    """Every reflection – holder only.

    ``_require_holder`` rather than ``_require_reader``: an assessor
    named on a request may read the sign-off they were asked about, and
    still may not read a reflection. This is the one record type where a
    reader with legitimate access to the rest is refused.
    """
    row = _require_holder(db, passport_id, user)

    found: list[ReflectionOut] = []

    for entry in store.list_dir(row.id, paths.REFLECTIONS):
        name = entry.name
        raw = store.read(row.id, paths.reflection_file(name))
        reflection, prose = reflection_from_markdown(raw)
        found.append(
            ReflectionOut.model_validate(
                {
                    "name": name,
                    "body": prose,
                    **reflection.model_dump(mode="json"),
                }
            )
        )

    return found


@passport_router.patch(
    "/{passport_id}/reflections/{name}",
    response_model=RecordResultOut,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def amend_reflection(
    passport_id: str,
    name: str,
    body: ReflectionIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
    blobs: BlobStore | GcsBlobStore = _DEP_BLOBS,
) -> RecordResultOut:
    """Rewrite a reflection.

    Attachments given replace the reflection's; none given keeps the
    ones it has, as for a logbook entry. It once wrote an empty list
    whatever was sent, so correcting a title from the edit page would
    have deleted every file attached.
    """
    row = _require_writer(db, passport_id, user, store)

    if not body.anonymised_confirmed:
        raise HTTPException(
            400,
            "Confirm the reflection is anonymised before saving it. A "
            "passport holds no patient data.",
        )

    try:
        existing, _ = reflection_from_markdown(
            store.read(row.id, paths.reflection_file(name))
        )
    except (PassportNotFoundError, paths.PassportPathError):
        raise HTTPException(404, "Reflection not found") from None

    reflection = Reflection(
        title=body.title,
        written_on=body.written_on,
        competencies=_competency_refs(body.competencies),
        attachments=(
            _attachments(blobs, row.id, body.attachments)
            if body.attachments
            else existing.attachments
        ),
    )

    try:
        commit = records.amend_reflection(
            store, row.id, _actor(user), name, reflection, body.body
        )
    except (records.RecordNotFoundError, paths.PassportPathError):
        raise HTTPException(404, "Reflection not found") from None

    row.head_commit = commit
    db.flush()

    return RecordResultOut(name=name, commit=commit)


@passport_router.delete(
    "/{passport_id}/reflections/{name}",
    response_model=RecordResultOut,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def remove_reflection(
    passport_id: str,
    name: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> RecordResultOut:
    """Remove a reflection."""
    row = _require_writer(db, passport_id, user, store)

    try:
        commit = records.remove_reflection(store, row.id, _actor(user), name)
    except (records.RecordNotFoundError, paths.PassportPathError):
        raise HTTPException(404, "Reflection not found") from None

    row.head_commit = commit
    db.flush()

    return RecordResultOut(name=name, commit=commit)


@passport_router.post(
    "/{passport_id}/cpd",
    response_model=RecordResultOut,
    status_code=201,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def add_cpd_entry(
    passport_id: str,
    body: CpdEntryIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
    blobs: BlobStore | GcsBlobStore = _DEP_BLOBS,
) -> RecordResultOut:
    """Record a continuing professional development activity.

    Grouped by year on disk, because UK appraisal runs annually and asks
    what you did this year – the grouping matches how the record is used
    rather than being file management.
    """
    row = _require_writer(db, passport_id, user, store)

    entry = CpdEntry(
        activity_on=body.activity_on,
        title=body.title,
        activity_type=body.activity_type,
        points=body.points,
        competencies=_offered_refs(store, row.id, body.competencies),
        certificate=body.certificate,
        notes=body.notes,
        attachments=_attachments(blobs, row.id, body.attachments),
    )

    stem, commit = records.add_cpd_entry(store, row.id, _actor(user), entry)
    row.head_commit = commit
    db.flush()

    return RecordResultOut(name=stem, commit=commit)


def _cpd_year_out(
    store: PassportStore, passport_id: str, year: int
) -> list[CpdEntryOut]:
    """One year's CPD activities as served, in no particular order.

    Raises:
        paths.PassportPathError: If *year* is not four digits.
    """
    found: list[CpdEntryOut] = []

    for path in store.list_dir(passport_id, paths.cpd_dir(year)):
        raw = store.read(passport_id, path)
        entry = from_yaml(CpdEntry, raw)
        found.append(
            CpdEntryOut.model_validate(
                {
                    "filename": path.stem,
                    "year": year,
                    **entry.model_dump(mode="json"),
                }
            )
        )

    return found


@passport_router.get(
    "/{passport_id}/cpd",
    response_model=list[CpdEntryOut],
    dependencies=[_DEP_PASSPORT],
)
def list_cpd(
    passport_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> list[CpdEntryOut]:
    """Every CPD activity in the record, sorted by when it happened.

    The CPD page totals activities over the holder's own date ranges,
    which cross calendar years, and it must also show what falls outside
    every range. Both need the whole record rather than one year of it.
    """
    row = _require_reader(db, passport_id, user)

    found: list[CpdEntryOut] = []

    for directory in store.list_dir(row.id, paths.CPD):
        # Only year directories. Anything else under cpd/ is not a year
        # this route could address, so it is not an activity either.
        if not (directory.name.isdigit() and len(directory.name) == 4):
            continue
        found.extend(_cpd_year_out(store, row.id, int(directory.name)))

    found.sort(key=lambda item: item.activity_on)

    return found


@passport_router.get(
    "/{passport_id}/cpd/{year}",
    response_model=list[CpdEntryOut],
    dependencies=[_DEP_PASSPORT],
)
def get_cpd_year(
    passport_id: str,
    year: int,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> list[CpdEntryOut]:
    """One year's CPD activities, sorted by when they happened."""
    row = _require_reader(db, passport_id, user)

    try:
        found = _cpd_year_out(store, row.id, year)
    except paths.PassportPathError:
        raise HTTPException(404, "Not a valid year") from None

    found.sort(key=lambda item: item.activity_on)

    return found


@passport_router.patch(
    "/{passport_id}/cpd/{year}/{stem}",
    response_model=RecordResultOut,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def amend_cpd_entry(
    passport_id: str,
    year: int,
    stem: str,
    body: CpdEntryIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
    blobs: BlobStore | GcsBlobStore = _DEP_BLOBS,
) -> RecordResultOut:
    """Correct a CPD activity.

    Attachments given replace the activity's; none given keeps the ones
    it has, as for a logbook entry. It once wrote an empty list whatever
    was sent, so correcting a title from the edit page would have
    deleted every file attached.
    """
    row = _require_writer(db, passport_id, user, store)

    try:
        existing = from_yaml(
            CpdEntry, store.read(row.id, paths.cpd_entry(year, stem))
        )
    except (PassportNotFoundError, paths.PassportPathError):
        raise HTTPException(404, "CPD entry not found") from None

    entry = CpdEntry(
        activity_on=body.activity_on,
        title=body.title,
        activity_type=body.activity_type,
        points=body.points,
        competencies=_competency_refs(body.competencies),
        certificate=body.certificate,
        notes=body.notes,
        attachments=(
            _attachments(blobs, row.id, body.attachments)
            if body.attachments
            else existing.attachments
        ),
    )

    try:
        commit = records.amend_cpd_entry(
            store, row.id, _actor(user), year, stem, entry
        )
    except (records.RecordNotFoundError, paths.PassportPathError):
        raise HTTPException(404, "CPD entry not found") from None

    row.head_commit = commit
    db.flush()

    return RecordResultOut(name=stem, commit=commit)


@passport_router.delete(
    "/{passport_id}/cpd/{year}/{stem}",
    response_model=RecordResultOut,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def remove_cpd_entry(
    passport_id: str,
    year: int,
    stem: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> RecordResultOut:
    """Remove a CPD activity recorded in error."""
    row = _require_writer(db, passport_id, user, store)

    try:
        commit = records.remove_cpd_entry(
            store, row.id, _actor(user), year, stem
        )
    except (records.RecordNotFoundError, paths.PassportPathError):
        raise HTTPException(404, "CPD entry not found") from None

    row.head_commit = commit
    db.flush()

    return RecordResultOut(name=stem, commit=commit)

    # --------------------------------------------------------------------
    # External assessors
    # --------------------------------------------------------------------
    #
    # The holder brings in somebody Quill may never have heard of. Three
    # decisions shape the route below, and each is argued for in the plan:
    #
    # **The token is emailed, never returned.** The response carries the
    # invitation but not the credential, so an invitation can only be
    # redeemed by whoever controls the address it was sent to. Returning it
    # would let a holder pass it on by any route they liked.
    #
    # **Only its hash is stored.** What is emailed is a credential, and a
    # readable copy in the database would let anyone with a row redeem it.
    #
    # **The limit is per holder, not per address.** ``@limiter.limit`` keys
    # on the remote address, which would throttle a hospital's whole NAT and
    # leave a holder free to invite from anywhere else. Counting this
    # passport's own invitations over the last day is the guarantee the plan
    # asks for.

    #: How many assessors one holder may invite in a day. High enough that a
    #: trainee collecting sign-offs across a rotation never meets it, low
    #: enough that a compromised account cannot mail an unbounded number of
    #: addresses in Quill's name. It is a backstop against abuse, not a
    #: quota anybody should feel.


INVITES_PER_DAY = 100


# --------------------------------------------------------------------
# Organisation admins: revoking access
# --------------------------------------------------------------------
#
# **"Admin of the holder's organisation" is two questions, not one.**
# ``manage_users`` says *what* somebody may do and is global; membership
# says *where*. Either alone is wrong – the competency on its own would
# make an admin at one trust an administrator of every assessor in Quill,
# which is the trap ``_require_shared_org_with_user`` exists to close for
# the admin routes in ``main``. Both are required here, in that order.
#
# The admin's authority comes from *membership* of the organisation
# rather than reach into it, so a trainee at a ward does not administer
# the trust above them. The assessor's org_unit is resolved by *reach*,
# because the accept endpoint may have put them at a site.


def _require_org_admin_over(
    db: Session, admin: User, assessor_user_id: int
) -> int:
    """Require that *admin* administers somebody at a shared organisation.

    Returns:
        The org_unit of the organisation the authority runs through, so
        the caller acts at that place and nowhere else.

    Raises:
        HTTPException: 404 if they share no organisation, matching
            ``_require_shared_org_with_user``: the response must not
            confirm that an assessor exists to somebody who may not act
            on them.
    """
    if "manage_users" not in admin.get_final_competencies():
        raise HTTPException(404, "Assessor not found")

    if admin.platform_role == "superadmin":
        shared = get_reachable_org_unit_ids(db, assessor_user_id)
        if shared:
            return shared[0]
        raise HTTPException(404, "Assessor not found")

        # Membership for the admin, reach for the assessor. An admin is an
        # admin of an org_unit they belong to; an assessor put at a ward by the
        # accept endpoint is reachable from the organisation above it.
    admin_orgs = set(get_member_org_unit_ids(db, admin.id))
    assessor_orgs = set(get_reachable_org_unit_ids(db, assessor_user_id))
    shared_ids = sorted(admin_orgs & assessor_orgs)

    if not shared_ids:
        raise HTTPException(404, "Assessor not found")

    return shared_ids[0]


@passport_router.delete(
    "/assessors/{assessor_user_id}/membership",
    response_model=AssessorRevokeOut,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def revoke_assessor_membership(
    assessor_user_id: int,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> AssessorRevokeOut:
    """Remove an assessor's membership at this admin's organisation.

    Which takes ``assess_clinician_passport`` at that org_unit with it,
    since competencies are granted per org_unit.

    **The sign-offs they already made stand**, and the count is returned
    so an admin sees that stated rather than having to trust it. A record
    of who assessed somebody is not undone by that person later losing
    their access – the assessment happened.
    """
    organisation_org_unit_id = _require_org_admin_over(
        db, user, assessor_user_id
    )

    if assessor_user_id == user.id:
        raise HTTPException(400, "You cannot revoke your own access this way.")

    sign_offs_kept = (
        db.scalar(
            select(func.count())
            .select_from(PassportSignOffRequest)
            .where(
                PassportSignOffRequest.assessor_user_id == assessor_user_id,
                PassportSignOffRequest.status == "signed_off",
            )
        )
        or 0
    )

    # Only an ``external`` membership is removable here. Revoking a
    # ``staff`` row would let a passport route quietly sack somebody from
    # the trust they actually work for.
    #
    # Anywhere in the admin's org_unit or beneath it, of any kind. Which
    # org_unit an assessor joins is chosen without regard to its type, so
    # finding it is too. The lowest id, as joining chooses.
    within = {organisation_org_unit_id} | descendant_ids(
        db, [organisation_org_unit_id]
    )
    held_at = db.scalar(
        select(org_unit_member.c.org_unit_id)
        .where(
            org_unit_member.c.user_id == assessor_user_id,
            org_unit_member.c.capacity == "external",
            org_unit_member.c.org_unit_id.in_(within),
        )
        .order_by(org_unit_member.c.org_unit_id)
    )

    if held_at is None:
        raise HTTPException(
            404, "That person has no external assessor access here."
        )

    remove_org_unit_member(db, int(held_at), assessor_user_id)
    db.flush()

    return AssessorRevokeOut(
        user_id=assessor_user_id,
        org_unit_id=int(held_at),
        sign_offs_kept=int(sign_offs_kept),
    )

    # --------------------------------------------------------------------
    # Accepting an invitation
    # --------------------------------------------------------------------
    #
    # **These two routes are deliberately outside the feature gate.** Every
    # other route here hangs off ``requires_feature("passport")``, which
    # resolves through organisation membership – and somebody accepting an
    # invitation has no account, no organisation and no membership yet.
    # Gating them would make the invitation impossible to accept, which is
    # the sort of circular dependency that is obvious once seen and
    # invisible in review. They are their own router for that reason, and
    # it is mounted alongside the gated one.
    #
    # What stands in for the gate is the token: it is signed, it expires,
    # and it names the invitation row. Nothing here trusts a path parameter.


passport_public_router = APIRouter(
    prefix="/passport",
    tags=["passport"],
)


def _decoded_invite(
    db: Session, token: str
) -> tuple[PassportAssessorInvite, str]:
    """The invitation a token names, with the email it was sent to.

    Raises:
        HTTPException: 400 if the token is unreadable, expired, or names
            an invitation that no longer exists. One message for all
            three: a caller holding a bad token learns only that it is
            bad, never whether a given invitation exists.
    """
    from jose import JWTError

    try:
        payload = decode_passport_invite_token(token)
    except JWTError:
        raise HTTPException(
            400, "This invitation link is not valid or has expired."
        ) from None

    invite = db.get(PassportAssessorInvite, str(payload.get("invite_id", "")))

    if invite is None:
        raise HTTPException(
            400, "This invitation link is not valid or has expired."
        ) from None

        # The token carries its own expiry and ``jwt.decode`` has already
        # enforced it. The row is checked as well, because the row is what
        # an administrator can see and reason about, and the two must not be
        # able to disagree.
    if _as_utc(invite.expires_at) <= _now():
        raise HTTPException(
            400, "This invitation link is not valid or has expired."
        )

    return invite, str(payload["email"])


def _holder_org_unit(db: Session, passport_id: str) -> int:
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
        HTTPException: 409 if the holder belongs nowhere. Nothing can be
            derived then, and inventing an org_unit would be worse than
            saying so.
    """
    passport = db.get(Passport, passport_id)

    if passport is None:
        raise HTTPException(400, "This invitation is no longer valid.")

    member_ids = sorted(
        int(row)
        for row in db.execute(
            select(org_unit_member.c.org_unit_id).where(
                org_unit_member.c.user_id == passport.user_id
            )
        )
        .scalars()
        .all()
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

    raise HTTPException(
        409,
        (
            "The clinician who invited you does not belong anywhere on "
            "Quill, so there is nowhere to add you."
        ),
    )


def _competency_name_or_none(competency_id: str | None) -> str | None:
    """The competency's display name, or nothing.

    Nothing covers three cases that are all ordinary: an invitation
    raised without a request behind it, one written before the column
    existed, and an id the catalogue has since retired.
    """
    if competency_id is None:
        return None

    try:
        return definitions.competency_ref(competency_id).name
    except definitions.UnknownCompetencyError:
        return None


@passport_public_router.get(
    "/assessor-invites/preview",
    response_model=InvitePreviewOut,
)
def preview_assessor_invite(
    token: str,
    db: Session = _DEP_SESSION,
) -> InvitePreviewOut:
    """What an invitation says, without accepting it.

    Opening a link is not accepting it, and this route is what makes
    that true: it may be called as often as the assessor likes for the
    full fourteen days. An assessor who opens it between clinics and
    closes the tab, or who starts registering and is interrupted, comes
    back to exactly this.
    """
    invite, email = _decoded_invite(db, token)

    holder = db.get(Passport, invite.passport_id)
    holder_user = db.get(User, holder.user_id) if holder else None

    existing = db.scalar(
        select(User).where(User.email == normalise_email(email))
    )

    return InvitePreviewOut(
        holder_name=(
            (holder_user.full_name or holder_user.username)
            if holder_user
            else "A clinician"
        ),
        # Their account name where they have one, and otherwise the
        # address the invitation went to. The invitation itself carries
        # no name: a trainee asking for a sign-off gives an address and
        # nothing more, so there is nothing to greet them by until they
        # say who they are.
        assessor_name=(
            (existing.full_name or existing.username) if existing else email
        ),
        email=email,
        expires_at=invite.expires_at,
        needs_account=existing is None,
        already_accepted=invite.accepted_at is not None,
        # The words rather than the id, so the page renders without
        # holding the catalogue. An id the catalogue no longer knows
        # yields nothing rather than an error: a retired competency
        # must not stop somebody accepting an invitation.
        competency_name=_competency_name_or_none(invite.competency_id),
    )


@passport_public_router.post(
    "/assessor-invites/accept",
    response_model=AssessorInviteAcceptOut,
)
def accept_assessor_invite(
    body: AssessorInviteAcceptIn,
    db: Session = _DEP_SESSION,
) -> AssessorInviteAcceptOut:
    """Finish registration, which is what consumes the invitation.

    Only this sets ``accepted_at``, and only this is refused a second
    time. The token cannot enforce single use – a JWT carries no record
    of having been spent – so the row does.
    """
    invite, email = _decoded_invite(db, body.token)

    if invite.accepted_at is not None:
        raise HTTPException(
            409,
            (
                "This invitation has already been accepted. "
                "Please sign in instead."
            ),
        )

    existing = db.scalar(
        select(User).where(User.email == normalise_email(email))
    )

    if existing is not None:
        user = existing
        status = "linked"
        # Nothing about an existing account is changed: not their
        # profession, not their competencies. All fourteen clinical
        # professions already carry assess_clinician_passport, and what
        # they may act on is resolved from the request rows naming them.
    else:
        if not body.username or not body.password:
            raise HTTPException(
                422,
                "A username and password are needed to create your account.",
            )

        if len(body.password) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")

        # Stated here rather than taken from the invitation. A trainee
        # asking for a sign-off gives an address and nothing else, so
        # the invitation carries no name or registration to copy – and
        # a number typed by its holder is worth more than one typed by
        # somebody who half-remembered it.
        full_name = (body.full_name or "").strip()
        authority = (body.registration_authority or "").strip()
        number = (body.registration_number or "").strip()

        if not full_name:
            raise HTTPException(
                422, "Your full name is needed to create your account."
            )

        if not authority or not number:
            raise HTTPException(
                422,
                (
                    "Your registering body and registration number are "
                    "needed to create your account."
                ),
            )

        # A body the jurisdiction lists, in its own spelling: `gmc` is
        # taken to mean `GMC`. Anything else is refused here rather than
        # by the model, which would answer with a 500.
        listed = canonical_authority(authority)
        if listed is None:
            raise HTTPException(
                422,
                (
                    "That registering body is not one Quill recognises. "
                    "Choose one of: "
                    + ", ".join(REGISTRATION_AUTHORITIES)
                    + "."
                ),
            )
        authority = listed

        if db.scalar(
            select(User).where(User.username == body.username.strip())
        ):
            raise HTTPException(409, "That username is already taken.")

        user = User(
            username=body.username.strip(),
            email=email,
            full_name=full_name,
            password_hash=hash_password(body.password),
            # The profession is the whole grant: access to the passport
            # and nothing else. No PractisingCompetency row is written,
            # so the clinical authorisation table keeps meaning only
            # clinical things.
            base_profession="passport_external_assessor",
            is_active=True,
            # The invitation went to this address and the token proves
            # they read it, which is the same thing verification asks.
            email_verified=True,
        )
        user.registrations.append(
            ProfessionalRegistration(authority=authority, number=number)
        )
        db.add(user)
        db.flush()
        status = "registered"

    org_unit_id = _holder_org_unit(db, invite.passport_id)
    _join_as_external(db, user.id, org_unit_id)

    invite.accepted_at = _now()
    invite.accepted_user_id = user.id
    db.flush()

    return AssessorInviteAcceptOut(
        status=status,
        user_id=user.id,
        org_unit_id=org_unit_id,
    )


# ------------------------------------------------------------------
# Export
# ------------------------------------------------------------------
#
# All three are holder-only. The zip copies the canonical files
# byte-for-byte, reflections among them, so it could never be anything
# else. The Markdown and the PDF could in principle be read by a named
# assessor, but an export is the holder taking their record away, and a
# route that hands somebody else a whole passport in one call is not
# something to add for the sake of symmetry with the per-record reads.
#
# Reflections are the reason the Markdown takes a parameter. `render()`
# defaults them off because a rendering handed to a panel or an employer
# must not carry one by accident, and written reflection can be
# disclosed in legal proceedings. The holder may ask for them; nothing
# else does it for them.


def _export_filename(passport_id: str, suffix: str) -> str:
    """A download name that says what the file is.

    The passport id rather than the holder's name: a downloads folder is
    not an org_unit to scatter somebody's name, and the id is what the
    record is addressed by everywhere else.
    """
    return f"passport-{passport_id}{suffix}"


# api-schema-check: allow-opaque-permanent
@passport_router.get(
    "/{passport_id}/export.md",
    dependencies=[_DEP_PASSPORT],
    response_class=Response,
    responses={200: {"content": {"text/markdown": {}}}},
)
def export_markdown(
    passport_id: str,
    reflections: bool = Query(
        default=False,
        description=(
            "Include the holder's reflections. Off unless asked for: a "
            "rendering shown to a panel or an employer must not carry "
            "one by accident."
        ),
    ),
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> Response:
    """The whole passport as Markdown, for reading rather than parsing."""
    row = _require_holder(db, passport_id, user)

    try:
        text = render.render(store, row.id, include_reflections=reflections)
    except PassportNotFoundError:
        raise HTTPException(404, "Passport not found") from None

    return Response(
        content=text,
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": (
                "attachment; filename=" f'"{_export_filename(row.id, ".md")}"'
            )
        },
    )


# api-schema-check: allow-opaque-permanent
@passport_router.get(
    "/{passport_id}/export.pdf",
    dependencies=[_DEP_PASSPORT],
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
def export_pdf(
    passport_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> Response:
    """The whole passport as a PDF.

    Never carries reflections – `render_pdf` excludes them by design and
    says so on the page, so a holder handing this to a panel is not
    relying on having remembered a parameter.
    """
    row = _require_holder(db, passport_id, user)

    try:
        data = pdf.render_pdf(store, row.id, head_commit=row.head_commit)
    except PassportNotFoundError:
        raise HTTPException(404, "Passport not found") from None

    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                "attachment; filename=" f'"{_export_filename(row.id, ".pdf")}"'
            )
        },
    )


# api-schema-check: allow-opaque-permanent
@passport_router.get(
    "/{passport_id}/export.zip",
    dependencies=[_DEP_PASSPORT],
    response_class=Response,
    responses={200: {"content": {"application/zip": {}}}},
)
def export_bundle(
    passport_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> Response:
    """The portable bundle: the record, the renderings and the history.

    The artefact a registrar carries between trusts, and the only export
    that contains the canonical files themselves – reflections included,
    copied byte-for-byte. Holder-only for that reason above all.
    """
    row = _require_holder(db, passport_id, user)

    try:
        data = export.build_bundle(
            store,
            row.id,
            requested_by=str(user.id),
            head_commit=row.head_commit,
        )
    except PassportNotFoundError:
        raise HTTPException(404, "Passport not found") from None

    return Response(
        content=data,
        media_type="application/zip",
        headers={
            "Content-Disposition": (
                "attachment; filename=" f'"{_export_filename(row.id, ".zip")}"'
            )
        },
    )


def _now() -> datetime:
    """The current moment, isolated so tests can see one clock."""
    return datetime.now(UTC)


def _as_utc(moment: datetime) -> datetime:
    """A stored timestamp as an aware UTC one.

    Postgres hands back what it was given, but SQLite has no timezone
    type and drops the offset, so a column declared
    ``DateTime(timezone=True)`` reads back naive under the unit suite.
    Comparing that against ``_now()`` raises rather than returning a
    wrong answer, which is the good version of this bug – but it still
    has to be handled, and assuming UTC is safe because UTC is the only
    thing ever written.
    """
    if moment.tzinfo is None:
        return moment.replace(tzinfo=UTC)

    return moment.astimezone(UTC)

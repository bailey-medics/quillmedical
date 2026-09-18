"""HTTP routes for the clinician passport.

The boundary between the web and the record. Everything below this line
is authorisation and translation; the writing itself belongs to
:mod:`.service` and :mod:`.records`, which know nothing about requests.

Four rules hold across every route here, and each is a decision the plan
argues for rather than a convention:

**Authorisation is resolved before storage is touched.** Every route
establishes the caller's relationship to the passport — holder, a named
assessor, or an admin of the holder's organisation — as a guard clause,
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
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_core_db
from app.deps import has_competency
from app.email_send import EmailRateLimitError, send_email
from app.features.gating import requires_feature
from app.models import (
    OrgUnit,
    User,
    org_unit_member,
)
from app.org_units.tree import descendant_ids
from app.org_units.types import ROOT_TYPE_IDS
from app.organisations import (
    add_place_member,
    get_member_place_ids,
    get_reachable_place_ids,
    organisation_place_member,
    remove_place_member,
)
from app.passport_storage import get_blob_store, get_passport_store
from app.schemas.passport import (
    AssessorInviteAcceptIn,
    AssessorInviteAcceptOut,
    AssessorInviteIn,
    AssessorInviteOut,
    AssessorRevokeOut,
    AttachmentIn,
    CertificateIn,
    CertificateOut,
    CompetencyStateOut,
    CpdEntryIn,
    CpdEntryOut,
    EvidenceUploadOut,
    InboxItemOut,
    InvitePreviewOut,
    LogbookEntryIn,
    LogbookEntryOut,
    LogbookOut,
    PassportDetailOut,
    PassportOut,
    RecordResultOut,
    ReflectionIn,
    ReflectionOut,
    RegistrationOut,
    RegistrationVerificationOut,
    RegistrationVerifyIn,
    SignOffDeclineIn,
    SignOffIn,
    SignOffOut,
    SignOffRequestIn,
    SignOffResultOut,
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
    hashing,
    ids,
    paths,
    pdf,
    records,
    render,
    service,
)
from .blobs import (
    BlobConflictError,
    BlobError,
    BlobStore,
)
from .commits import Actor
from .gcs_store import GcsBlobStore
from .models import (
    AssessorRegistrationVerification,
    Passport,
    PassportAssessorInvite,
    PassportSignOffRequest,
)
from .schemas import (
    Attachment,
    Certificate,
    CompetencyRef,
    CpdEntry,
    Index,
    LogbookEntry,
    Profile,
    Reflection,
    SignOff,
)
from .serialise import from_yaml, reflection_from_markdown
from .store import PassportNotFoundError, PassportStore

logger = logging.getLogger(__name__)

passport_router = APIRouter(
    prefix="/passport",
    tags=["passport"],
    dependencies=[Depends(requires_feature("passport"))],
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
_DEP_PASSPORT = Depends(has_competency("access_clinician_passport"))
_DEP_STORE = Depends(get_passport_store)
_DEP_BLOBS = Depends(get_blob_store)

#: What evidence may be. Deliberately short: a scan, a photograph of a
#: logbook page, or a PDF of a course certificate is what this is for.
#: `blobs.py` decides none of this on purpose — storing is separate from
#: admitting — so the allow-list lives at the boundary that admits.
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
#: check when the header is absent — so a chunked request would
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
    because nothing executes or serves these bytes by path — a blob is
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

    ``professional_registrations`` is free-form JSON, so anything
    unexpected is skipped rather than raising: a malformed registration
    must not stop somebody recording clinical work.
    """
    raw = user.professional_registrations or {}

    if not isinstance(raw, dict):
        return []

    found: list[str] = []

    for body, number in raw.items():
        if isinstance(body, str) and isinstance(number, str | int):
            found.append(f"{body} {number}")

    return found


def _registration_dicts(user: User) -> list[dict[str, object]]:
    """Registrations as the record model stores them.

    Always ``verified: false`` here. Quill checks no register, and an
    organisation admin flips the flag by hand after checking one — so a
    sign-off records what was declared, never implying more.
    """
    raw = user.professional_registrations or {}

    if not isinstance(raw, dict):
        return []

    return [
        {"body": body, "number": str(number), "verified": False}
        for body, number in raw.items()
        if isinstance(body, str) and isinstance(number, str | int)
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


def _require_reader(db: Session, passport_id: str, user: User) -> Passport:
    """Require that the caller may read this passport.

    The holder, or somebody named on a request against it. Organisation
    admins are deliberately not included yet: how "admin of the holder's
    organisation" is evaluated is being settled by the org-scoped access
    plan, and inventing a scope here that that plan then changes would be
    worse than leaving the narrower rule in place.
    """
    row = _passport_row(db, passport_id)

    if row.user_id == user.id:
        return row

    if _is_named_assessor(db, passport_id, user):
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
                verified=registration.verified,
                verified_by=registration.verified_by,
                verified_on=registration.verified_on,
            )
            for registration in profile.registrations
        ],
        created_at=row.created_at.date(),
        head_commit=row.head_commit,
    )


def _detail(row: Passport, store: PassportStore) -> PassportDetailOut:
    """A passport and every competency it holds evidence for."""
    profile = _read_profile(store, row.id)
    index = _read_index(store, row.id)

    return PassportDetailOut(
        passport=_passport_out(row, profile),
        competencies=[
            CompetencyStateOut.model_validate(entry.model_dump(mode="json"))
            for entry in index.competencies
        ],
    )


@passport_router.post(
    "",
    response_model=PassportOut,
    status_code=201,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def create_passport(
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> PassportOut:
    """Create the caller's passport.

    One per person, enforced by a unique constraint on the row as well as
    checked here: a second would mean two records of the same career,
    each incomplete.
    """
    existing = db.scalar(select(Passport).where(Passport.user_id == user.id))

    if existing is not None:
        raise HTTPException(409, "You already have a passport")

    passport_id = ids.new_passport_id()

    # The holder's name comes from the actor, so the profile and the
    # commit trailers cannot disagree about who this passport is for.
    commit = service.create_passport(
        store,
        passport_id,
        _actor(user),
        user_id=str(user.id),
        registrations=list(_registration_dicts(user)),
    )

    row = Passport(id=passport_id, user_id=user.id, head_commit=commit)
    db.add(row)
    db.flush()

    profile = _read_profile(store, passport_id)

    return _passport_out(row, profile)


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

    return _detail(row, store)


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

    return _detail(row, store)


def _requests_today(db: Session, passport_id: str) -> int:
    """How many sign-offs this passport has asked for in the last day.

    Counted for the same reason invitations are, and alongside them:
    asking now sends mail to an address somebody typed, so a limit on
    one and not the other is no limit at all. A rolling twenty-four
    hours, matching :func:`_invites_today` — a calendar day would let
    twice the limit go out either side of midnight.
    """
    since = _now() - timedelta(days=1)

    return (
        db.scalar(
            select(func.count())
            .select_from(PassportSignOffRequest)
            .where(
                PassportSignOffRequest.passport_id == passport_id,
                PassportSignOffRequest.created_at >= since,
            )
        )
        or 0
    )


def _email_sign_off_request(
    *,
    holder: User,
    assessor_email: str,
    assessor: User | None,
    competency_id: str,
    passport_id: str,
    invited_by_user_id: int,
    db: Session,
) -> None:
    """Tell the assessor they have been asked, whoever they are.

    Two cases, one email. Somebody with an account is told to sign in;
    somebody without gets a single-use link to register behind. The link
    is what an invitation row exists for — a token carries no record of
    having been spent, so the row is what makes it single-use.

    **A failure here does not undo the request.** The record is written
    and the row committed before this runs: the holder has asked, and
    that stands whether or not the mail got out. Losing the ask because
    a mail server was briefly unreachable would be worse than an
    assessor who has to be told by other means.
    """
    try:
        competency_name: str | None = definitions.competency_ref(
            competency_id
        ).name
    except definitions.UnknownCompetencyError:
        competency_name = None

    if assessor is not None:
        # They can already sign in, so no invitation and no token: the
        # request is waiting in their inbox when they arrive.
        url = f"{settings.FRONTEND_URL.rstrip('/')}/passport/requests"
        expires_in_days = PASSPORT_INVITE_TTL_DAYS
    else:
        invite = PassportAssessorInvite(
            id=str(uuid.uuid4()),
            passport_id=passport_id,
            invited_by_user_id=invited_by_user_id,
            email=assessor_email,
            # The holder gave an address and nothing else. The assessor
            # states their own name and registration when they accept,
            # which is the more trustworthy source for both.
            name="",
            registration_authority="",
            registration_number="",
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
        url=url,
        expires_in_days=expires_in_days,
    )

    try:
        send_email(
            to=assessor_email,
            subject=message["subject"],
            html_body=message["html_body"],
        )
    except EmailRateLimitError:
        # Deliberately swallowed. See the docstring: the ask is already
        # recorded, and throwing here would roll it back over a mail
        # problem the holder cannot do anything about.
        logger.warning(
            "sign-off request mail not sent: address rate limited",
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
    it may not be the holder — the whole value of the record is a second
    named person accepting accountability.

    **The address need not belong to a Quill account.** That is the
    point: the consultant who observed the work is often at another
    trust, or not on Quill at all. The request is written either way and
    the assessor is emailed; they sign in or register, and the account
    is joined to the request when they sign.
    """
    row = _require_holder(db, passport_id, user)

    assessor_email = body.assessor_email.strip().lower()

    if assessor_email == user.email.strip().lower():
        raise HTTPException(
            400,
            "You cannot ask yourself to sign off your own competency.",
        )

    # The same backstop the invite route carries, for the same reason:
    # this route now sends mail to an address somebody typed, so without
    # it the invite limit is bypassed by asking for sign-offs instead of
    # inviting. Counted together, because to a recipient they are the
    # same unsolicited mail from the same holder.
    if _requests_today(db, row.id) + _invites_today(db, row.id) >= (
        INVITES_PER_DAY
    ):
        raise HTTPException(
            429,
            (
                f"You can ask up to {INVITES_PER_DAY} assessors a day. "
                "Try again tomorrow."
            ),
        )

    try:
        name, commit = service.request_sign_off(
            store,
            row.id,
            _actor(user),
            competency_id=competency_id,
            observed_on=body.observed_on,
            level_id=body.level_id,
            comments=body.comments,
            reflection=body.reflection,
        )
    except definitions.UnknownCompetencyError:
        raise HTTPException(404, "Unknown competency") from None
    except definitions.UnknownLevelError as error:
        raise HTTPException(400, str(error)) from None
    except service.SignOffError as error:
        raise HTTPException(400, str(error)) from None

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

    # Whether they already have an account decides what the email asks
    # them to do, so it is looked up here — but a missing account is not
    # an error, and the request stands either way.
    assessor = db.scalar(
        select(User).where(func.lower(User.email) == assessor_email)
    )

    _email_sign_off_request(
        holder=user,
        assessor_email=assessor_email,
        assessor=assessor,
        competency_id=competency_id,
        passport_id=row.id,
        invited_by_user_id=user.id,
        db=db,
    )

    return SignOffResultOut(name=name, status="requested", commit=commit)


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
    """One sign-off in full, for anyone who may read it."""
    row = _require_reader(db, passport_id, user)

    try:
        record = service.read_sign_off(store, row.id, signoff_id)
    except (PassportNotFoundError, paths.PassportPathError):
        raise HTTPException(404, "Sign-off not found") from None

    return _sign_off_out(signoff_id, record)


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
    except definitions.UnknownLevelError as error:
        raise HTTPException(400, str(error)) from None
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
    passport = _require_holder(db, passport_id, user)
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
    row = _require_reader(db, passport_id, user)

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
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> CompetencyStateOut:
    """Where one competency stands.

    Reports what the latest record says and draws no conclusion. An
    expired sign-off still reports ``signed_off``: what a lapsed
    sign-off implies is a clinical decision that has not been made, so
    the expiry date is returned for a person to judge.
    """
    row = _require_reader(db, passport_id, user)
    index = _read_index(store, row.id)

    for entry in index.competencies:
        if entry.id == competency_id:
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
    # and corrected only by superseding it — the difference follows from who
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
    is the same lie the sniff at upload exists to refuse — just told one
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
    checksum tool — so the address cannot be computed without reading
    every byte. That rules out the signed-URL pattern the teaching
    videos use, where the browser uploads straight to the bucket: a
    video is addressed by a generated id, so nobody has to look inside
    it.

    Uploading the same file twice yields the same hash and stores one
    copy, so an interrupted upload is retried rather than reconciled.
    """
    row = _require_holder(db, passport_id, user)

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
    row = _require_holder(db, passport_id, user)

    # The service's generator, not a second one: the monotonic guarantee
    # holds per instance, so two would each be monotonic alone and could
    # still issue ids that interleave.
    certificate = Certificate(
        id=service.next_id(),
        title=body.title,
        issuer=body.issuer,
        awarded_on=body.awarded_on,
        expires_on=body.expires_on,
        competencies=_competency_refs(body.competencies),
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
) -> RecordResultOut:
    """Correct a certificate.

    The folder name does not change even when the title or date does: it
    is the handle the index refers to, and renaming would orphan every
    reference to it.
    """
    row = _require_holder(db, passport_id, user)
    existing = _existing_certificate(store, row.id, name)

    certificate = Certificate(
        id=existing.id,
        title=body.title,
        issuer=body.issuer,
        awarded_on=body.awarded_on,
        expires_on=body.expires_on,
        competencies=_competency_refs(body.competencies),
        description=body.description,
        attachments=existing.attachments,
    )

    commit = records.amend_certificate(
        store, row.id, _actor(user), name, certificate
    )
    row.head_commit = commit
    db.flush()

    return RecordResultOut(name=name, commit=commit)


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
    row = _require_holder(db, passport_id, user)

    try:
        commit = records.remove_certificate(store, row.id, _actor(user), name)
    except records.RecordNotFoundError:
        raise HTTPException(404, "Certificate not found") from None

    row.head_commit = commit
    db.flush()

    return RecordResultOut(name=name, commit=commit)


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
    row = _require_holder(db, passport_id, user)
    _competency_refs([competency_id])

    entry = LogbookEntry(
        performed_on=body.performed_on,
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

    groups: list[LogbookOut] = []
    total = 0

    for directory in store.list_dir(row.id, paths.LOGBOOK):
        competency_id = directory.name
        entries: list[LogbookEntryOut] = []

        for path in store.list_dir(row.id, directory):
            raw = store.read(row.id, path)
            entry = from_yaml(LogbookEntry, raw)
            entries.append(
                LogbookEntryOut.model_validate(
                    {
                        "filename": path.stem,
                        "competency": competency_id,
                        **entry.model_dump(mode="json"),
                    }
                )
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

    entries: list[LogbookEntryOut] = []

    for path in store.list_dir(row.id, paths.logbook_dir(competency_id)):
        raw = store.read(row.id, path)
        entry = from_yaml(LogbookEntry, raw)
        entries.append(
            LogbookEntryOut.model_validate(
                {
                    "filename": path.stem,
                    "competency": competency_id,
                    **entry.model_dump(mode="json"),
                }
            )
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
) -> RecordResultOut:
    """Correct a logged procedure."""
    row = _require_holder(db, passport_id, user)

    entry = LogbookEntry(
        performed_on=body.performed_on,
        setting=body.setting,
        supervision=body.supervision,
        supervisor=body.supervisor,
        indication=body.indication,
        outcome=body.outcome,
        notes=body.notes,
        also_counts_towards=body.also_counts_towards,
        attachments=[],
    )

    try:
        commit = records.amend_logbook_entry(
            store, row.id, _actor(user), competency_id, stem, entry
        )
    except (records.RecordNotFoundError, paths.PassportPathError):
        raise HTTPException(404, "Logbook entry not found") from None

    row.head_commit = commit
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
    row = _require_holder(db, passport_id, user)

    try:
        commit = records.remove_logbook_entry(
            store, row.id, _actor(user), competency_id, stem
        )
    except (records.RecordNotFoundError, paths.PassportPathError):
        raise HTTPException(404, "Logbook entry not found") from None

    row.head_commit = commit
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
    places patient data could enter a passport.
    """
    row = _require_holder(db, passport_id, user)

    if not body.anonymised_confirmed:
        raise HTTPException(
            400,
            "Confirm the reflection is anonymised before saving it. A "
            "passport holds no patient data.",
        )

    reflection = Reflection(
        title=body.title,
        written_on=body.written_on,
        competencies=_competency_refs(body.competencies),
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
    """Every reflection — holder only.

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
) -> RecordResultOut:
    """Rewrite a reflection."""
    row = _require_holder(db, passport_id, user)

    if not body.anonymised_confirmed:
        raise HTTPException(
            400,
            "Confirm the reflection is anonymised before saving it. A "
            "passport holds no patient data.",
        )

    reflection = Reflection(
        title=body.title,
        written_on=body.written_on,
        competencies=_competency_refs(body.competencies),
        attachments=[],
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
    row = _require_holder(db, passport_id, user)

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
    what you did this year — the grouping matches how the record is used
    rather than being file management.
    """
    row = _require_holder(db, passport_id, user)

    entry = CpdEntry(
        activity_on=body.activity_on,
        title=body.title,
        activity_type=body.activity_type,
        points=body.points,
        competencies=_competency_refs(body.competencies),
        certificate=body.certificate,
        notes=body.notes,
        attachments=_attachments(blobs, row.id, body.attachments),
    )

    stem, commit = records.add_cpd_entry(store, row.id, _actor(user), entry)
    row.head_commit = commit
    db.flush()

    return RecordResultOut(name=stem, commit=commit)


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

    found: list[CpdEntryOut] = []

    try:
        listing = store.list_dir(row.id, paths.cpd_dir(year))
    except paths.PassportPathError:
        raise HTTPException(404, "Not a valid year") from None

    for path in listing:
        raw = store.read(row.id, path)
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
) -> RecordResultOut:
    """Correct a CPD activity."""
    row = _require_holder(db, passport_id, user)

    entry = CpdEntry(
        activity_on=body.activity_on,
        title=body.title,
        activity_type=body.activity_type,
        points=body.points,
        competencies=_competency_refs(body.competencies),
        certificate=body.certificate,
        notes=body.notes,
        attachments=[],
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
    row = _require_holder(db, passport_id, user)

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


def _invites_today(db: Session, passport_id: str) -> int:
    """How many invitations this passport has issued in the last day.

    A rolling twenty-four hours rather than a calendar day: a midnight
    reset would let twice the limit go out either side of it.
    """
    since = _now() - timedelta(days=1)

    return (
        db.scalar(
            select(func.count())
            .select_from(PassportAssessorInvite)
            .where(
                PassportAssessorInvite.passport_id == passport_id,
                PassportAssessorInvite.created_at >= since,
            )
        )
        or 0
    )


@passport_router.post(
    "/{passport_id}/assessor-invites",
    response_model=AssessorInviteOut,
    status_code=201,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def invite_assessor(
    passport_id: str,
    body: AssessorInviteIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> AssessorInviteOut:
    """Invite somebody outside to assess a competency.

    The holder chooses, for the same reason they choose an assessor
    already on Quill: who is appropriate is their judgement and their
    supervisor's. What the route enforces is that it is somebody else,
    and that a holder cannot use Quill to mail an unbounded number of
    strangers.
    """
    row = _require_holder(db, passport_id, user)

    if body.email.strip().lower() == user.email.strip().lower():
        raise HTTPException(
            400,
            "You cannot invite yourself to assess your own competency.",
        )

    competency_name: str | None = None
    if body.competency_id is not None:
        try:
            competency_name = definitions.competency_ref(
                body.competency_id
            ).name
        except definitions.UnknownCompetencyError:
            raise HTTPException(404, "Unknown competency") from None

    if _invites_today(db, row.id) >= INVITES_PER_DAY:
        raise HTTPException(
            429,
            (
                f"You can invite up to {INVITES_PER_DAY} assessors a day. "
                "Try again tomorrow."
            ),
        )

    invite = PassportAssessorInvite(
        id=str(uuid.uuid4()),
        passport_id=row.id,
        invited_by_user_id=user.id,
        email=body.email.strip().lower(),
        name=body.name.strip(),
        registration_authority=body.registration_authority.strip(),
        registration_number=body.registration_number.strip(),
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

    message = email_templates.render_invite(
        assessor_name=invite.name,
        holder_name=user.full_name or user.username,
        competency_name=competency_name,
        url=email_templates.accept_url(settings.FRONTEND_URL, token),
        expires_in_days=PASSPORT_INVITE_TTL_DAYS,
    )

    try:
        send_email(
            to=invite.email,
            subject=message["subject"],
            html_body=message["html_body"],
        )
    except EmailRateLimitError:
        # The row is not written: an invitation whose email never left
        # would sit there looking issued, and spend one of the holder's
        # ten for the day.
        db.rollback()
        raise HTTPException(
            429, "That address has been emailed too often. Try again later."
        ) from None

    return AssessorInviteOut(
        id=invite.id,
        email=invite.email,
        name=invite.name,
        created_at=invite.created_at,
        expires_at=invite.expires_at,
        accepted_at=None,
    )


@passport_router.get(
    "/{passport_id}/assessor-invites",
    response_model=list[AssessorInviteOut],
    dependencies=[_DEP_PASSPORT],
)
def list_assessor_invites(
    passport_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> list[AssessorInviteOut]:
    """The invitations this holder has issued, newest first.

    Holder-only. An invitation names somebody's email address and the
    registration they declared, which is nobody else's business — not
    another assessor's, and not a bystander's.
    """
    row = _require_holder(db, passport_id, user)

    invites = db.scalars(
        select(PassportAssessorInvite)
        .where(PassportAssessorInvite.passport_id == row.id)
        .order_by(PassportAssessorInvite.created_at.desc())
    ).all()

    return [
        AssessorInviteOut(
            id=invite.id,
            email=invite.email,
            name=invite.name,
            created_at=invite.created_at,
            expires_at=invite.expires_at,
            accepted_at=invite.accepted_at,
        )
        for invite in invites
    ]

    # --------------------------------------------------------------------
    # Organisation admins: verifying a registration, and revoking access
    # --------------------------------------------------------------------
    #
    # **"Admin of the holder's organisation" is two questions, not one.**
    # ``manage_users`` says *what* somebody may do and is global; membership
    # says *where*. Either alone is wrong — the competency on its own would
    # make an admin at one trust an administrator of every assessor in Quill,
    # which is the trap ``_require_shared_org_with_user`` exists to close for
    # the admin routes in ``main``. Both are required here, in that order.
    #
    # The admin's authority comes from *membership* of the organisation
    # rather than reach into it, so a trainee at a ward does not administer
    # the trust above them. The assessor's place is resolved by *reach*,
    # because the accept endpoint may have put them at a site.


def _require_org_admin_over(
    db: Session, admin: User, assessor_user_id: int
) -> int:
    """Require that *admin* administers somebody at a shared organisation.

    Returns:
        The place of the organisation the authority runs through, so the
        verification row can record whose assurance it is.

    Raises:
        HTTPException: 404 if they share no organisation, matching
            ``_require_shared_org_with_user``: the response must not
            confirm that an assessor exists to somebody who may not act
            on them.
    """
    if "manage_users" not in admin.get_final_competencies():
        raise HTTPException(404, "Assessor not found")

    if admin.platform_role == "superadmin":
        shared = get_reachable_place_ids(db, assessor_user_id)
        if shared:
            return shared[0]
        raise HTTPException(404, "Assessor not found")

        # Membership for the admin, reach for the assessor. An admin is an
        # admin of a place they belong to; an assessor put at a ward by the
        # accept endpoint is reachable from the organisation above it.
    admin_orgs = set(get_member_place_ids(db, admin.id))
    assessor_orgs = set(get_reachable_place_ids(db, assessor_user_id))
    shared_ids = sorted(admin_orgs & assessor_orgs)

    if not shared_ids:
        raise HTTPException(404, "Assessor not found")

    return shared_ids[0]


@passport_router.post(
    "/assessors/{assessor_user_id}/registration-verification",
    response_model=RegistrationVerificationOut,
    status_code=201,
    dependencies=[_DEP_PASSPORT, _DEP_REQUIRE_CSRF],
)
def verify_assessor_registration(
    assessor_user_id: int,
    body: RegistrationVerifyIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> RegistrationVerificationOut:
    """Record that an admin checked a registration against its register.

    By hand in phase 1: Quill queries no register, so this records a
    human act rather than an automated lookup, and the record says so.

    **It does not reach back into sign-offs already written.** A sign-off
    is a snapshot of what was known at the moment of signing, and the
    flag applies to those signed after this point. Rewriting the earlier
    ones would make the record claim a check that had not happened when
    it was signed.
    """
    place_id = _require_org_admin_over(db, user, assessor_user_id)

    assessor = db.get(User, assessor_user_id)

    if assessor is None or not assessor.is_active:
        raise HTTPException(404, "Assessor not found")

    authority = body.registration_authority.strip()
    number = body.registration_number.strip()

    declared = assessor.professional_registrations or {}

    # The number must be one they actually declared. Verifying a number
    # the assessor never gave would record a check of something Quill
    # has no reason to associate with them.
    if (
        not isinstance(declared, dict)
        or str(declared.get(authority, "")) != number
    ):
        raise HTTPException(
            400,
            (
                "That registration is not one this assessor declared, so "
                "there is nothing to verify."
            ),
        )

    existing = db.scalar(
        select(AssessorRegistrationVerification).where(
            AssessorRegistrationVerification.user_id == assessor_user_id,
            AssessorRegistrationVerification.registration_authority
            == authority,
            AssessorRegistrationVerification.registration_number == number,
            AssessorRegistrationVerification.org_unit_id == place_id,
        )
    )

    if existing is not None:
        # Re-checking is an update of when it was last confirmed rather
        # than a second fact, so the row moves instead of multiplying.
        existing.verified_by_user_id = user.id
        existing.verified_at = _now()
        row = existing
    else:
        row = AssessorRegistrationVerification(
            user_id=assessor_user_id,
            registration_authority=authority,
            registration_number=number,
            verified_by_user_id=user.id,
            org_unit_id=place_id,
        )
        db.add(row)

    db.flush()

    return RegistrationVerificationOut(
        user_id=assessor_user_id,
        registration_authority=authority,
        registration_number=number,
        verified_by_name=user.full_name or user.username,
        verified_at=_as_utc(row.verified_at),
        org_unit_id=place_id,
    )


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

    Which takes ``access_clinician_passport`` at that place with it,
    since competencies are granted per place.

    **The sign-offs they already made stand**, and the count is returned
    so an admin sees that stated rather than having to trust it. A record
    of who assessed somebody is not undone by that person later losing
    their access — the assessment happened.
    """
    organisation_place_id = _require_org_admin_over(db, user, assessor_user_id)

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

    # A site membership first: the accept endpoint prefers the narrowest
    # place, so that is where an invited assessor usually sits.
    site_id = db.scalar(
        select(org_unit_member.c.org_unit_id).where(
            org_unit_member.c.user_id == assessor_user_id,
            org_unit_member.c.capacity == "external",
            org_unit_member.c.org_unit_id.in_(
                descendant_ids(db, [organisation_place_id])
            ),
        )
    )

    if site_id is not None:
        db.execute(
            org_unit_member.delete().where(
                org_unit_member.c.org_unit_id == site_id,
                org_unit_member.c.user_id == assessor_user_id,
            )
        )
        db.flush()

        return AssessorRevokeOut(
            user_id=assessor_user_id,
            place="site",
            place_id=int(site_id),
            sign_offs_kept=int(sign_offs_kept),
        )

        # Only an ``external`` membership is removable here. Revoking a
        # ``staff`` row would let a passport route quietly sack somebody from
        # the trust they actually work for.
        #
        # Looked up before deleting rather than by inspecting the delete's
        # result: ``rowcount`` belongs to the cursor rather than to what
        # ``Session.execute`` is typed to return, and a select says what is
        # meant anyway.
    external = db.scalar(
        select(organisation_place_member.c.user_id).where(
            organisation_place_member.c.org_unit_id == organisation_place_id,
            organisation_place_member.c.user_id == assessor_user_id,
            organisation_place_member.c.capacity == "external",
        )
    )

    if external is None:
        raise HTTPException(
            404, "That person has no external assessor access here."
        )

    remove_place_member(db, organisation_place_id, assessor_user_id)
    db.flush()

    return AssessorRevokeOut(
        user_id=assessor_user_id,
        place="organisation",
        place_id=organisation_place_id,
        sign_offs_kept=int(sign_offs_kept),
    )

    # --------------------------------------------------------------------
    # Accepting an invitation
    # --------------------------------------------------------------------
    #
    # **These two routes are deliberately outside the feature gate.** Every
    # other route here hangs off ``requires_feature("passport")``, which
    # resolves through organisation membership — and somebody accepting an
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


def _holder_place(db: Session, passport_id: str) -> tuple[str, int]:
    """Where the assessor should become a member, and at what level.

    The narrowest place the holder belongs to: a site if they have one,
    otherwise the organisation. A holder who sits only at organisation
    level is the ordinary case for a rotating trainee, not an exception.

    Returns:
        ``("site", id)`` or ``("organisation", id)``, both place ids.

    Raises:
        HTTPException: 409 if the holder belongs nowhere. Nothing can be
            derived then, and inventing a place would be worse than
            saying so.
    """
    passport = db.get(Passport, passport_id)

    if passport is None:
        raise HTTPException(400, "This invitation is no longer valid.")

        # A place *inside* an organisation. Organisations are rows in the
        # same table now, and a membership of one is a row here too, so
        # without this every holder would look as though they had a site and
        # the organisation branch below would never be reached.
    site_id = db.scalar(
        select(org_unit_member.c.org_unit_id).where(
            org_unit_member.c.user_id == passport.user_id,
            org_unit_member.c.org_unit_id.in_(
                select(OrgUnit.id).where(OrgUnit.type.notin_(ROOT_TYPE_IDS))
            ),
        )
    )

    if site_id is not None:
        return "site", int(site_id)

    organisation_place_id = db.scalar(
        select(organisation_place_member.c.org_unit_id).where(
            organisation_place_member.c.user_id == passport.user_id
        )
    )

    if organisation_place_id is not None:
        return "organisation", int(organisation_place_id)

    raise HTTPException(
        409,
        (
            "The clinician who invited you does not belong to a site or "
            "organisation, so there is nowhere to add you."
        ),
    )


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

    existing = db.scalar(select(User).where(User.email == email))

    return InvitePreviewOut(
        holder_name=(
            (holder_user.full_name or holder_user.username)
            if holder_user
            else "A clinician"
        ),
        assessor_name=invite.name,
        email=email,
        expires_at=invite.expires_at,
        needs_account=existing is None,
        already_accepted=invite.accepted_at is not None,
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
    time. The token cannot enforce single use — a JWT carries no record
    of having been spent — so the row does.
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

    existing = db.scalar(select(User).where(User.email == email))

    if existing is not None:
        user = existing
        status = "linked"
        # Nothing about an existing account is changed: not their
        # profession, not their competencies. All fourteen clinical
        # professions already carry access_clinician_passport, and what
        # they may act on is resolved from the request rows naming them.
    else:
        if not body.username or not body.password:
            raise HTTPException(
                422,
                "A username and password are needed to create your account.",
            )

        if len(body.password) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")

        if db.scalar(
            select(User).where(User.username == body.username.strip())
        ):
            raise HTTPException(409, "That username is already taken.")

        user = User(
            username=body.username.strip(),
            email=email,
            full_name=invite.name,
            password_hash=hash_password(body.password),
            # The profession is the whole grant: access to the passport
            # and nothing else. No PractisingCompetency row is written,
            # so the clinical authorisation table keeps meaning only
            # clinical things.
            base_profession="external_assessor",
            is_active=True,
            # The invitation went to this address and the token proves
            # they read it, which is the same thing verification asks.
            email_verified=True,
            professional_registrations={
                invite.registration_authority: invite.registration_number
            },
        )
        db.add(user)
        db.flush()
        status = "registered"

    place, place_id = _holder_place(db, invite.passport_id)

    if place == "site":
        already = db.scalar(
            select(org_unit_member.c.user_id).where(
                org_unit_member.c.org_unit_id == place_id,
                org_unit_member.c.user_id == user.id,
            )
        )
        if already is None:
            db.execute(
                org_unit_member.insert().values(
                    org_unit_id=place_id,
                    user_id=user.id,
                    capacity="external",
                )
            )
    else:
        already = db.scalar(
            select(organisation_place_member.c.user_id).where(
                organisation_place_member.c.org_unit_id == place_id,
                organisation_place_member.c.user_id == user.id,
            )
        )
        if already is None:
            add_place_member(db, place_id, user.id, "external")

    invite.accepted_at = _now()
    invite.accepted_user_id = user.id
    db.flush()

    return AssessorInviteAcceptOut(
        status=status,
        user_id=user.id,
        place=place,
        place_id=place_id,
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
    not a place to scatter somebody's name, and the id is what the
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

    Never carries reflections — `render_pdf` excludes them by design and
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
    that contains the canonical files themselves — reflections included,
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
    wrong answer, which is the good version of this bug — but it still
    has to be handled, and assuming UTC is safe because UTC is the only
    thing ever written.
    """
    if moment.tzinfo is None:
        return moment.replace(tzinfo=UTC)

    return moment.astimezone(UTC)

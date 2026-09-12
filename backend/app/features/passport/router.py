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

import logging
import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_core_db
from app.deps import has_competency
from app.features.gating import requires_feature
from app.models import User
from app.passport_storage import get_passport_store
from app.schemas.passport import (
    CompetencyStateOut,
    PassportDetailOut,
    PassportOut,
    RegistrationOut,
    SignOffDeclineIn,
    SignOffIn,
    SignOffOut,
    SignOffRequestIn,
    SignOffResultOut,
    VerificationOut,
)

from . import definitions, hashing, ids, paths, service
from .commits import Actor
from .models import Passport, PassportSignOffRequest
from .schemas import Index, Profile, SignOff
from .serialise import from_yaml
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
        PassportSignOffRequest.assessor_user_id == user.id,
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
    response_model=list[SignOffOut],
    dependencies=[_DEP_PASSPORT],
)
def get_inbox(
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
    store: PassportStore = _DEP_STORE,
) -> list[SignOffOut]:
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
                PassportSignOffRequest.assessor_user_id == user.id,
                PassportSignOffRequest.status == "open",
            )
        )
        .scalars()
        .all()
    )

    found: list[SignOffOut] = []

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

        found.append(_sign_off_out(row.signoff_id, record))

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
    """Ask a named assessor to sign off a competency.

    The holder chooses their assessor, because the judgement about who is
    appropriate sits with them and their supervisor. The one rule is that
    it may not be the holder — the whole value of the record is a second
    named person accepting accountability.
    """
    row = _require_holder(db, passport_id, user)

    if body.assessor_user_id == user.id:
        raise HTTPException(
            400,
            "You cannot ask yourself to sign off your own competency.",
        )

    assessor = db.get(User, body.assessor_user_id)

    if assessor is None or not assessor.is_active:
        raise HTTPException(404, "Assessor not found")

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
            assessor_user_id=assessor.id,
            status="open",
        )
    )
    row.head_commit = commit
    db.flush()

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

    if request_row.assessor_user_id != user.id:
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

    if request_row.assessor_user_id != user.id:
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


def _now() -> datetime:
    """The current moment, isolated so tests can see one clock."""
    return datetime.now(UTC)

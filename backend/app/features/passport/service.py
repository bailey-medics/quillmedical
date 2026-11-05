"""The sign-off lifecycle: request, sign, decline, withdraw, supersede.

Where the two-party act lives. Everything else in a passport is the
holder recording something about themselves; this is the one org_unit a
second named person accepts accountability for a judgement, and the
rules here exist to protect that.

**Two rules, and only two.**

*Self-sign-off is refused, always.* Regardless of competencies held,
seniority, or anything else. The whole value of the record is a second
named person, so a holder signing their own is the one act that must be
impossible rather than merely discouraged.

*The declaration must be confirmed.* Fixed text the assessor reads and
puts their name to, which is what a wet signature has always been. It is
what makes signing a deliberate act rather than a click, and it is
checked here rather than in the interface so no future caller can skip
it.

**Nothing else is enforced.** No eligibility table, no requirement that
a signer holds the competency themselves, no rule about who may assess
whom. Who is fit to assess someone is a clinical judgement that varies
by procedure, department and the people involved, and any rule table
encoding it would be wrong somewhere on the day it shipped. The record
names the assessor, their role and their registration, so a reader can
judge for themselves - exactly as on paper, which prevents none of this
either.

**Progression is not correction.** A second sign-off at a higher level
supersedes nothing: the earlier record was a named consultant's
attestation that something was true at the time, and it was. Only a
``correction`` marks an earlier record superseded.
"""

from __future__ import annotations

import calendar
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

from . import (
    definitions,
    hashing,
    ids,
    index,
    layout,
    paths,
    records,
    serialise,
)
from .commits import Actor, fit_summary
from .commits import build as build_message
from .schemas import (
    SCHEMA_VERSION,
    Assessor,
    Attachment,
    EvidenceSnapshot,
    FrameworkRef,
    Index,
    LevelRef,
    Manifest,
    Profile,
    ScopeRef,
    SignOff,
    SignOffKind,
)
from .store import PassportNotFoundError, PassportStore

if TYPE_CHECKING:
    # A type only. The catalogue module reads the database, and this one
    # must import nothing that does: tests/features_import_boundary_test.py.
    from .catalogue import StoredCatalogue

#: The text an assessor confirms before signing. Fixed, and deliberately
#: not configurable per organisation: a declaration that varied by site
#: would mean a passport's records asserted different things depending on
#: where they were made, which is exactly what portability rules out.
DECLARATION = (
    "I confirm that I have assessed this person as described, that the "
    "level recorded reflects my professional judgement, and that I accept "
    "accountability for this assessment."
)


class SignOffError(Exception):
    """A sign-off could not be made as asked."""


class SelfSignOffError(SignOffError):
    """The holder tried to sign off their own competency.

    Its own type because it is the one hard rule, and a route should be
    able to say so specifically rather than reporting a generic refusal.
    """


class DeclarationNotConfirmedError(SignOffError):
    """The assessor did not confirm the declaration.

    Refused before anything is written, so an unconfirmed attempt leaves
    no trace: a half-made sign-off would be worse than none, because the
    record would exist without the act that gives it meaning.
    """


class LevelReasonMissingError(SignOffError):
    """An assessor changed the level without saying why.

    Signing at a different level from the one asked for is allowed, and
    is ordinary clinical judgement. Doing it without a word is not: the
    holder would find a smaller thing than they asked for with nothing
    to learn from, which is the case the read-only level once guarded
    against.
    """


#: Shown to the holder, so plain English and no ids. The ids go to the
#: logs, where they are what somebody fixing it needs.
LEVEL_REQUIRED_MESSAGE = "Choose the level you are asking to be signed off at."

#: Shown to the holder where a competency is signed off one scope at a
#: time and the request names none.
SCOPE_REQUIRED_MESSAGE = "Choose what this sign-off covers."


class SignOffStateError(SignOffError):
    """The sign-off is not in a state that allows this transition.

    Signing something already signed, withdrawing something already
    declined. Refused rather than applied, because each transition
    asserts something about what happened and applying one out of order
    would record a sequence of events that did not occur.
    """


def create_passport(
    store: PassportStore,
    passport_id: str,
    actor: Actor,
    *,
    user_id: str,
    registrations: list[object] | None = None,
    frameworks: list[FrameworkRef] | None = None,
    now: datetime | None = None,
) -> str:
    """Create a passport with its manifest, profile and empty index.

    Args:
        store: Where passports live.
        passport_id: The new passport's id.
        actor: The holder, who is creating their own.
        user_id: Their Quill user id.
        registrations: Their professional registrations, as declared.
        frameworks: The frameworks they work to, if chosen already.
        now: For tests.

    Returns:
        The first commit id.
    """
    moment = now if now is not None else datetime.now(UTC)

    manifest = Manifest(
        passport_id=passport_id,
        schema_version=SCHEMA_VERSION,
        created_by="Quill Medical",
        created_at=moment.date(),
    )
    profile = Profile(
        user_id=user_id,
        name=actor.name,
        registrations=registrations or [],  # type: ignore[arg-type]
        frameworks=frameworks or [],
    )
    empty = Index(
        schema_version=SCHEMA_VERSION, generated_at=moment, competencies=[]
    )

    from .store import initial_files

    return store.create(
        passport_id,
        initial_files(
            serialise.to_yaml(
                manifest,
                comment="What this passport is. Read alongside README.md.",
            ),
            serialise.to_yaml(
                profile,
                comment=(
                    "Who this passport belongs to. Regenerated when their "
                    "details change."
                ),
            ),
            index.render(empty),
        ),
        build_message("create", "create the passport", actor),
        actor,
    )


def check_scope(
    catalogue: StoredCatalogue, competency_id: str, scope_id: str | None
) -> ScopeRef | None:
    """Refuse a scope a sign-off for this competency cannot carry.

    A scope is required where the competency declares scopes, and
    refused where it declares none: a sign-off that names lung on a
    competency assessed as a whole would claim a distinction nobody
    made.

    Args:
        catalogue: The stored frameworks, read once for the request.
        competency_id: What the holder is asking to be signed off for.
        scope_id: What they say the sign-off covers.

    Returns:
        The scope to record, or ``None`` for a competency with none.

    Raises:
        UnknownCompetencyError: If the competency is not in the catalogue.
        UnknownScopeError: If the scope is not one it declares, or a
            scope was given for a competency that declares none.
        SignOffError: If it declares scopes and none was given.
    """
    if scope_id is not None:
        return definitions.scope_ref(
            catalogue, competency_id, scope_id, offered=True
        )

    if definitions.has_scopes(catalogue, competency_id):
        raise SignOffError(SCOPE_REQUIRED_MESSAGE)

    return None


def check_request(
    catalogue: StoredCatalogue,
    competency_id: str,
    level_id: str | None,
    scope_id: str | None = None,
) -> LevelRef | None:
    """Refuse a sign-off request that could never be saved.

    The route calls this before it emails anybody, since an email cannot
    be unsent: an assessor must never be asked about a request that is
    then refused. :func:`request_sign_off` calls it too, so the two
    cannot drift apart.

    Args:
        catalogue: The stored frameworks, read once for the request.
        competency_id: What the holder is asking to be signed off for.
        level_id: The level they ask for, where the competency has a
            scale.
        scope_id: What they say the sign-off covers, where the
            competency declares scopes.

    Returns:
        The level to record, or ``None`` for a competency with no scale.

    Raises:
        UnknownCompetencyError: If the competency is not in the catalogue.
        UnknownLevelError: If the level is not one it declares, or a
            level was given for a competency with no scale.
        UnknownScopeError: If the scope is not one it declares, or a
            scope was given for a competency that declares none.
        SignOffError: If it has a scale and no level was given, or
            declares scopes and none was given.
    """
    definitions.competency_ref(catalogue, competency_id)
    check_scope(catalogue, competency_id, scope_id)

    if level_id is not None:
        return definitions.level_ref(
            catalogue, competency_id, level_id, offered=True
        )

    if definitions.has_levels(catalogue, competency_id):
        raise SignOffError(LEVEL_REQUIRED_MESSAGE)

    return None


def request_sign_off(
    store: PassportStore,
    passport_id: str,
    holder: Actor,
    *,
    catalogue: StoredCatalogue,
    competency_id: str,
    observed_on: date,
    level_id: str | None = None,
    scope_id: str | None = None,
    comments: str | None = None,
    attachments: list[Attachment] | None = None,
    reflection: str | None = None,
    now: datetime | None = None,
) -> tuple[str, str]:
    """Ask for a sign-off, writing the record the assessor will sign.

    The record exists from the moment of asking, not from the moment of
    signing, so the request is part of the history rather than a row that
    vanishes when resolved.

    Args:
        store: Where passports live.
        passport_id: Whose passport.
        holder: The holder, asking.
        catalogue: The stored frameworks, read once for the request.
        competency_id: What they are asking to be signed off for.
        observed_on: When the work was done.
        level_id: Which level, where the competency has a scale.
        scope_id: What the sign-off covers, where the competency
            declares scopes.
        comments: Anything the holder wants to say.
        attachments: Evidence already stored as blobs.
        reflection: The holder's narrative, written beside the record.
        now: For tests.

    Returns:
        The sign-off folder name and the commit id.

    Raises:
        UnknownCompetencyError: If the competency is not in the catalogue.
        UnknownLevelError: If the level is not one it declares, or a
            level was given for a competency with no scale.
        UnknownScopeError: If the scope is not one it declares, or a
            scope was given for a competency that declares none.
        SignOffError: If a level or a scope is required and none was
            given.
    """
    moment = now if now is not None else datetime.now(UTC)
    competency = definitions.competency_ref(catalogue, competency_id)
    level = check_request(catalogue, competency_id, level_id, scope_id)
    scope = check_scope(catalogue, competency_id, scope_id)

    existing = _existing_for(store, passport_id, competency_id, scope_id)
    kind = _kind_for(catalogue, competency_id, level_id, existing)

    record = SignOff(
        id=_ids.next(moment),
        competency=competency,
        framework_version=definitions.framework_version(
            catalogue, competency_id
        ),
        kind=kind,
        status="requested",
        # Both, for now: until it is signed, what is on the record is
        # what was asked for.
        level=level,
        requested_level=level,
        scope=scope,
        observed_on=observed_on,
        comments=comments,
        attachments=attachments or [],
        evidence=_evidence_snapshot(
            store, passport_id, competency_id, scope_id
        ),
    )

    name = _unique_sign_off_name(
        store, passport_id, competency_id, observed_on, scope_id
    )

    # The catalogue places the competency's first record; any later one
    # goes where the first was filed.
    files: dict[object, str | bytes] = {
        layout.sign_off_file(
            store, passport_id, name, catalogue
        ): serialise.to_yaml(
            record,
            comment=(
                "A requested sign-off. Immutable once signed; corrected "
                "only by superseding it."
            ),
        )
    }

    if reflection is not None:
        files[
            layout.sign_off_reflection(store, passport_id, name, catalogue)
        ] = reflection

    commit = _commit_with_index(
        store,
        passport_id,
        holder,
        "request",
        f"request {competency_id}",
        files,
        competency=competency_id,
        sign_off=name,
        now=moment,
    )

    return name, commit


def sign_off(
    store: PassportStore,
    passport_id: str,
    assessor: Actor,
    *,
    catalogue: StoredCatalogue,
    name: str,
    assessor_user_id: str,
    holder_user_id: str,
    meaning: str,
    declaration_confirmed: bool,
    level_id: str | None = None,
    comments: str | None = None,
    assessment: str | None = None,
    registrations: list[object] | None = None,
    now: datetime | None = None,
) -> str:
    """Sign a requested sign-off.

    Args:
        store: Where passports live.
        passport_id: Whose passport.
        assessor: Who is signing.
        catalogue: The stored frameworks, read once for the request.
        name: Which sign-off folder.
        assessor_user_id: The assessor's Quill user id.
        holder_user_id: The holder's, so self-sign-off can be refused.
        meaning: What kind of act this was.
        declaration_confirmed: Whether they confirmed the declaration.
        level_id: The level reached, where the competency has a scale.
        comments: The assessor's remarks.
        assessment: Their narrative, written beside the record.
        registrations: Their registrations as declared, frozen here.
        now: For tests.

    Returns:
        The commit id.

    Raises:
        SelfSignOffError: If the assessor is the holder.
        DeclarationNotConfirmedError: If the declaration was not
            confirmed. Checked before anything is written.
        SignOffStateError: If the record is not awaiting a signature.
        PassportNotFoundError: If there is no such sign-off.
    """
    # Both guards first, before a single byte is written. An unconfirmed
    # or self-signed attempt must leave no trace at all.
    if assessor_user_id == holder_user_id:
        raise SelfSignOffError(
            "A holder cannot sign off their own competency. The value of "
            "the record is a second named person accepting accountability."
        )

    if not declaration_confirmed:
        raise DeclarationNotConfirmedError(
            "The declaration was not confirmed, so nothing was written. "
            "Confirming it is what makes signing a deliberate act."
        )

    moment = now if now is not None else datetime.now(UTC)
    record = read_sign_off(store, passport_id, name)

    if record.status != "requested":
        raise SignOffStateError(
            f"Sign-off {name} is {record.status!r}, not 'requested', so it "
            "cannot be signed."
        )

    # What was asked for. A record from before `requested_level` existed
    # still holds the request in `level`, since nothing has signed it.
    requested = (
        record.requested_level
        if record.requested_level is not None
        else record.level
    )

    level = record.level

    if level_id is not None:
        level = definitions.level_ref(
            catalogue, record.competency.id, level_id
        )

    changed = (
        level is not None
        and requested is not None
        and level.id != requested.id
    )

    if changed and not (comments and comments.strip()):
        raise LevelReasonMissingError(
            "Say why you are signing off at a different level from the one "
            "asked for. The holder will see your comment beside both levels."
        )

    # From the level signed, not the one asked for: a holder who asked
    # for "unsupervised" and was signed at "direct supervision" has not
    # progressed, whatever the request said. The record being signed is
    # still "requested", so it does not count towards its own kind.
    kind = _kind_for(
        catalogue,
        record.competency.id,
        level.id if level is not None else None,
        _existing_for(
            store,
            passport_id,
            record.competency.id,
            record.scope.id if record.scope is not None else None,
        ),
    )

    expires_on = _expiry(catalogue, record.competency.id, moment.date())

    signed = record.model_copy(
        update={
            "status": "signed_off",
            "kind": kind if record.kind != "correction" else record.kind,
            "level": level,
            "requested_level": requested,
            "signed_at": moment,
            "expires_on": expires_on,
            "meaning": meaning,
            "comments": comments if comments is not None else record.comments,
            "signed_off_by": Assessor(
                user_id=assessor_user_id,
                name=assessor.name,
                role=assessor.role,
                registrations=registrations or [],  # type: ignore[arg-type]
                care_location=assessor.care_location,
            ),
        }
    )

    # The fingerprint covers the signed record, so it is computed last
    # and written into the same file.
    signed = signed.model_copy(
        update={"content_hash": hashing.content_hash(signed)}
    )

    files: dict[object, str | bytes] = {
        layout.sign_off_file(store, passport_id, name): serialise.to_yaml(
            signed,
            comment=(
                "A signed sign-off. Immutable: corrected only by "
                "superseding it with a new record."
            ),
        )
    }

    if assessment is not None:
        files[layout.sign_off_assessment(store, passport_id, name)] = (
            assessment
        )

    return _commit_with_index(
        store,
        passport_id,
        assessor,
        "sign-off",
        f"sign off {record.competency.id}",
        files,
        competency=record.competency.id,
        sign_off=name,
        now=moment,
    )


def decline_sign_off(
    store: PassportStore,
    passport_id: str,
    assessor: Actor,
    *,
    name: str,
    assessor_user_id: str,
    holder_user_id: str,
    reason: str,
    now: datetime | None = None,
) -> str:
    """Decline a requested sign-off.

    Recorded rather than deleted. A record that only showed successes
    would be worth less to everyone reading it.

    Args:
        store: Where passports live.
        passport_id: Whose passport.
        assessor: Who is declining.
        name: Which sign-off folder.
        assessor_user_id: The assessor's user id.
        holder_user_id: The holder's.
        reason: Why. Recorded as the record's comments.
        now: For tests.

    Returns:
        The commit id.

    Raises:
        SelfSignOffError: If the assessor is the holder.
        SignOffStateError: If the record is not awaiting a signature.
    """
    if assessor_user_id == holder_user_id:
        raise SelfSignOffError(
            "A holder cannot decline their own request as its assessor."
        )

    moment = now if now is not None else datetime.now(UTC)
    record = read_sign_off(store, passport_id, name)

    if record.status != "requested":
        raise SignOffStateError(
            f"Sign-off {name} is {record.status!r}, not 'requested', so it "
            "cannot be declined."
        )

    declined = record.model_copy(
        update={"status": "declined", "comments": reason}
    )

    return _commit_with_index(
        store,
        passport_id,
        assessor,
        "decline",
        f"decline {record.competency.id}",
        {
            layout.sign_off_file(store, passport_id, name): serialise.to_yaml(
                declined,
                comment=(
                    "A declined request. Recorded rather than deleted: a "
                    "record showing only successes is worth less."
                ),
            )
        },
        competency=record.competency.id,
        sign_off=name,
        now=moment,
    )


def withdraw_sign_off(
    store: PassportStore,
    passport_id: str,
    holder: Actor,
    *,
    name: str,
    now: datetime | None = None,
) -> str:
    """Withdraw a request the holder no longer wants assessed.

    Args:
        store: Where passports live.
        passport_id: Whose passport.
        holder: The holder.
        name: Which sign-off folder.
        now: For tests.

    Returns:
        The commit id.

    Raises:
        SignOffStateError: If the record is not awaiting a signature. A
            signed sign-off cannot be withdrawn: it is somebody else's
            attestation, not the holder's to remove.
    """
    moment = now if now is not None else datetime.now(UTC)
    record = read_sign_off(store, passport_id, name)

    if record.status != "requested":
        raise SignOffStateError(
            f"Sign-off {name} is {record.status!r}. Only an open request "
            "can be withdrawn; a signed record is the assessor's "
            "attestation, not the holder's to remove."
        )

    return _commit_with_index(
        store,
        passport_id,
        holder,
        "withdraw",
        f"withdraw {record.competency.id}",
        {},
        competency=record.competency.id,
        sign_off=name,
        delete=(layout.sign_off_file(store, passport_id, name),),
        now=moment,
    )


def supersede_sign_off(
    store: PassportStore,
    passport_id: str,
    actor: Actor,
    *,
    name: str,
    now: datetime | None = None,
) -> str:
    """Mark a sign-off superseded by a correction.

    Only ever called for a ``correction``: progression and reassessment
    supersede nothing, because the earlier record stays correct and the
    holder simply moved on or was confirmed again.

    Args:
        store: Where passports live.
        passport_id: Whose passport.
        actor: Who is making the correction.
        name: Which sign-off folder is being superseded.
        now: For tests.

    Returns:
        The commit id.

    Raises:
        SignOffStateError: If the record is not signed. Only a signed
            record can be superseded - an open request is withdrawn and a
            declined one already records what happened.
    """
    moment = now if now is not None else datetime.now(UTC)
    record = read_sign_off(store, passport_id, name)

    if record.status != "signed_off":
        raise SignOffStateError(
            f"Sign-off {name} is {record.status!r}, not 'signed_off', so "
            "there is nothing to supersede."
        )

    superseded = record.model_copy(update={"status": "superseded"})

    return _commit_with_index(
        store,
        passport_id,
        actor,
        "supersede",
        f"supersede {record.competency.id}",
        {
            layout.sign_off_file(store, passport_id, name): serialise.to_yaml(
                superseded,
                comment=(
                    "A superseded sign-off, corrected by a later record. "
                    "Kept: the history is what it is."
                ),
            )
        },
        competency=record.competency.id,
        sign_off=name,
        now=moment,
    )


def read_sign_off(
    store: PassportStore, passport_id: str, name: str
) -> SignOff:
    """Read one sign-off.

    Args:
        store: Where passports live.
        passport_id: Whose passport.
        name: Which sign-off folder.

    Returns:
        The validated record.

    Raises:
        PassportNotFoundError: If there is no such sign-off.
    """
    return serialise.from_yaml(
        SignOff,
        store.read(
            passport_id, layout.sign_off_file(store, passport_id, name)
        ),
    )


def status_for(
    store: PassportStore, passport_id: str, competency_id: str
) -> str:
    """Where one competency stands, derived rather than stored.

    Args:
        store: Where passports live.
        passport_id: Whose passport.
        competency_id: Which competency.

    Returns:
        The latest sign-off's status, or ``"none"`` where there is no
        evidence at all. Deliberately not a judgement: an expired
        sign-off still reports ``signed_off``, because what a lapsed
        sign-off implies is a clinical decision that has not been made.
    """
    existing = _existing_for(store, passport_id, competency_id, ANY_SCOPE)

    if not existing:
        return "none"

    return existing[-1][1].status


def next_id(moment: datetime | None = None) -> str:
    """Issue a timestamp id from the one generator this process shares.

    Public because records outside the sign-off lifecycle need ids too -
    a certificate carries one - and a second generator would defeat the
    point: the monotonic guarantee holds per instance, so two would each
    be monotonic alone while issuing ids that interleave.

    Args:
        moment: When, defaulting to now. For tests.

    Returns:
        A ``YYYYMMDDTHHMMSS.sssZ-<uuid4>`` id.
    """
    return _ids.next(moment if moment is not None else datetime.now(UTC))


# --- Internals ------------------------------------------------------------

_ids = ids.TimestampIdGenerator()


#: Passed for the scope where every sign-off for a competency is wanted,
#: whatever each covers. A string no scope id can be, since scope ids
#: are lower-case words and underscores.
ANY_SCOPE = "*"


def _existing_for(
    store: PassportStore,
    passport_id: str,
    competency_id: str,
    scope_id: str | None,
) -> list[tuple[str, SignOff]]:
    """Every sign-off for one competency and scope, oldest first.

    A sign-off for one scope is no part of another's history: the first
    for breast is a first, however many came before for lung. So the
    scope narrows what is returned, and ``None`` means the sign-offs
    that name no scope, not all of them. Pass :data:`ANY_SCOPE` for all.
    """
    found: list[tuple[str, SignOff]] = []

    for folder in layout.sign_off_folders(store, passport_id, competency_id):
        name = paths.sign_off_id(competency_id, folder)

        try:
            record = read_sign_off(store, passport_id, name)
        except PassportNotFoundError:
            continue

        if record.competency.id != competency_id:
            continue

        record_scope = record.scope.id if record.scope is not None else None
        if scope_id == ANY_SCOPE or record_scope == scope_id:
            found.append((name, record))

    found.sort(key=lambda pair: (pair[1].observed_on, pair[0]))

    return found


def _kind_for(
    catalogue: StoredCatalogue,
    competency_id: str,
    level_id: str | None,
    existing: list[tuple[str, SignOff]],
) -> SignOffKind:
    """Why this sign-off exists, from what came before it.

    Derived rather than asked for, because a caller choosing the wrong
    kind would either imply an earlier assessor was mistaken or hide a
    progression. The one kind never derived is ``correction``: saying an
    earlier record was wrong is a deliberate claim, so it is requested
    explicitly through :func:`supersede_sign_off`.
    """
    signed = [
        record
        for _, record in existing
        if record.status == "signed_off" and record.level is not None
    ]

    if not any(record.status == "signed_off" for _, record in existing):
        return "initial"

    if level_id is None or not signed:
        return "reassessment"

    previous = definitions.level_order(
        catalogue,
        competency_id,
        signed[-1].level.id,  # type: ignore[union-attr]
    )
    now_at = definitions.level_order(catalogue, competency_id, level_id)

    return "progression" if now_at > previous else "reassessment"


def _expiry(
    catalogue: StoredCatalogue, competency_id: str, signed_on: date
) -> date | None:
    """When a sign-off wants revisiting, or None.

    Recorded and nothing more: no expired status, no reminders, no
    dropping back a level. The date is there to be read by a person who
    can judge what it means.
    """
    months = definitions.expires_after_months(catalogue, competency_id)

    if months is None:
        return None

    year = signed_on.year + (signed_on.month - 1 + months) // 12
    month = (signed_on.month - 1 + months) % 12 + 1

    # Clamp the day rather than overflowing into the next month: a
    # sign-off made on 31 January expiring "in one month" is 28 or 29
    # February, not 2 or 3 March.
    day = min(signed_on.day, calendar.monthrange(year, month)[1])

    return date(year, month, day)


def _evidence_snapshot(
    store: PassportStore,
    passport_id: str,
    competency_id: str,
    scope_id: str | None,
) -> EvidenceSnapshot:
    """What is in view for this competency and scope right now.

    Not a threshold that was met - a record of what the assessor could
    see when they decided. A sign-off for one scope counts the logbook
    entries naming that scope, so a lung sign-off freezes the lung log
    and not the breast one.
    """
    logbook_entries, certificates = index.evidence_for(
        store, passport_id, competency_id, scope_id
    )

    return EvidenceSnapshot(
        logbook_entries=logbook_entries, certificates=list(certificates)
    )


def _unique_sign_off_name(
    store: PassportStore,
    passport_id: str,
    competency_id: str,
    observed_on: date,
    scope_id: str | None,
) -> str:
    """A sign-off id whose folder is not already taken.

    The folder is the date the work was observed, then the scope where
    the competency has one, then ``-2`` or higher for a second on the
    same day. Its parent folder already names the competency.
    """
    taken = set(layout.sign_off_folders(store, passport_id, competency_id))

    suffix = 1

    while True:
        folder = ids.sign_off_folder_name(observed_on, scope_id, suffix=suffix)
        if folder not in taken:
            return paths.sign_off_id(competency_id, folder)
        suffix += 1


def _commit_with_index(
    store: PassportStore,
    passport_id: str,
    actor: Actor,
    action: str,
    summary: str,
    files: dict[object, str | bytes],
    *,
    competency: str | None = None,
    sign_off: str | None = None,
    delete: tuple[object, ...] = (),
    now: datetime | None = None,
) -> str:
    """Write a sign-off change and its index, in one commit.

    The same single-commit discipline the self-declared records use, and
    for the same reason: a commit whose index disagrees with its own
    records would be a history that contradicts itself.
    """
    head = store.head(passport_id)

    view = records._PendingView(  # noqa: SLF001 - one write path, shared
        store, passport_id, files, delete  # type: ignore[arg-type]
    )
    rebuilt = index.build(view, passport_id, now=now)

    staged = dict(files)
    staged[paths.INDEX] = index.render(rebuilt)

    return store.write(
        passport_id,
        staged,  # type: ignore[arg-type]
        # Cut to fit, as the self-declared records' summaries are: this
        # one names a competency by its id, and an id added to the
        # catalogue later should not be what stops a sign-off saving.
        build_message(
            action,  # type: ignore[arg-type]
            fit_summary(action, summary),  # type: ignore[arg-type]
            actor,
            competency=competency,
            sign_off=sign_off,
        ),
        actor,
        head,
        delete=delete,  # type: ignore[arg-type]
    )

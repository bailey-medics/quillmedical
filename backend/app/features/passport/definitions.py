"""Reading the passport's fields off the stored frameworks.

The passport adds no second registry. A framework's competencies are
read from the framework tables, as :mod:`.catalogue` gives them back,
and this module is the narrow view of them the passport needs: does this
competency have a scale, what are its steps called, and does a sign-off
against it expire.

**Every function takes the catalogue, read once for the request.** A
route reads it with :func:`.catalogue.stored_catalogue` and passes it
down, so one request never mixes two versions of a framework, even if
the sync stores a new one while the request runs.

Why a module rather than importing :mod:`app.cbac.competencies`
directly. Two reasons, and the second is the real one:

- **CBAC answers a different question.** It asks what a user may do in
  Quill right now, which is a yes or no. The passport asks what someone
  has been assessed as competent to do, by whom, and how far along they
  are. Sharing the vocabulary is the point; sharing the question would
  be a mistake.
- **A sign-off must record the words, not look them up.** Everything
  here is read *once*, at the moment a record is written, and copied
  into the record. Nothing in a stored passport is resolved through this
  module later. That is what lets a sign-off stay readable when a
  definition is reworded, retired, or the passport is opened on a
  machine with no Quill at all.

So this is a lookup used at write time and never at read time, which is
the opposite of how a registry usually gets used, and is deliberate.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.cbac.competencies import CompetencyEntry

from .schemas import CompetencyRef, LevelRef, ScopeRef

if TYPE_CHECKING:
    # A type only. The catalogue module reads the database, and this one
    # must import nothing that does: tests/features_import_boundary_test.py.
    from .catalogue import StoredCatalogue


class UnknownCompetencyError(ValueError):
    """A competency id the catalogue has never defined.

    Its own type so a route can turn it into a 400 naming the id, rather
    than a 500. Distinct from a *retired* competency, which is known and
    readable but refused for new sign-offs.
    """


class NotAssessableError(ValueError):
    """A competency the passport may not record anything new against.

    Either it is a software permission rather than a skill, so nobody
    could watch it and sign it off, or it has been retired. Its own type
    so a route can answer 400 naming the id, where an unknown id is 404.
    """


class UnknownLevelError(ValueError):
    """A level id that competency does not declare.

    Raised rather than silently signing off at no level, which would
    record less than the assessor chose and read as a bare pass.
    """


class UnknownFrameworkVersionError(ValueError):
    """A sign-off names a framework version Quill does not hold.

    Refused rather than read against the nearest version Quill does
    hold: comparing a sign-off with words it was not given under is the
    error this exists to stop. The message names the framework and the
    version, so somebody can find out where the record came from.
    """


class UnknownScopeError(ValueError):
    """The competency does not declare this scope.

    Its own type for the reason :class:`UnknownLevelError` has one: a
    scope the catalogue does not list is a caller using a stale list, and
    the route says so plainly rather than as a server error.
    """


def _entry(catalogue: StoredCatalogue, competency_id: str) -> CompetencyEntry:
    """The catalogue entry, or refuse by name.

    Args:
        catalogue: The stored frameworks, read once for the request.
        competency_id: The competency id.

    Returns:
        Its definition.

    Raises:
        UnknownCompetencyError: If the catalogue has never defined it.
            Retired competencies *are* returned: a passport must stay
            readable, and refusing to render an old sign-off because the
            competency has since been retired would lose the record.
    """
    entry = catalogue.entries.get(competency_id)

    if entry is None:
        raise UnknownCompetencyError(
            f"Unknown competency {competency_id!r}. No framework Quill "
            "holds defines it."
        )

    return entry


def competency_ref(
    catalogue: StoredCatalogue, competency_id: str
) -> CompetencyRef:
    """The id and display name to copy into a record.

    Args:
        catalogue: The stored frameworks, read once for the request.
        competency_id: The competency id.

    Returns:
        Both halves, ready to store.

    Raises:
        UnknownCompetencyError: If the id is not in the catalogue.
    """
    entry = _entry(catalogue, competency_id)

    return CompetencyRef(id=entry.id, name=entry.display_name)


def framework_version(catalogue: StoredCatalogue, competency_id: str) -> int:
    """The current version of the framework a competency belongs to.

    Copied into a sign-off when it is asked for, beside the words, so the
    record says which version of the framework those words came from.

    Args:
        catalogue: The stored frameworks, read once for the request.
        competency_id: The competency id.

    Returns:
        Its framework's version, from 1.

    Raises:
        UnknownCompetencyError: If the id is not in the catalogue.
        NotAssessableError: If it belongs to no framework, so nothing can
            be signed off against it.
    """
    entry = _entry(catalogue, competency_id)
    framework = (
        catalogue.frameworks.get(entry.framework_id)
        if entry.framework_id is not None
        else None
    )

    if framework is None:
        raise NotAssessableError(
            f"{entry.display_name} ({competency_id}) belongs to no "
            "framework, so it cannot be signed off."
        )

    return framework.version


def assessable_ref(
    catalogue: StoredCatalogue, competency_id: str
) -> CompetencyRef:
    """The id and display name, for a record being written now.

    The write-time twin of :func:`competency_ref`. Reading an old record
    never comes through here, so a record holding a competency that has
    since been retired or marked not assessable stays readable.

    Args:
        catalogue: The stored frameworks, read once for the request.
        competency_id: The competency id.

    Returns:
        Both halves, ready to store.

    Raises:
        UnknownCompetencyError: If the id is not in the catalogue.
        NotAssessableError: If it is not marked ``assessable``, or has
            been retired.
    """
    entry = _entry(catalogue, competency_id)
    ref = CompetencyRef(id=entry.id, name=entry.display_name)

    if not entry.assessable or entry.retired_on is not None:
        raise NotAssessableError(
            f"{ref.name} ({competency_id}) cannot be recorded in a "
            "passport. Only competencies somebody can be assessed on are "
            "offered."
        )

    return ref


def has_levels(catalogue: StoredCatalogue, competency_id: str) -> bool:
    """Whether this competency is signed off against a scale.

    Args:
        catalogue: The stored frameworks, read once for the request.
        competency_id: The competency id.

    Returns:
        True if it declares levels. False where the honest answer is
        simply signed off or not - cannulation needs no scale.

    Raises:
        UnknownCompetencyError: If the id is not in the catalogue.
    """
    return bool(_entry(catalogue, competency_id).levels)


def levels(catalogue: StoredCatalogue, competency_id: str) -> list[LevelRef]:
    """This competency's scale, in order.

    Order is the scale: the steps are meaningful in the sequence the
    definition lists them, which is why nothing here sorts them.

    Args:
        catalogue: The stored frameworks, read once for the request.
        competency_id: The competency id.

    Returns:
        Its levels, or an empty list where it declares none.

    Raises:
        UnknownCompetencyError: If the id is not in the catalogue.
    """
    entry = _entry(catalogue, competency_id)

    return [
        LevelRef(id=level.id, name=level.name) for level in entry.levels or []
    ]


def level_ref(
    catalogue: StoredCatalogue,
    competency_id: str,
    level_id: str,
    *,
    offered: bool = False,
) -> LevelRef:
    """The level id and its wording, to copy into a record.

    Args:
        catalogue: The stored frameworks, read once for the request.
        competency_id: The competency id.
        level_id: Which step of its scale.
        offered: True for a level being asked for anew, which a retired
            level may not be. A record already naming one still reads.

    Returns:
        Both halves, ready to store.

    Raises:
        UnknownCompetencyError: If the competency is not in the catalogue.
        UnknownLevelError: If it declares no levels, or not this one.
            Naming the available ones, because the caller passing a wrong
            level is nearly always using a stale scale.
    """
    available = levels(catalogue, competency_id)

    if not available:
        raise UnknownLevelError(
            f"Competency {competency_id!r} declares no levels, so a "
            f"sign-off against it cannot name level {level_id!r}."
        )

    for level in available:
        if level.id == level_id:
            if offered and _retired_part(
                catalogue, competency_id, "levels", level_id
            ):
                raise UnknownLevelError(
                    f"Level {level_id!r} of {competency_id!r} is no longer "
                    "offered: its framework retired it."
                )
            return level

    raise UnknownLevelError(
        f"Competency {competency_id!r} has no level {level_id!r}. Its levels "
        "are: " + ", ".join(level.id for level in available) + "."
    )


def level_order(
    catalogue: StoredCatalogue, competency_id: str, level_id: str
) -> int:
    """Where a level sits on its scale, counting from zero.

    Used to tell a progression from a reassessment: a higher index is a
    progression, the same index is a reassessment. Derived from the order
    the definition lists rather than from anything stored, because that
    order *is* the scale.

    Args:
        catalogue: The stored frameworks, read once for the request.
        competency_id: The competency id.
        level_id: Which step.

    Returns:
        Its zero-based position.

    Raises:
        UnknownCompetencyError: If the competency is not in the catalogue.
        UnknownLevelError: If it does not declare that level.
    """
    available = levels(catalogue, competency_id)

    for position, level in enumerate(available):
        if level.id == level_id:
            return position

    # level_ref raises with the available levels named, so reuse it
    # rather than writing a second, differently worded refusal.
    level_ref(catalogue, competency_id, level_id)
    raise AssertionError("unreachable")  # pragma: no cover


def has_scopes(catalogue: StoredCatalogue, competency_id: str) -> bool:
    """Whether this competency is signed off one scope at a time.

    Args:
        catalogue: The stored frameworks, read once for the request.
        competency_id: The competency id.

    Returns:
        True if it declares scopes. False where it is assessed as a
        whole, which is most of them.

    Raises:
        UnknownCompetencyError: If the id is not in the catalogue.
    """
    return bool(_entry(catalogue, competency_id).scopes)


def scopes(catalogue: StoredCatalogue, competency_id: str) -> list[ScopeRef]:
    """What a record for this competency may cover, in listed order.

    Args:
        catalogue: The stored frameworks, read once for the request.
        competency_id: The competency id.

    Returns:
        Its scopes, or an empty list where it declares none.

    Raises:
        UnknownCompetencyError: If the id is not in the catalogue.
    """
    entry = _entry(catalogue, competency_id)

    return [
        ScopeRef(id=scope.id, name=scope.name) for scope in entry.scopes or []
    ]


def scope_ref(
    catalogue: StoredCatalogue,
    competency_id: str,
    scope_id: str,
    *,
    offered: bool = False,
) -> ScopeRef:
    """The scope id and its wording, to copy into a record.

    Args:
        catalogue: The stored frameworks, read once for the request.
        competency_id: The competency id.
        scope_id: Which scope.
        offered: True for a scope a new record is to cover, which a
            retired scope may not be. A record already naming one reads.

    Returns:
        Both halves, ready to store.

    Raises:
        UnknownCompetencyError: If the competency is not in the catalogue.
        UnknownScopeError: If it declares no scopes, or not this one.
    """
    available = scopes(catalogue, competency_id)

    if not available:
        raise UnknownScopeError(
            f"Competency {competency_id!r} declares no scopes, so a "
            f"record against it cannot name scope {scope_id!r}."
        )

    for scope in available:
        if scope.id == scope_id:
            if offered and _retired_part(
                catalogue, competency_id, "scopes", scope_id
            ):
                raise UnknownScopeError(
                    f"Scope {scope_id!r} of {competency_id!r} is no longer "
                    "offered: its framework retired it."
                )
            return scope

    raise UnknownScopeError(
        f"Competency {competency_id!r} has no scope {scope_id!r}. Its "
        "scopes are: " + ", ".join(scope.id for scope in available) + "."
    )


def _retired_part(
    catalogue: StoredCatalogue, competency_id: str, kind: str, part_id: str
) -> bool:
    """Whether a competency's level or scope has been retired."""
    entry = _entry(catalogue, competency_id)
    parts = entry.levels if kind == "levels" else entry.scopes

    return any(
        part.id == part_id and part.retired_on is not None
        for part in parts or []
    )


def expires_after_months(
    catalogue: StoredCatalogue, competency_id: str
) -> int | None:
    """How long a sign-off stands before it wants revisiting.

    Read at write time and turned into a date on the record. Nothing acts
    on it: no expired status, no reminders, no dropping back a level. The
    date is there to be read by a person who can judge what it means,
    because what a lapsed sign-off implies is a clinical decision that
    has not been made.

    Args:
        catalogue: The stored frameworks, read once for the request.
        competency_id: The competency id.

    Returns:
        The interval in months, or None where nothing expires.

    Raises:
        UnknownCompetencyError: If the id is not in the catalogue.
    """
    return _entry(catalogue, competency_id).expires_after_months


def check_held_version(
    catalogue: StoredCatalogue, competency_id: str, version: int
) -> None:
    """Refuse a sign-off naming a framework version Quill does not hold.

    Wherever a sign-off enters: read from a passport, and from any import
    later, such as a passport moved from another app that uses the same
    frameworks.

    Args:
        catalogue: The stored frameworks, read once for the request.
        competency_id: What the sign-off is for.
        version: The framework version it was given under.

    A sign-off for a competency no framework defines any more is let
    through: its framework cannot be known, so nothing can be checked,
    and a passport must stay readable when a competency leaves the
    catalogue.

    Raises:
        UnknownFrameworkVersionError: If Quill holds the competency's
            framework, but not that version of it.
    """
    entry = catalogue.entries.get(competency_id)

    if entry is None or entry.framework_id is None:
        return

    framework_id = entry.framework_id

    if version in catalogue.versions.get(framework_id, frozenset()):
        return

    raise UnknownFrameworkVersionError(
        f"A sign-off for {competency_id} was given under version {version} "
        f"of framework {framework_id!r}, which Quill does not hold."
    )

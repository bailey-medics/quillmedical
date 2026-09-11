"""Reading the passport's fields off the shared competency catalogue.

The passport adds no second registry. Competencies live where they
already live, in ``shared/competency-definitions/``, and this module is
the narrow view of them the passport needs: does this competency have a
scale, what are its steps called, and does a sign-off against it expire.

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

from app.cbac.competencies import (
    CompetencyEntry,
    get_competency_details,
)

from .schemas import CompetencyRef, LevelRef


class UnknownCompetencyError(ValueError):
    """A competency id the catalogue has never defined.

    Its own type so a route can turn it into a 400 naming the id, rather
    than a 500. Distinct from a *retired* competency, which is known and
    readable but refused for new sign-offs.
    """


class UnknownLevelError(ValueError):
    """A level id that competency does not declare.

    Raised rather than silently signing off at no level, which would
    record less than the assessor chose and read as a bare pass.
    """


def _entry(competency_id: str) -> CompetencyEntry:
    """The catalogue entry, or refuse by name.

    Args:
        competency_id: The competency id.

    Returns:
        Its definition.

    Raises:
        UnknownCompetencyError: If the catalogue has never defined it.
            Retired competencies *are* returned: a passport must stay
            readable, and refusing to render an old sign-off because the
            competency has since been retired would lose the record.
    """
    entry = get_competency_details(competency_id)

    if entry is None:
        raise UnknownCompetencyError(
            f"Unknown competency {competency_id!r}. Competencies are defined "
            "in shared/competency-definitions/."
        )

    return entry


def competency_ref(competency_id: str) -> CompetencyRef:
    """The id and display name to copy into a record.

    Args:
        competency_id: The competency id.

    Returns:
        Both halves, ready to store.

    Raises:
        UnknownCompetencyError: If the id is not in the catalogue.
    """
    entry = _entry(competency_id)
    return CompetencyRef(id=entry.id, name=entry.display_name)


def has_levels(competency_id: str) -> bool:
    """Whether this competency is signed off against a scale.

    Args:
        competency_id: The competency id.

    Returns:
        True if it declares levels. False where the honest answer is
        simply signed off or not — cannulation needs no scale.

    Raises:
        UnknownCompetencyError: If the id is not in the catalogue.
    """
    return bool(_entry(competency_id).levels)


def levels(competency_id: str) -> list[LevelRef]:
    """This competency's scale, in order.

    Order is the scale: the steps are meaningful in the sequence the
    definition lists them, which is why nothing here sorts them.

    Args:
        competency_id: The competency id.

    Returns:
        Its levels, or an empty list where it declares none.

    Raises:
        UnknownCompetencyError: If the id is not in the catalogue.
    """
    entry = _entry(competency_id)
    return [
        LevelRef(id=level.id, name=level.name) for level in entry.levels or []
    ]


def level_ref(competency_id: str, level_id: str) -> LevelRef:
    """The level id and its wording, to copy into a record.

    Args:
        competency_id: The competency id.
        level_id: Which step of its scale.

    Returns:
        Both halves, ready to store.

    Raises:
        UnknownCompetencyError: If the competency is not in the catalogue.
        UnknownLevelError: If it declares no levels, or not this one.
            Naming the available ones, because the caller passing a wrong
            level is nearly always using a stale scale.
    """
    available = levels(competency_id)

    if not available:
        raise UnknownLevelError(
            f"Competency {competency_id!r} declares no levels, so a "
            f"sign-off against it cannot name level {level_id!r}."
        )

    for level in available:
        if level.id == level_id:
            return level

    raise UnknownLevelError(
        f"Competency {competency_id!r} has no level {level_id!r}. Its levels "
        "are: " + ", ".join(level.id for level in available) + "."
    )


def level_order(competency_id: str, level_id: str) -> int:
    """Where a level sits on its scale, counting from zero.

    Used to tell a progression from a reassessment: a higher index is a
    progression, the same index is a reassessment. Derived from the order
    the definition lists rather than from anything stored, because that
    order *is* the scale.

    Args:
        competency_id: The competency id.
        level_id: Which step.

    Returns:
        Its zero-based position.

    Raises:
        UnknownCompetencyError: If the competency is not in the catalogue.
        UnknownLevelError: If it does not declare that level.
    """
    available = levels(competency_id)

    for position, level in enumerate(available):
        if level.id == level_id:
            return position

    # level_ref raises with the available levels named, so reuse it
    # rather than writing a second, differently worded refusal.
    level_ref(competency_id, level_id)
    raise AssertionError("unreachable")  # pragma: no cover


def expires_after_months(competency_id: str) -> int | None:
    """How long a sign-off stands before it wants revisiting.

    Read at write time and turned into a date on the record. Nothing acts
    on it: no expired status, no reminders, no dropping back a level. The
    date is there to be read by a person who can judge what it means,
    because what a lapsed sign-off implies is a clinical decision that
    has not been made.

    Args:
        competency_id: The competency id.

    Returns:
        The interval in months, or None where nothing expires.

    Raises:
        UnknownCompetencyError: If the id is not in the catalogue.
    """
    return _entry(competency_id).expires_after_months

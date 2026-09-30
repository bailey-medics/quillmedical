"""What somebody may hand out to other people.

``manage_users`` is the root competency: its holder may grant anything in
the catalogue, including ``manage_users`` itself. Every other authority to
grant is narrower, and is declared on the granting competency as two
whitelists in ``shared/competency-definitions/``:

- ``may_grant`` – the competencies its holder may grant and remove
- ``may_assign_professions`` – the base professions its holder may give

A caller's scope is the union of those lists across everything they hold.
This module is the one place that answers "may this caller hand this
out?", so the rule cannot drift between the routes that ask it.

**The scope applies to removal as much as to granting.** Without that, a
holder of ``manage_teaching`` could strip a consultant's clinical
competencies, which is as much a change to what they may do as granting
one. And an act on the account as a whole, such as a change of profession
or a deactivation, needs the target's current profession to be in scope,
so a clinician who also sits teaching assessments can gain and lose
teaching competencies and nothing else.

Like every competency question this answers *what*, never *where*: the
routes that call it keep their org_unit checks beside it. See
``docs/docs/plans/2026-09-30-manage-teaching-competency-plan.md``.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from app.cbac.base_professions import PROFESSION_IDS
from app.cbac.competencies import COMPETENCIES, ROOT_COMPETENCY
from app.models import User


@dataclass(frozen=True)
class GrantScope:
    """What one caller may hand out.

    Attributes:
        competencies: The competency ids they may grant and remove, or
            None for no limit.
        professions: The base profession ids they may give, or None for
            no limit.
    """

    competencies: frozenset[str] | None
    professions: frozenset[str] | None

    @property
    def unlimited(self) -> bool:
        """Whether this is the root's scope, with no limit at all."""
        return self.competencies is None and self.professions is None


UNLIMITED = GrantScope(competencies=None, professions=None)


def _check_professions() -> None:
    """Refuse a ``may_assign_professions`` list naming an unknown id.

    Checked here rather than in the competency loader, because the
    profession catalogue is loaded separately and neither loader should
    import the other.

    Raises:
        ValueError: If a list names a profession the catalogue lacks.
    """
    known = set(PROFESSION_IDS)
    for entry in COMPETENCIES:
        for profession in entry.may_assign_professions or []:
            if profession not in known:
                raise ValueError(
                    f"Competency {entry.id!r} may_assign_professions names "
                    f"unknown profession {profession!r}."
                )


_check_professions()


def scope_for_competencies(held: Iterable[str]) -> GrantScope:
    """Work out the scope that a set of held competencies gives.

    Args:
        held: The competency ids the caller holds.

    Returns:
        ``UNLIMITED`` if they hold the root competency, otherwise the
        union of the whitelists on everything they hold.
    """
    held_ids = set(held)
    if ROOT_COMPETENCY in held_ids:
        return UNLIMITED

    competencies: set[str] = set()
    professions: set[str] = set()
    for entry in COMPETENCIES:
        if entry.id not in held_ids:
            continue
        competencies.update(entry.may_grant or [])
        professions.update(entry.may_assign_professions or [])
    return GrantScope(
        competencies=frozenset(competencies),
        professions=frozenset(professions),
    )


def scope_for(user: User) -> GrantScope:
    """Work out what *user* may hand out to other people.

    Args:
        user: The caller.

    Returns:
        Their grant scope.
    """
    return scope_for_competencies(user.get_final_competencies())


def may_grant(user: User, competency: str) -> bool:
    """Whether *user* may grant *competency* to, or remove it from, anyone.

    Args:
        user: The caller.
        competency: The competency id being granted or removed.

    Returns:
        True if it is in their scope.
    """
    scope = scope_for(user)
    return scope.competencies is None or competency in scope.competencies


def may_assign_profession(user: User, profession: str) -> bool:
    """Whether *user* may give somebody *profession*.

    Args:
        user: The caller.
        profession: The base profession id being given.

    Returns:
        True if it is in their scope.
    """
    scope = scope_for(user)
    return scope.professions is None or profession in scope.professions


def may_manage_account(user: User, target: User) -> bool:
    """Whether *user* may act on *target*'s account as a whole.

    A change of profession, a deactivation, a reactivation or an invite
    acts on the whole account, so it needs the target's current
    profession to be one the caller could have given. That keeps a
    clinician's account out of reach of a teaching coordinator, even
    when the clinician also holds a teaching competency.

    Args:
        user: The caller.
        target: The person whose account is being acted on.

    Returns:
        True if the caller may act on it.
    """
    return may_assign_profession(user, target.base_profession)


def out_of_scope_competencies(user: User, ids: Iterable[str]) -> list[str]:
    """Return the competency ids *user* may not grant or remove.

    For a route refusing a request, so it can name every offending id at
    once rather than the first.

    Args:
        user: The caller.
        ids: The competency ids the request would grant or remove.

    Returns:
        The ids outside their scope, sorted and deduplicated. Empty when
        all are within it.
    """
    scope = scope_for(user)
    if scope.competencies is None:
        return []
    return sorted({i for i in ids if i not in scope.competencies})

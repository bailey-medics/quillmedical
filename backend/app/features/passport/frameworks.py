"""The frameworks a holder works to, and which they are offered first.

A framework is one published document as a set of competencies: the UK
SACT Board's prescriber competencies, or one hospital's own sign-off
sheet. Each is a file in ``shared/competency-definitions/`` that declares
a ``framework:`` block, loaded and checked with the catalogue by
:mod:`app.cbac.competencies`.

**A holder chooses the frameworks they work to**, and the passport offers
them what those contain. That is the whole point: Quill will come to
host many frameworks for many specialties, several of them describing the
same act in their own words, and a single list of every competency would
be unusable. So this is a limit and not an ordering, which is the
difference from the specialty it replaces.

**Quill hosts each framework as written** and maps none onto another.
Two frameworks' levels for the same act are both kept, in their own
words.

The holder's choice lives in ``profile.yaml`` as id and name pairs, so an
export reads correctly with no Quill. An organisation's lead frameworks
live in ``org_unit_passport_framework``, because they are an
organisation's setting and nothing in a holder's record.

See docs/docs/plans/2026-10-07-passport-registrar-portfolios-plan.md.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.cbac.competencies import (
    FRAMEWORK_IDS,
    FRAMEWORKS,
    SPECIALTY_IDS,
    Framework,
    framework_competencies,
    get_framework,
)

from .schemas import FrameworkRef


class UnknownFrameworkError(ValueError):
    """A framework id names no file, or one is chosen twice.

    Raised when a holder's choice is written, never when a profile is
    read: a framework since withdrawn is kept in a profile it is already
    in, as a retired competency is kept in a record.
    """


class UnknownSpecialtyFilterError(ValueError):
    """A search was filtered by a specialty that is not listed."""


def framework_refs(framework_ids: list[str]) -> list[FrameworkRef]:
    """The id and name of each chosen framework, to store in a profile.

    Args:
        framework_ids: What the holder chose, in their order.

    Returns:
        One reference per id, in the same order.

    Raises:
        UnknownFrameworkError: If an id has no file, or appears twice.
    """
    if len(set(framework_ids)) != len(framework_ids):
        raise UnknownFrameworkError("Each framework can be chosen once.")

    refs: list[FrameworkRef] = []

    for framework_id in framework_ids:
        framework = get_framework(framework_id)
        if framework is None:
            raise UnknownFrameworkError("That is not a framework Quill holds.")
        refs.append(FrameworkRef(id=framework.id, name=framework.name))

    return refs


@dataclass(frozen=True)
class FrameworkChoice:
    """One framework, at its place in the order a holder is offered them.

    Attributes:
        framework: Its definition.
        lead: True when one of the holder's organisations named it to
            come first.
        items: How many competencies it holds, so somebody choosing can
            tell a two-page sheet from a national curriculum.
    """

    framework: Framework
    lead: bool
    items: int


def _matches(framework: Framework, query: str | None) -> bool:
    """Whether the words typed are all in the framework's name or publisher.

    Every word must appear, in any order and any case, so "sact bath"
    finds Bath's SACT passport without the holder knowing its title.
    """
    if query is None or not query.strip():
        return True

    haystack = f"{framework.name} {framework.publisher}".casefold()

    return all(word in haystack for word in query.casefold().split())


def _filed_under(framework: Framework, specialty: str | None) -> bool:
    """Whether a specialty filter keeps this framework.

    A framework naming no specialty belongs to every one, as general
    clinical skills do, so no filter removes it.
    """
    if specialty is None:
        return True

    return not framework.specialties or specialty in framework.specialties


def frameworks_for(
    db: Session,
    user_id: int,
    *,
    query: str | None = None,
    specialty: str | None = None,
) -> list[FrameworkChoice]:
    """The frameworks this person may choose, in the order to offer them.

    First the lead frameworks of every organisation they reach,
    organisations taken in name order and each one's leads in position
    order, with repeats dropped. Then every other framework,
    alphabetically by name. A lead naming a framework whose file has
    since gone is skipped.

    Args:
        db: Core database session.
        user_id: The holder, or would-be holder.
        query: Words to find in a framework's name or publisher.
        specialty: A specialty id to narrow to.

    Returns:
        The matching frameworks, each once, leads first.

    Raises:
        UnknownSpecialtyFilterError: If *specialty* is not listed.
    """
    if specialty is not None and specialty not in SPECIALTY_IDS:
        raise UnknownSpecialtyFilterError("That is not a specialty.")

    # Imported here rather than at the top, so reading the frameworks
    # stays independent of the database and the org_unit tree.
    from sqlalchemy import select

    from app.models import OrgUnit
    from app.organisations import get_reachable_org_unit_ids

    from .models import OrgUnitPassportFramework

    org_unit_ids = get_reachable_org_unit_ids(db, user_id)

    lead_ids: list[str] = []

    if org_unit_ids:
        rows = db.execute(
            select(
                OrgUnit.name,
                OrgUnit.id,
                OrgUnitPassportFramework.position,
                OrgUnitPassportFramework.framework_id,
            )
            .join(OrgUnit, OrgUnit.id == OrgUnitPassportFramework.org_unit_id)
            .where(OrgUnitPassportFramework.org_unit_id.in_(org_unit_ids))
        ).all()
        # Sorted here rather than in SQL, so name order ignores case the
        # same way on SQLite in tests as on Postgres in production.
        for _name, _id, _position, framework_id in sorted(
            rows, key=lambda row: (row[0].casefold(), row[1], row[2])
        ):
            if framework_id in FRAMEWORK_IDS and framework_id not in lead_ids:
                lead_ids.append(framework_id)

    by_id = {framework.id: framework for framework in FRAMEWORKS}
    rest = sorted(
        (f for f in FRAMEWORKS if f.id not in lead_ids),
        key=lambda f: f.name.casefold(),
    )
    ordered = [(by_id[i], True) for i in lead_ids] + [
        (framework, False) for framework in rest
    ]

    return [
        FrameworkChoice(
            framework=framework,
            lead=lead,
            items=len(framework_competencies(framework.id)),
        )
        for framework, lead in ordered
        if _matches(framework, query) and _filed_under(framework, specialty)
    ]

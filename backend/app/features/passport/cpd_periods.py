"""Group CPD activities by the holder's appraisal periods, for the exports.

Every CPD total states the range it covers, because appraisal years do
not start in January and they move when somebody changes post. The CPD
page and both exports group the same way, so a total on screen matches
the one printed:

- **Declared periods**, the holder's ``appraisal_periods``, newest first.
  Activities outside every period form a final group of their own, so a
  gap between periods never hides anything.
- **June to June** where none is declared, named as a convention so a
  reader does not take it for the holder's actual cycle.

Dates are compared as dates, both ends included. A period with no
activities is left out, as an empty calendar year was before.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date

from .schemas import AppraisalPeriod, CpdEntry

#: The heading for activities in none of the declared periods.
OUTSIDE_HEADING = "Outside the declared date ranges"


@dataclass(frozen=True)
class CpdGroup:
    """One heading's worth of CPD activities, oldest first."""

    heading: str
    entries: list[CpdEntry] = field(default_factory=list)
    #: True for a June to June year, which no holder declared.
    convention: bool = False

    @property
    def points(self) -> float:
        """The points claimed; an activity without any adds nothing."""
        return sum(entry.points or 0 for entry in self.entries)


def _day(value: date) -> str:
    """``1 August 2025``, without a leading zero on the day."""
    return f"{value.day} {value.strftime('%B %Y')}"


def _range_heading(starts_on: date, ends_on: date) -> str:
    return f"{_day(starts_on)} to {_day(ends_on)}"


def _june_year_of(value: date) -> int:
    """The year whose June began the June to June year holding *value*."""
    return value.year if value.month >= 6 else value.year - 1


def group_cpd(
    entries: Iterable[CpdEntry], periods: Iterable[AppraisalPeriod]
) -> list[CpdGroup]:
    """Group *entries* by *periods*, newest period first.

    Args:
        entries: Every CPD activity in the passport, in any order.
        periods: The holder's declared appraisal periods, in any order.
            The API refuses overlaps, so each activity is in at most one.

    Returns:
        One group per period holding an activity, newest first, then the
        activities outside every period. With no periods, one group per
        June to June year holding an activity, newest first.
    """
    ordered = sorted(entries, key=lambda entry: entry.activity_on)
    declared = sorted(periods, key=lambda p: p.starts_on, reverse=True)

    if not declared:
        by_year: dict[int, list[CpdEntry]] = {}
        for entry in ordered:
            by_year.setdefault(_june_year_of(entry.activity_on), []).append(
                entry
            )
        return [
            CpdGroup(
                heading=_range_heading(
                    date(year, 6, 1), date(year + 1, 5, 31)
                ),
                entries=by_year[year],
                convention=True,
            )
            for year in sorted(by_year, reverse=True)
        ]

    groups: list[CpdGroup] = []
    placed: set[int] = set()

    for period in declared:
        inside = [
            entry
            for entry in ordered
            if period.starts_on <= entry.activity_on <= period.ends_on
        ]
        placed.update(id(entry) for entry in inside)
        if inside:
            groups.append(
                CpdGroup(
                    heading=_range_heading(period.starts_on, period.ends_on),
                    entries=inside,
                )
            )

    outside = [entry for entry in ordered if id(entry) not in placed]

    if outside:
        groups.append(CpdGroup(heading=OUTSIDE_HEADING, entries=outside))

    return groups

"""Grouping CPD activities by appraisal period, for the exports.

The exports and the CPD page must total the same activities over the
same ranges, or a printed total would disagree with the screen.
"""

from __future__ import annotations

from datetime import date

from app.features.passport.cpd_periods import OUTSIDE_HEADING, group_cpd
from app.features.passport.schemas import AppraisalPeriod, CpdEntry


def _entry(activity_on: date, points: float | None = 1) -> CpdEntry:
    return CpdEntry(
        activity_on=activity_on,
        title=f"Activity on {activity_on.isoformat()}",
        activity_type="course",
        points=points,
    )


def _period(starts_on: date, ends_on: date) -> AppraisalPeriod:
    return AppraisalPeriod(starts_on=starts_on, ends_on=ends_on)


class TestDeclaredPeriods:
    def test_newest_period_first_then_those_outside(self) -> None:
        older = _period(date(2024, 8, 1), date(2025, 7, 31))
        newer = _period(date(2025, 8, 1), date(2026, 7, 31))
        entries = [
            _entry(date(2026, 2, 11)),
            _entry(date(2023, 1, 5)),
            _entry(date(2024, 9, 4)),
        ]

        groups = group_cpd(entries, [older, newer])

        assert [g.heading for g in groups] == [
            "1 August 2025 to 31 July 2026",
            "1 August 2024 to 31 July 2025",
            OUTSIDE_HEADING,
        ]
        assert [e.activity_on for e in groups[2].entries] == [date(2023, 1, 5)]
        assert not any(g.convention for g in groups)

    def test_both_ends_of_a_period_are_inside_it(self) -> None:
        period = _period(date(2025, 8, 1), date(2026, 7, 31))

        groups = group_cpd(
            [_entry(date(2025, 8, 1)), _entry(date(2026, 7, 31))], [period]
        )

        assert len(groups) == 1
        assert len(groups[0].entries) == 2

    def test_a_period_with_no_activities_is_left_out(self) -> None:
        empty = _period(date(2020, 1, 1), date(2020, 12, 31))
        full = _period(date(2026, 1, 1), date(2026, 12, 31))

        groups = group_cpd([_entry(date(2026, 3, 1))], [empty, full])

        assert [g.heading for g in groups] == [
            "1 January 2026 to 31 December 2026"
        ]

    def test_points_skip_activities_that_claim_none(self) -> None:
        period = _period(date(2026, 1, 1), date(2026, 12, 31))

        groups = group_cpd(
            [
                _entry(date(2026, 2, 1), 6),
                _entry(date(2026, 3, 1), None),
                _entry(date(2026, 1, 20), 2.5),
            ],
            [period],
        )

        assert groups[0].points == 8.5
        # Oldest first within a group.
        assert [e.activity_on.month for e in groups[0].entries] == [1, 2, 3]


class TestJuneToJuneFallback:
    def test_june_to_june_years_newest_first_marked_as_convention(
        self,
    ) -> None:
        groups = group_cpd(
            [
                _entry(date(2025, 5, 31)),
                _entry(date(2025, 6, 1)),
                _entry(date(2026, 2, 11)),
            ],
            [],
        )

        assert [g.heading for g in groups] == [
            "1 June 2025 to 31 May 2026",
            "1 June 2024 to 31 May 2025",
        ]
        assert all(g.convention for g in groups)
        assert len(groups[0].entries) == 2

    def test_nothing_recorded_gives_no_groups(self) -> None:
        assert group_cpd([], []) == []

#!/usr/bin/env python3
"""Enrol an organisation's people on one teaching module.

Every module needs an enrolment, so a module added to an organisation
starts with nobody on it. This enrols everybody who may take that
organisation's modules, through any of its centres, and is not yet
enrolled. People already enrolled are left alone, so it is safe to run
again.

Usage (inside the backend container):

    python scripts/enrol_teaching_members.py <org_unit_id> <module_id>
    python scripts/enrol_teaching_members.py <org_unit_id> <module_id> --dry-run

Or via the Justfile:

    just enrol-teaching-members <org_unit_id> <module_id>

Prints usernames only, never names or addresses.
"""

from __future__ import annotations

import argparse
import os
import sys

proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)


def main(argv: list[str] | None = None) -> int:
    """Enrol everybody with a place on one module.

    Returns:
        int: 0 on success, 2 when the organisation does not serve the
        module.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("org_unit_id", type=int)
    parser.add_argument("module_id")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Say who would be enrolled, and write nothing.",
    )
    args = parser.parse_args(argv)

    from sqlalchemy import select

    from app.db import CoreSessionLocal
    from app.features.teaching.access import enrol_everyone_with_a_place
    from app.features.teaching.models import QuestionBankOrgStatus

    with CoreSessionLocal() as db:
        serves = db.scalar(
            select(QuestionBankOrgStatus.id).where(
                QuestionBankOrgStatus.org_unit_id == args.org_unit_id,
                QuestionBankOrgStatus.question_bank_id == args.module_id,
                QuestionBankOrgStatus.active_version.is_not(None),
            )
        )
        if serves is None:
            print(
                f"ERROR: org unit {args.org_unit_id} does not serve "
                f"{args.module_id!r}",
                file=sys.stderr,
            )
            return 2

        people = enrol_everyone_with_a_place(
            db,
            org_unit_id=args.org_unit_id,
            question_bank_id=args.module_id,
            source="script",
            dry_run=args.dry_run,
        )
        if not args.dry_run:
            db.commit()

    verb = "Would enrol" if args.dry_run else "Enrolled"
    for person in people:
        print(f"{verb} {person.username}")
    print(f"{verb} {len(people)} on {args.module_id}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

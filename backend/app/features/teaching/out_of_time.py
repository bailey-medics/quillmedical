"""Finishing the attempts whose time ran out and nobody came back to.

An attempt past its time is finished the moment its learner next
touches it, by every route that reads or writes one. A learner who
shut the tab, or whose battery went, never touches it again, so the
server finishes those itself: this is run on a schedule, and finishes
every unfinished attempt whose time has ended.

Each is finished exactly as a route would finish it, through the same
function: marked on the answers given in time, recorded as finished at
the moment its time ended and not when this ran, and a pass is written
to whoever the bank says to write to.

Nobody gains time from the gap between runs. An answer sent after an
attempt's time is refused by the route it is sent to, whether or not
this has run since.

Run as the ``finish-exams-out-of-time`` admin action.
"""

from __future__ import annotations

import logging
import sys
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.features.teaching.attempts import attempts_out_of_time
from app.features.teaching.models import Assessment
from app.models import User

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AttemptsSwept:
    """What one run did."""

    #: Attempts this run finished.
    finished: int
    #: Attempts that raised. Each is logged by its id, and the run went
    #: on to the next.
    failed: int


def finish_attempts_out_of_time(db: Session) -> AttemptsSwept:
    """Finish every attempt whose time has run out, and write to a pass.

    Each attempt is committed by itself before anything is sent about
    it, so its result is kept whatever happens to the email, and one
    attempt that cannot be finished does not undo the others.

    An attempt that raises is logged by its id and nothing else, rolled
    back, and counted as failed. Where it was the email that raised,
    the attempt is finished already and only the email is lost.

    Left alone, and counted as neither: an attempt somebody else
    finished between the list being read and its turn coming, and one
    whose bank version is no longer held, which cannot be marked.

    Safe to run twice, and beside a learner's own request: the attempt
    is locked while it is marked, and a second finder is given nothing
    to do.

    Args:
        db: Core database session. It is committed here, once for each
            attempt finished.
    """
    # Ids, and not the rows: a rollback part-way would leave the rows
    # of a list read at the start out of date.
    attempt_ids = [attempt.id for attempt in attempts_out_of_time(db)]
    finished = 0
    failed = 0

    for attempt_id in attempt_ids:
        try:
            if _finish_one(db, attempt_id):
                finished += 1
        except Exception as exc:
            # Whatever went wrong with this one, the next still has its
            # turn. The words of the error may hold an address, so only
            # its kind is logged.
            db.rollback()
            failed += 1
            logger.error(
                "Attempt %d out of time could not be finished or its "
                "pass written to: %s",
                attempt_id,
                type(exc).__name__,
            )

    return AttemptsSwept(finished=finished, failed=failed)


def _finish_one(db: Session, attempt_id: int) -> bool:
    """Finish one attempt by its id. True when this call finished it."""
    # Imported here: the router imports the modules this one sits
    # beside, and the function that writes to a pass lives in it.
    from app.features.teaching.router import finish_and_tell_if_out_of_time

    assessment = db.get(Assessment, attempt_id)

    if assessment is None:
        return False

    user = db.get(User, assessment.user_id)

    if user is None:
        return False

    return finish_and_tell_if_out_of_time(db, user, assessment) is not None


def main() -> int:
    """Run the sweep with a session of its own and print the counts.

    Returns:
        The exit status: 0 when every attempt found was dealt with, 1
        when the sweep could not run or any attempt raised.
    """
    from app.db.core_db import CoreSessionLocal

    db = CoreSessionLocal()

    try:
        swept = finish_attempts_out_of_time(db)
    except Exception as exc:
        db.rollback()
        print(
            "✗ The exams out of time could not be finished: "
            f"{type(exc).__name__}",
            file=sys.stderr,
        )

        return 1
    finally:
        db.close()

    print(f"Finished {swept.finished} exams whose time had run out")

    if swept.failed:
        print(f"✗ {swept.failed} could not be finished", file=sys.stderr)

        return 1

    return 0

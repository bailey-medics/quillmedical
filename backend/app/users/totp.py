"""Using a two-factor code, once, and not guessing one.

RFC 6238 section 5.2 says a verifier must not accept a code a second
time once it has been accepted. A code is right for its whole 30-second
step, so a check that only asks "is this code right?" lets somebody who
watched it being typed sign in with it in the same half-minute. This
records, per account, the step of the last code accepted, and refuses
that step or any before it.

The step is recorded, not the code: two steps can give the same six
digits by chance, and a later step is always allowed.

Section 5.1 of the same RFC asks for a limit on failed attempts, because
a six-digit code is guessed in about a third of a million tries. The
rate limits are per address, and an attacker who has the password can
spread guesses over many addresses, so this also counts wrong codes per
account. ``MAX_FAILED_ATTEMPTS`` wrong in a row lock the account's
two-factor step for ``LOCKOUT``, and a right code resets the count.
"""

from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, update
from sqlalchemy.orm import Session

from app.models import User
from app.security import totp_step_matched

#: Wrong codes in a row before the account's two-factor step locks.
MAX_FAILED_ATTEMPTS = 3

#: How long the two-factor step stays locked once it locks.
LOCKOUT = timedelta(minutes=15)


def _aware(moment: datetime) -> datetime:
    """*moment* as UTC, for a timestamp SQLite handed back naive."""
    if moment.tzinfo is None:
        return moment.replace(tzinfo=UTC)

    return moment


def totp_locked(user: User, now: datetime | None = None) -> bool:
    """Whether two-factor codes are refused for *user* just now.

    Args:
        user: The account signing in or setting up two-factor.
        now: The time to judge by, for tests. Defaults to now.

    Returns:
        True while a lockout from too many wrong codes is running.
    """
    if user.totp_locked_until is None:
        return False

    moment = now or datetime.now(UTC)

    return _aware(user.totp_locked_until) > moment


def record_totp_failure(
    db: Session, user: User, now: datetime | None = None
) -> None:
    """Count a wrong code against *user*, locking them at the limit.

    This commits, deliberately: the route answers a wrong code by
    raising, which rolls the request's transaction back, and a count
    rolled back with it would never reach the limit. Nothing else is
    pending when it is called, since a wrong code changes nothing else.

    Args:
        db: Core database session.
        user: The account that sent a wrong code.
        now: The time to lock from, for tests. Defaults to now.
    """
    moment = now or datetime.now(UTC)
    attempts = user.totp_failed_attempts + 1

    if attempts >= MAX_FAILED_ATTEMPTS:
        user.totp_failed_attempts = 0
        user.totp_locked_until = moment + LOCKOUT
    else:
        user.totp_failed_attempts = attempts

    db.add(user)
    db.commit()


def use_totp_code(db: Session, user: User, code: str) -> bool:
    """Accept *code* for *user* if it is right and not used before.

    The step is claimed with one conditional update, so two requests
    sending the same code at once cannot both be accepted: only the
    first to write moves the account's step on, and the second finds
    it already there. A code accepted clears the failed-attempt count.
    The row is flushed, not committed.

    The caller checks ``totp_locked`` first, and calls
    ``record_totp_failure`` when this answers False.

    Args:
        db: Core database session.
        user: The account signing in or setting up two-factor.
        code: The code they typed.

    Returns:
        True if the code was accepted, and is now spent.
    """
    step = totp_step_matched(user.totp_secret or "", code)

    if step is None:
        return False

    claimed = db.execute(
        update(User)
        .where(
            User.id == user.id,
            or_(User.totp_last_step.is_(None), User.totp_last_step < step),
        )
        .values(
            totp_last_step=step,
            totp_failed_attempts=0,
            totp_locked_until=None,
        )
        .execution_options(synchronize_session="fetch")
    )

    return int(claimed.rowcount or 0) == 1  # type: ignore[attr-defined]

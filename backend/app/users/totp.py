"""Using a two-factor code, once.

RFC 6238 section 5.2 says a verifier must not accept a code a second
time once it has been accepted. A code is right for its whole 30-second
step, so a check that only asks "is this code right?" lets somebody who
watched it being typed sign in with it in the same half-minute. This
records, per account, the step of the last code accepted, and refuses
that step or any before it.

The step is recorded, not the code: two steps can give the same six
digits by chance, and a later step is always allowed.
"""

from sqlalchemy import or_, update
from sqlalchemy.orm import Session

from app.models import User
from app.security import totp_step_matched


def use_totp_code(db: Session, user: User, code: str) -> bool:
    """Accept *code* for *user* if it is right and not used before.

    The step is claimed with one conditional update, so two requests
    sending the same code at once cannot both be accepted: only the
    first to write moves the account's step on, and the second finds
    it already there. The row is flushed, not committed.

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
        .values(totp_last_step=step)
        .execution_options(synchronize_session="fetch")
    )

    return int(claimed.rowcount or 0) == 1  # type: ignore[attr-defined]

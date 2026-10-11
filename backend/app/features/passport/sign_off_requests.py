"""Asking somebody to sign off a competency: who, and how often.

The holder chooses their assessor, by address, because the judgement
about who is appropriate sits with them and their supervisor. Two rules
are kept here. It may not be the holder, since the whole value of the
record is a second named person accepting accountability. And a holder
may ask only so many people in a day, since each ask sends mail to an
address somebody typed.

Nobody asked is checked for the right to assess. Somebody with an
account is given it as they are asked, by
:func:`.assessor_invites.let_existing_account_assess`, and somebody
without one is given it when they accept the invitation the ask sends.

The request itself is two things: a file in the passport, which
:func:`.service.request_sign_off` writes, and a row saying who was
asked, which :func:`record_ask` writes. The email goes between the
checks and the writing, and belongs to the router, which holds the
sender.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import User

from .assessor_invites import let_existing_account_assess
from .errors import AskedTooOftenToday, AskingYourself
from .models import (
    Passport,
    PassportLogbookConfirmationRequest,
    PassportSignOffRequest,
)


@dataclass(frozen=True)
class Asked:
    """Who a holder has asked.

    Attributes:
        email: The address asked, folded to lower case.
        account: The account that address has, or None where it has
            none and an invitation is what brings them in.
    """

    email: str
    account: User | None


def asks_today(db: Session, passport_id: str) -> int:
    """How many sign-offs this passport has asked for in the last day.

    Counted for the same reason invitations are, and alongside them:
    asking now sends mail to an address somebody typed, so a limit on
    one and not the other is no limit at all. A rolling twenty-four
    hours rather than a calendar day, which would let twice the limit
    go out either side of midnight.
    """
    since = datetime.now(UTC) - timedelta(days=1)

    sign_offs = db.scalar(
        select(func.count())
        .select_from(PassportSignOffRequest)
        .where(
            PassportSignOffRequest.passport_id == passport_id,
            PassportSignOffRequest.created_at >= since,
        )
    )
    # Asking a supervisor to confirm a logbook entry mails an address
    # somebody typed too, so it counts against the same limit.
    confirmations = db.scalar(
        select(func.count())
        .select_from(PassportLogbookConfirmationRequest)
        .where(
            PassportLogbookConfirmationRequest.passport_id == passport_id,
            PassportLogbookConfirmationRequest.created_at >= since,
        )
    )

    return (sign_offs or 0) + (confirmations or 0)


def who_is_asked(
    db: Session,
    passport_id: str,
    holder: User,
    assessor_email: str,
    *,
    daily_limit: int,
) -> Asked:
    """Settle who a holder is asking, and let them in if they can be.

    Anybody may be asked but the holder. Where the address has an
    account, that account is given what it needs to open the request,
    here and before any email, so a failed send takes it back with the
    rest of the caller's transaction.

    The rows are flushed, not committed.

    Args:
        db: Core database session.
        passport_id: The holder's passport.
        holder: Who is asking.
        assessor_email: The address they gave.
        daily_limit: The most asks a passport may make in a day. The
            refusal repeats it.

    Returns:
        The address, folded to lower case, and its account if it has
        one.

    Raises:
        AskingYourself: If the address is the holder's own.
        AskedTooOftenToday: If the passport has made that many asks in
            the last day.
        HolderBelongsNowhere: If the address has an account and the
            holder is at no org_unit to bring it in to.
    """
    email = assessor_email.strip().lower()

    if email == holder.email.strip().lower():
        raise AskingYourself()

    # The same backstop the invite route carries, for the same reason:
    # this route now sends mail to an address somebody typed, so without
    # it a holder could mail an unbounded number of strangers in Quill's
    # name. Requests alone are the whole count: asking is now the only
    # thing that sends this mail, and an invitation is minted by an ask
    # rather than beside one - so adding the two together would charge a
    # single ask twice and halve the limit without saying so.
    if asks_today(db, passport_id) >= daily_limit:
        raise AskedTooOftenToday(daily_limit)

    # Whether they already have an account decides what the email asks
    # them to do, so it is looked up here. A missing account is not an
    # error: the invitation is what brings them in.
    account = db.scalar(select(User).where(func.lower(User.email) == email))

    if account is not None:
        let_existing_account_assess(db, account, passport_id, holder)

    return Asked(email=email, account=account)


def record_ask(
    db: Session,
    passport: Passport,
    *,
    signoff_id: str,
    competency_id: str,
    assessor_email: str,
    commit: str,
) -> None:
    """Record who was asked, once the request is in the passport.

    The row is what an assessor's reach is resolved from: they see the
    sign-offs whose rows name their address and nothing else. The
    passport's row is moved on to the commit that wrote the request.

    The row is flushed, not committed.

    Args:
        db: Core database session.
        passport: The passport the request was written to.
        signoff_id: The name the request was given in the passport.
        competency_id: What was asked about.
        assessor_email: The address asked, folded to lower case.
        commit: The commit that wrote the request.
    """
    db.add(
        PassportSignOffRequest(
            passport_id=passport.id,
            signoff_id=signoff_id,
            competency_id=competency_id,
            assessor_email=assessor_email,
            # Null until somebody signs. Who was asked is the address
            # above; this records who actually signed, taken from the
            # signer rather than from here.
            assessor_user_id=None,
            status="open",
        )
    )
    passport.head_commit = commit
    db.flush()

"""Who may change what on somebody's account.

The checks that the caller's authority reaches what a request would
change: the account as a whole, the profession given, the competencies
granted or removed, and the platform role. What a caller may hand out is
worked out in :mod:`app.cbac.grant_scope`; this module turns each answer
into a refusal.

Like every competency question these answer *what*, never *where*: the
routes keep their org unit checks beside them.
"""

from app.cbac.grant_scope import (
    may_assign_profession,
    may_manage_account,
    out_of_scope_competencies,
    scope_for,
)
from app.models import User
from app.users.errors import (
    AccountOutOfScope,
    CompetenciesOutOfScope,
    PlatformRoleNotAllowed,
    ProfessionOutOfScope,
    SelfGranting,
)


def check_changes_in_scope(
    actor: User, before: set[str], after: set[str]
) -> None:
    """Refuse a change to anybody's competencies outside the caller's scope.

    Compares what the person held with what they would hold, so every
    route into a change is covered the same way: a list edited by hand, a
    profession carrying competencies over, or a new profession's template.
    Removal counts as much as granting.

    Args:
        actor: The caller.
        before: What the person holds now; empty for a new account.
        after: What they would hold once the request is applied.

    Raises:
        CompetenciesOutOfScope: Naming every competency out of scope.
    """
    refused = out_of_scope_competencies(actor, before ^ after)

    if refused:
        raise CompetenciesOutOfScope(refused)


def check_profession_in_scope(actor: User, profession: str) -> None:
    """Refuse a profession the caller may not give.

    Args:
        actor: The caller.
        profession: The base profession id being given. One the
            catalogue knows: the refusal repeats it to the caller.

    Raises:
        ProfessionOutOfScope: Naming the profession.
    """
    if not may_assign_profession(actor, profession):
        raise ProfessionOutOfScope(profession)


def check_account_in_scope(actor: User, target: User) -> None:
    """Refuse an act on a whole account the caller may not manage.

    A change of profession, name, email or password, a deactivation, a
    reactivation or an invite acts on the whole account. A scoped manager
    such as ``manage_teaching`` may do these only for somebody whose every
    competency is one they may grant, so a clinician who also sits
    teaching assessments stays out of their reach, and so does a delegate
    who holds anything more.

    Args:
        actor: The caller.
        target: The person whose account is being acted on.

    Raises:
        AccountOutOfScope: If the account is outside their scope.
    """
    if not may_manage_account(actor, target):
        raise AccountOutOfScope()


def check_may_set_platform_role(
    actor: User, *, sets_platform_role: bool
) -> None:
    """Refuse a platform role set by somebody whose scope has a limit.

    Args:
        actor: The caller.
        sets_platform_role: Whether the request would give the account a
            platform role other than the one it has, or for a new
            account, other than a standard one.

    Raises:
        PlatformRoleNotAllowed: If it would and the caller's scope is
            limited.
    """
    if sets_platform_role and not scope_for(actor).unlimited:
        raise PlatformRoleNotAllowed()


def check_not_granting_to_self(
    actor: User, target: User, *, sends_granting_field: bool
) -> None:
    """Refuse somebody changing what they themselves may do.

    Nobody awards themselves competencies. Ask another holder of
    ``manage_users`` to do it, so the person granting and the person
    gaining are never the same - which is what stops the competency
    becoming the key to its own lock. The same separation the NHS
    Registration Authority model relies on: an administrator records
    access that somebody else verified.

    An operator is exempt. They already reach everything, so the
    restriction would be theatre, and somebody has to be able to
    bootstrap a deployment.

    Name, email and password are deliberately not covered: those are
    ordinary self-service, available on the profile routes anyway, and
    blocking them here would be inconsistent rather than stricter.

    Args:
        actor: The caller.
        target: The person whose account is being changed.
        sends_granting_field: Whether the request carries a profession,
            either competency list or a platform role. Sent is enough:
            it need not differ from what is held.

    Raises:
        SelfGranting: If the caller is the target, is not an operator,
            and sent one of those fields.
    """
    if target.id != actor.id or actor.platform_role == "superadmin":
        return

    if sends_granting_field:
        raise SelfGranting()

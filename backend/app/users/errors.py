"""Why a change to somebody's account was refused.

The same shape as ``MessagingError`` in :mod:`app.messaging`. Each
refusal is a class that fixes its own words and status, so nothing can
reach a caller that somebody did not write for them to read.

All but five take no arguments. Two name catalogue ids:
:class:`CompetenciesOutOfScope` lists competency ids from
``shared/competency-definitions/``, and :class:`ProfessionOutOfScope`
names one base profession id from ``shared/base-professions.yaml``.
Those are identifiers the catalogue defines, not free text. The
profession id is checked against the catalogue as the request is read.
A competency id is either one the request named, checked the same way,
or one the person's own grant rows hold, which is the single place an
id comes from the database: it is still a catalogue id, and it is what
the caller is being told they may not remove.

Two repeat org unit ids the caller sent in the request, as integers:
:class:`PlaceNotFound` repeats one and
:class:`PractisingWhereNotAMember` lists several. They are the caller's
own numbers handed back to them, and are never looked up to build the
words: the refusal names no org unit and says nothing of whether one has
that id.

The fifth, :class:`PracticeRefused`, is a refusal made of other
refusals. It takes the :class:`app.org_units.errors.OrgUnitError`
refusals that ``practice_refusal`` gave for the changes a save asked
for, and joins their words. Each of those already has fixed words or
names a catalogue id, under the same rule in
:mod:`app.org_units.errors`, so nothing new can reach a caller through
it.

Nothing else may be passed: no account id, no query, no name, and
nothing a person typed.

The refusals of :mod:`app.users.register` are here too, though the
person refused is making their own account and administering nobody's.
One of them, :class:`UsernameOrEmailInUse`, is deliberately one class
for two reasons, so its words cannot come to say which.

The refusals of :mod:`app.users.invites` are here as well. The person
refused holds an invite to a patient's record and may have no account
yet. :class:`InviteTokenInvalid` is one class for every way a token can
be wrong, so its words cannot come to say which.

``app.main`` registers one handler for :class:`UserAdminError`, which
answers with the class's status and ``{"detail": message}``. That is the
body an ``HTTPException`` gives, so a rule moved out of a route answers
exactly as it did inside it.
"""

from app.org_units.errors import OrgUnitError


class UserAdminError(Exception):
    """A change to somebody's account that may not, or cannot, be made.

    A subclass fixes ``message`` as a class attribute and is raised with
    no arguments. The two that name catalogue ids, the two that repeat
    org unit ids from the request, and the one made of other refusals
    build their own words and hand them up.
    """

    status_code: int = 400
    message: str = "The request could not be completed"

    def __init__(self, message: str | None = None) -> None:
        if message is not None:
            self.message = message

        super().__init__(self.message)


class MissingRequiredFields(UserAdminError):
    message = "Missing required fields"


class UsernameTaken(UserAdminError):
    message = "Username already exists"


class EmailRequired(UserAdminError):
    message = "Email is required"


class EmailTaken(UserAdminError):
    message = "Email already exists"


class PasswordTooShort(UserAdminError):
    message = "Password must be at least 8 characters"


class NoPlaceChosen(UserAdminError):
    message = "Choose at least one organisation or site."


class AccountOutOfScope(UserAdminError):
    status_code = 403
    message = "This account is outside what you may manage."


class UserNotFound(UserAdminError):
    """An account the caller named that is not theirs to act on.

    One refusal for two reasons, in the same words: no account has that
    id, or one does at no org unit the caller reaches. The answer never
    confirms that somebody exists to a caller who may not see them.
    """

    status_code = 404
    message = "User not found"


class OperatorAccountNotAllowed(UserAdminError):
    """An operator's account, acted on by somebody who is not one."""

    status_code = 403
    message = "Cannot modify superadmin users"


class DeactivatingYourself(UserAdminError):
    message = "Cannot deactivate your own account"


class AlreadyDeactivated(UserAdminError):
    message = "User is already deactivated"


class AlreadyActive(UserAdminError):
    message = "User is already active"


class ProfessionOutOfScope(UserAdminError):
    """A base profession the caller may not give, named by its id."""

    status_code = 403

    def __init__(self, profession: str) -> None:
        super().__init__(f"You may not give the profession {profession}.")


class CompetenciesOutOfScope(UserAdminError):
    """Competencies the caller may not grant or remove, named by id."""

    status_code = 403

    def __init__(self, refused: list[str]) -> None:
        super().__init__(
            "You may not grant or remove: " + ", ".join(refused) + "."
        )


class PlatformRoleNotAllowed(UserAdminError):
    status_code = 403
    message = "You may not set a platform role."


class SuperadminRoleNotAllowed(UserAdminError):
    status_code = 403
    message = "Cannot grant the superadmin platform role"


class PatientPickerNotAllowed(UserAdminError):
    """The people around a patient, asked for by a limited scope.

    The words are the ones the competency gate gives somebody without
    ``manage_users``, which is what a caller whose scope has a limit
    is, here.
    """

    status_code = 403
    message = "Forbidden: User lacks required competency 'manage_users'"


class SelfGranting(UserAdminError):
    status_code = 403
    message = (
        "Competencies and platform role must be changed by another user "
        "who holds manage_users"
    )


class PlaceNotFound(UserAdminError):
    """An org unit the caller named that is not theirs to place people in.

    Takes the id as the caller sent it. The words are the same whether
    no org unit has that id or one does outside the caller's reach, so
    the answer never confirms that an org unit exists to somebody who
    cannot see it.
    """

    status_code = 404

    def __init__(self, org_unit_id: int) -> None:
        super().__init__(f"Place {org_unit_id} not found")


class EnrolmentNotAllowed(UserAdminError):
    """Teaching enrolments the caller may not settle.

    One refusal for two reasons, in the same words: the caller does not
    run teaching at all, or does not reach the organisation named. The
    answer does not say which.
    """

    status_code = 403
    message = "Not allowed"


class EnrolmentOutsideTheirOrganisations(UserAdminError):
    status_code = 422
    message = "Enrolment can be set only at an organisation they belong to."


class EnrolmentEndPassed(UserAdminError):
    status_code = 422
    message = "An enrolment's end date has already passed."


class SelfEnrolment(UserAdminError):
    status_code = 403
    message = "Somebody else must enrol you in teaching."


class ModuleNotServed(UserAdminError):
    status_code = 422
    message = "A module was named that the organisation does not serve."


class EnrolledBelongingNowhere(UserAdminError):
    status_code = 422
    message = (
        "They must belong to an org unit under the organisation before "
        "they can be enrolled."
    )


class PractisingWhereNotAMember(UserAdminError):
    """Practice sent for org units the person does not belong to.

    Takes the ids as the caller sent them, lowest first. They are not
    looked up: the words say only that the person is not a member there.
    """

    status_code = 422

    def __init__(self, org_unit_ids: list[int]) -> None:
        super().__init__(
            "Practice can be set only where they belong. Not a member "
            "of place " + ", ".join(str(unit) for unit in org_unit_ids) + "."
        )


class PracticeNotAllowed(UserAdminError):
    status_code = 403
    message = "You may not set where somebody practises."


class PracticeRefused(UserAdminError):
    """Changes to somebody's practice that the caller may not make.

    A refusal made of other refusals: the ones ``practice_refusal`` in
    :mod:`app.org_units.practice` gave, one for each change refused.
    Each already has fixed words or names a catalogue id, so joining
    them writes nothing new.

    One status, the first's, and every distinct reason: the form shows
    one message and it should say everything that was wrong.
    """

    def __init__(self, refusals: list[OrgUnitError]) -> None:
        if not refusals:
            raise ValueError("A refusal needs at least one reason.")

        reasons = list(dict.fromkeys(r.message for r in refusals))

        self.status_code = refusals[0].status_code
        super().__init__(" ".join(reasons))


class RegistrationFieldsMissing(UserAdminError):
    message = "Missing fields"


class UsernameOrEmailInUse(UserAdminError):
    """A registration naming a username or an address an account has.

    One refusal for two reasons, in the same words. Registration is
    open to anybody, so an answer that said which was taken would tell
    a stranger whether an address has an account.
    """

    message = "Username or email already in use"


class ClinicalLeadAndModuleRequired(UserAdminError):
    message = "A clinical lead and a module are required to join a site"


class ClinicalLeadNotRecognised(UserAdminError):
    message = "Clinical lead not recognised"


class SiteNotChosen(UserAdminError):
    message = "Choose which of the clinical lead's sites to join"


class SiteNotTheClinicalLeads(UserAdminError):
    message = "Site does not match the clinical lead"


class OrganisationNotFound(UserAdminError):
    message = "Organisation not found"


class SiteNotFound(UserAdminError):
    message = "Site not found"


class OrganisationRequiredForSite(UserAdminError):
    message = "org_unit_id required when site_id is provided"


class OrganisationRequiredForModule(UserAdminError):
    message = "org_unit_id required when teaching_module_id is provided"


class ModuleNotOpenToRegistration(UserAdminError):
    message = "Module is not open to registration"


class InviteTokenInvalid(UserAdminError):
    """An invite whose token cannot be taken as one.

    One refusal for every reason, in the same words: a token that has
    run out, one that was altered, one that was never a token, and one
    signed here for some other purpose.
    """

    message = "Invalid or expired invite token"


class InviteNeedsUsernameAndPassword(UserAdminError):
    status_code = 422
    message = "username and password required for new registration"


class InviteUsernameTaken(UserAdminError):
    """A username an account already has, chosen while accepting an invite.

    Not :class:`UsernameTaken`: this route has always answered 409 and
    in these words.
    """

    status_code = 409
    message = "Username already taken"

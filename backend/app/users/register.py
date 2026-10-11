"""Somebody making their own account: the whole of it, in one place.

Registration is open to anybody, with nobody signed in. This module
checks what was sent, works out for itself where a clinical lead's
address admits the person, and writes the account, whether they want
news, where they belong, where they take modules and what they are
enrolled on.

The order is the rule, here as in :mod:`app.users.create`. What was
sent is checked first, then that the username and the address are free,
then the clinical lead. The account is written only after all three,
and the checks that follow it rest on the rollback of the caller's
transaction to leave nobody behind.

Sending the verification email is not here. The route commits what
this wrote and then sends it, so no message goes out for an account
that failed to save. A message that could not be sent still abandons
the registration: the route hands the account to ``undo_registration``,
which removes everything written here for it.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.cbac.positions import clinical_leads_of
from app.features.teaching.access import MODULES_COMPETENCY, give_place
from app.features.teaching.enrolment import enrol as enrol_on_module
from app.features.teaching.models import (
    ModuleEnrolment,
    QuestionBankOrgStatus,
)
from app.marketing.preferences import (
    MARKETING_WORDING_VERSION,
    set_marketing_preference,
)
from app.models import (
    MarketingPreferenceChange,
    OrgUnit,
    PractisingCompetency,
    User,
    UserCompetency,
    normalise_email,
    org_unit_member,
)
from app.org_units import ROOT_TYPE_IDS
from app.org_units.tree import (
    descendant_ids,
    organisation_org_unit_of_site,
    root_ids_of,
)
from app.organisations import add_org_unit_member, organisation_org_units_of
from app.schemas.auth import ClinicalLeadSite, ValidateClinicalLeadOut
from app.security import hash_password
from app.users.errors import (
    ClinicalLeadAndModuleRequired,
    ClinicalLeadNotRecognised,
    ModuleNotOpenToRegistration,
    OrganisationNotFound,
    OrganisationRequiredForModule,
    OrganisationRequiredForSite,
    RegistrationFieldsMissing,
    SiteNotChosen,
    SiteNotFound,
    SiteNotTheClinicalLeads,
    UsernameOrEmailInUse,
)
from app.users.identity import check_password_long_enough

#: The profession ``register_account`` gives everybody, and so the only
#: one ``undo_registration`` will remove.
REGISTERED_PROFESSION = "teaching_delegate"

#: How long after it was written a registration may still be undone.
#: The undo follows the failed email within seconds. An account older
#: than this is not one that has just been registered.
UNDO_WINDOW = timedelta(minutes=5)


@dataclass(frozen=True)
class Registration:
    """What the registration form sent.

    Attributes:
        username: What they will sign in with. Held trimmed.
        email: Their address. Held trimmed and in lower case.
        password: Their password, as typed.
        full_name: Their name. Held trimmed, and blank is held as none.
        org_unit_id: The organisation the browser says they are joining.
            Only compared with what the clinical lead's address gives.
        site_id: The site the browser says they are joining. The choice
            where the lead holds the post at several, and otherwise only
            compared in the same way.
        marketing_opt_out: Whether they ticked the box asking not to be
            sent news. None means the form never showed it.
        teaching_module_id: The module whose join link they came through.
        clinical_lead_email: The clinical lead whose address admits them.
    """

    username: str
    email: str
    password: str
    full_name: str | None = None
    org_unit_id: int | None = None
    site_id: int | None = None
    marketing_opt_out: bool | None = None
    teaching_module_id: str | None = None
    clinical_lead_email: str | None = None


def register_account(db: Session, new: Registration) -> User:
    """Make the account somebody registered for, with everything on it.

    The checks run in a fixed order, so when two things are wrong the
    same one is always reported: what was sent, the password, the
    username, the address, then the clinical lead. A username that is
    taken and an address that is taken are refused in the same words,
    so the answer never says which, nor whether an address has an
    account.

    Everybody registering is a teaching delegate, and their address is
    not yet verified: the caller sends the message that verifies it.

    Everything is flushed and nothing is committed. Some refusals come
    after the account is written, so the caller's transaction must be
    rolled back on any of them, which is what the session dependency
    does when a route raises.

    Args:
        db: Core database session.
        new: What the form sent.

    Returns:
        The account, flushed, so it has its id.

    Raises:
        RegistrationFieldsMissing: If the username, the address or the
            password is empty.
        PasswordTooShort: If the password is under eight characters.
        UsernameOrEmailInUse: If an account has the username or the
            address.
        ClinicalLeadAndModuleRequired: If an organisation, a site or a
            module was named without both a clinical lead and a module.
        ClinicalLeadNotRecognised: If the address is no clinical lead's
            for that module.
        SiteNotChosen: If the lead holds the post at several sites and
            none was named.
        SiteNotTheClinicalLeads: If the site or the organisation named
            is not the one the lead's address gives.
        OrganisationNotFound: If what the lead's address gives is not
            an organisation.
        SiteNotFound: If the site is the top of a tree, or is not
            beneath the organisation.
        ModuleNotOpenToRegistration: If the organisation has not opened
            the module to registration.
    """
    username = new.username.strip()
    email = normalise_email(new.email)

    if not username or not email or not new.password:
        raise RegistrationFieldsMissing()

    check_password_long_enough(new.password)
    _check_username_and_email_free(db, username, email)

    org_unit_id, site_id = _where_the_clinical_lead_admits(db, new)

    user = User(
        username=username,
        full_name=(
            new.full_name.strip()
            if new.full_name and new.full_name.strip()
            else None
        ),
        email=email,
        password_hash=hash_password(new.password),
        # Self-registration is refused by the route where clinical
        # services are on, so everybody arriving here is a teaching
        # delegate. Given to the constructor, not assigned afterwards:
        # the constructor is what writes a profession's competencies as
        # rows, and it wrote a patient's for an account that was then
        # relabelled. A registered delegate held nothing from teaching
        # at all.
        base_profession=REGISTERED_PROFESSION,
    )

    db.add(user)
    db.flush()  # Assigns user.id so we can create memberships

    # Registration is an opt-out: somebody shown the sentence who leaves
    # the box unticked is sent news. A form that never showed it sends
    # nothing here, and that person is left unsubscribed.
    if new.marketing_opt_out is not None:
        set_marketing_preference(
            db,
            user,
            wants=not new.marketing_opt_out,
            source="registration",
            wording_version=MARKETING_WORDING_VERSION,
            first_answer=True,
        )

    if org_unit_id is not None:
        _join_organisation(db, user, org_unit_id)

    if site_id is not None:
        _join_site(db, user, site_id, org_unit_id)

    # Belonging somewhere is not enough to take its modules: teaching
    # asks for a row saying where. Registering through a centre's link
    # is how a delegate arrives, so the row is written here, at the site
    # they named or else the organisation. Nobody is signed in to be
    # named as having authorised it; the link admitted them.
    place_id = site_id or org_unit_id

    if (
        place_id is not None
        and MODULES_COMPETENCY in user.get_final_competencies()
    ):
        give_place(db, user, place_id)

    if new.teaching_module_id is not None:
        _enrol_through_the_link(db, user, new.teaching_module_id, org_unit_id)

    return user


def undo_registration(db: Session, user_id: int) -> None:
    """Remove an account just registered, and all that went with it.

    For the one case where the verification email could not be sent.
    The account is by then committed, and nobody can verify it, so it is
    taken away again and the username and the address are free.

    Every table ``register_account`` writes to is cleared of this
    person's rows by name, and then the account goes. The database
    would remove most of them itself as the account went, but that is
    not relied on: each table is named so a reader can see the whole
    list, and so the unit tests, whose SQLite does not enforce foreign
    keys, prove the same thing.

    It refuses anything that is not plainly a registration made moments
    ago, so it can never be turned on a real account by mistake. Each
    refusal is a ``ValueError``: a mistake in the calling code, not
    something a person did.

    The rows are flushed away, not committed.

    Args:
        db: Core database session.
        user_id: The account ``register_account`` just returned.

    Raises:
        ValueError: If there is no such account, or it is verified, has
            had its password changed, has two-factor sign-in set up, is
            not a registered delegate, is an operator, or was not
            written within ``UNDO_WINDOW``.
    """
    user = db.get(User, user_id)

    if user is None:
        raise ValueError(f"No user {user_id} to undo the registration of.")

    # Signing in is refused until the address is verified, so an
    # unverified account is also one nobody has signed in to.
    if user.email_verified:
        raise ValueError(f"User {user_id} is verified, so is not undone.")

    if user.token_version != 0:
        raise ValueError(
            f"User {user_id} has changed their password, so is not undone."
        )

    if user.is_totp_enabled or user.totp_secret is not None:
        raise ValueError(
            f"User {user_id} has two-factor sign-in, so is not undone."
        )

    if (
        user.base_profession != REGISTERED_PROFESSION
        or user.platform_role != "standard"
    ):
        raise ValueError(
            f"User {user_id} is not a registered delegate, so is not undone."
        )

    # The account has no date of its own. The rows its profession wrote
    # were made with it, so the oldest of them says when it was made. An
    # account with none cannot be dated, and is refused.
    written_at = db.scalar(
        select(func.min(UserCompetency.created_at)).where(
            UserCompetency.user_id == user_id
        )
    )

    if written_at is None:
        raise ValueError(f"User {user_id} cannot be dated, so is not undone.")

    # SQLite hands the date back without its timezone. It was written
    # as UTC.
    if written_at.tzinfo is None:
        written_at = written_at.replace(tzinfo=UTC)

    if datetime.now(UTC) - written_at > UNDO_WINDOW:
        raise ValueError(
            f"User {user_id} was not registered just now, so is not undone."
        )

    # Everything that points at the account first, then the account.
    db.execute(
        delete(ModuleEnrolment).where(ModuleEnrolment.user_id == user_id)
    )
    db.execute(
        delete(PractisingCompetency).where(
            PractisingCompetency.user_id == user_id
        )
    )
    db.execute(
        org_unit_member.delete().where(org_unit_member.c.user_id == user_id)
    )
    db.execute(
        delete(MarketingPreferenceChange).where(
            MarketingPreferenceChange.user_id == user_id
        )
    )
    db.execute(delete(UserCompetency).where(UserCompetency.user_id == user_id))
    db.execute(delete(User).where(User.id == user_id))
    db.flush()


def _check_username_and_email_free(
    db: Session, username: str, email: str
) -> None:
    """Refuse a username or an address an account already has.

    Not the checks in :mod:`app.users.identity`, which say which of the
    two was taken. Those answer an administrator. This answers anybody.

    Raises:
        UsernameOrEmailInUse: If any account has either.
    """
    # Use generic message to prevent account enumeration
    if db.scalar(select(User).where(User.username == username)):
        raise UsernameOrEmailInUse()

    if db.scalar(select(User).where(User.email == email)):
        raise UsernameOrEmailInUse()


def _where_the_clinical_lead_admits(
    db: Session, new: Registration
) -> tuple[int | None, int | None]:
    """Work out the organisation and the site somebody is to join.

    Returns:
        The organisation and the site, as org unit ids. Both None where
        no organisation, site or module was named: the person then joins
        nowhere. Otherwise both are set, from the clinical lead's
        address and never from what the browser sent.

    Raises:
        ClinicalLeadAndModuleRequired: If either is missing.
        ClinicalLeadNotRecognised: If the address admits nobody.
        SiteNotChosen: If the lead has several sites and none was named.
        SiteNotTheClinicalLeads: If the site or the organisation named
            differs from the lead's.
    """
    # A site or a module is only ever reached through a clinical lead.
    # The first step checked theirs and told the browser which site and
    # organisation that meant; the browser then sends those back, and a
    # crafted request could send any others. So the lead is named again
    # here and the server works both out for itself. What the browser
    # sent is only compared with that, and refused if it differs.
    #
    # An organisation named on its own is held to the same rule. It used
    # to join that organisation as a trainee with nothing checked: no
    # page sends it, but a crafted request could.
    if (
        new.org_unit_id is None
        and new.site_id is None
        and new.teaching_module_id is None
    ):
        return new.org_unit_id, new.site_id

    if new.clinical_lead_email is None or new.teaching_module_id is None:
        raise ClinicalLeadAndModuleRequired()

    admitted = clinical_lead_site(
        db, new.clinical_lead_email, new.teaching_module_id
    )

    if not admitted.valid or not admitted.sites:
        raise ClinicalLeadNotRecognised()

    # A lead at one site needs no site named. A lead at several
    # does: the delegate chose on the page, and a request without
    # the choice is refused, never settled by taking the first.
    if new.site_id is None:
        if len(admitted.sites) > 1:
            raise SiteNotChosen()
        chosen = admitted.sites[0]
    else:
        matching = [
            site for site in admitted.sites if site.site_id == new.site_id
        ]
        if not matching:
            raise SiteNotTheClinicalLeads()
        chosen = matching[0]

    if new.org_unit_id not in (None, chosen.org_unit_id):
        raise SiteNotTheClinicalLeads()

    return chosen.org_unit_id, chosen.site_id


def _join_organisation(db: Session, user: User, org_unit_id: int) -> None:
    """Make *user* a trainee of the organisation they are joining.

    Raises:
        OrganisationNotFound: If the org unit is not an organisation.
    """
    # Add the user to the org_unit they named. It has to be an
    # organisation: registration offers the tops of trees, and a
    # membership of a ward is what joining a site writes.
    if org_unit_id not in organisation_org_units_of(db, [org_unit_id]):
        raise OrganisationNotFound()

    # Public registration is how teaching delegates arrive, and they
    # are not staff. Recording that here is what lets the admin page
    # and the messaging self-join check tell them apart; previously
    # nothing could.
    add_org_unit_member(db, org_unit_id, user.id, "trainee")


def _join_site(
    db: Session, user: User, site_id: int, org_unit_id: int | None
) -> None:
    """Make *user* a trainee of the site they are joining.

    Only the site at the top of a tree can be refused here today. The
    organisation is always given, and the site is always beneath it,
    because both now come from the clinical lead's address. The other
    refusals stay so that a caller who one day passes anything else is
    still refused.

    Raises:
        OrganisationRequiredForSite: If no organisation was given.
        SiteNotFound: If the site does not exist, is the top of a tree,
            or is not beneath the organisation.
    """
    if org_unit_id is None:
        raise OrganisationRequiredForSite()

    # Verify the org_unit exists AND sits beneath the organisation given
    site = db.get(OrgUnit, site_id)

    # There is more than one kind of organisation - a practice and a
    # teaching establishment are both tops of trees - so the test is
    # the flag, not one name.
    if site is None or site.type in ROOT_TYPE_IDS:
        raise SiteNotFound()

    if organisation_org_unit_of_site(db, site_id) != org_unit_id:
        raise SiteNotFound()

    db.execute(
        org_unit_member.insert().values(
            org_unit_id=site_id,
            user_id=user.id,
            capacity="trainee",
        )
    )


def _enrol_through_the_link(
    db: Session, user: User, module_id: str, org_unit_id: int | None
) -> None:
    """Enrol *user* on the module whose join link they came through.

    The organisation is always given today, for the reason in
    ``_join_site``.

    Raises:
        OrganisationRequiredForModule: If no organisation was given.
        ModuleNotOpenToRegistration: If the organisation has not opened
            the module to registration.
    """
    # The join link names a module, and arriving through it enrols the
    # person on that module and no other. Only where the organisation
    # has opened the module to registration, which is what the public
    # module list reads: otherwise a crafted request could enrol
    # somebody on anything the organisation serves.
    if org_unit_id is None:
        raise OrganisationRequiredForModule()

    open_to_registration = db.scalar(
        select(QuestionBankOrgStatus.id).where(
            QuestionBankOrgStatus.org_unit_id == org_unit_id,
            QuestionBankOrgStatus.question_bank_id == module_id,
            QuestionBankOrgStatus.site_registration.is_(True),
        )
    )

    if open_to_registration is None:
        raise ModuleNotOpenToRegistration()

    enrol_on_module(
        db,
        user.id,
        org_unit_id=org_unit_id,
        question_bank_id=module_id,
        source="registration",
    )


def clinical_lead_site(
    db: Session, email: str, bank_id: str
) -> ValidateClinicalLeadOut:
    """Work out where a clinical lead's email admits somebody for a bank.

    The one place this rule lives. The first step of registration asks it
    through ``validate_clinical_lead`` to say which site a delegate is
    joining, and ``register_account`` asks it again, because what the
    browser sends back in between proves nothing.

    Args:
        db: Database session.
        email: The clinical lead's email, as typed.
        bank_id: The teaching module being joined.

    Returns:
        ``valid`` is true only where the email belongs to somebody who is
        clinical lead at a site beneath an organisation that has opened
        the bank to registration. ``sites`` lists every such site by
        name. The single site and organisation come with it only where
        there is one: with several the delegate chooses.
    """
    email = normalise_email(email)

    # Find the user by email (case-insensitive)
    user = (
        db.execute(select(User).where(User.email.ilike(email)))
        .scalars()
        .first()
    )

    if not user:
        return ValidateClinicalLeadOut(valid=False)

    # The org_units offering this bank for site registration. Counted in
    # org_unit ids, which is what the table holds.
    place_ids = (
        db.execute(
            select(QuestionBankOrgStatus.org_unit_id).where(
                QuestionBankOrgStatus.question_bank_id == bank_id,
                QuestionBankOrgStatus.site_registration.is_(True),
            )
        )
        .scalars()
        .all()
    )
    offering = [p for p in place_ids if p is not None]

    if not offering:
        return ValidateClinicalLeadOut(valid=False)

    # Every org_unit beneath them, at any depth. The offering org_units are
    # organisations' own rows, so they are roots and excluded - a lead
    # holds their post at a ward, not at the trust.
    site_ids = sorted(descendant_ids(db, offering))

    if not site_ids:
        return ValidateClinicalLeadOut(valid=False)

    # Which of those sites this user holds the clinical lead post at.
    # Read from positions rather than site_member.role: the post is
    # the thing being asked about, and a post can be vacant, which a role
    # column cannot express.
    leads = clinical_leads_of(db, list(site_ids))
    held_at = [site_id for site_id, lead in leads.items() if lead == user.id]

    if not held_at:
        return ValidateClinicalLeadOut(valid=False)

    # Every one of them, not the first. A lead may hold the post at two
    # hospitals, and taking whichever came first put a delegate at a site
    # nobody had chosen. Kept only where the organisation accountable for
    # the site is one offering the bank.
    names = {
        row.id: row.name
        for row in db.execute(
            select(OrgUnit.id, OrgUnit.name).where(OrgUnit.id.in_(held_at))
        )
    }
    roots = root_ids_of(db, held_at)
    sites: list[ClinicalLeadSite] = []

    for held_site_id in held_at:
        accountable = roots.get(held_site_id)
        if accountable is None or accountable not in offering:
            continue
        sites.append(
            ClinicalLeadSite(
                site_id=held_site_id,
                site_name=names.get(held_site_id, ""),
                org_unit_id=accountable,
            )
        )
    sites.sort(key=lambda site: (site.site_name.casefold(), site.site_id))
    if not sites:
        return ValidateClinicalLeadOut(valid=False)

    # One site is the answer. Several are a question for the delegate,
    # so the single fields are left empty and nothing is picked here.
    if len(sites) > 1:
        return ValidateClinicalLeadOut(valid=True, sites=sites)

    only = sites[0]

    return ValidateClinicalLeadOut(
        valid=True,
        sites=sites,
        site_name=only.site_name,
        org_unit_id=only.org_unit_id,
        site_id=only.site_id,
    )

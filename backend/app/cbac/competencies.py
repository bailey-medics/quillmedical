# backend/app/cbac/competencies.py
"""Competency definitions loaded from YAML.

This module loads and validates competency definitions from the
shared/competency-definitions/ directory, merging every file in it into
one catalogue and providing type-safe access to competency IDs and
metadata.
"""

from collections.abc import Iterable
from datetime import date
from enum import Enum
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict

from app.paths import SHARED_DIR


class CompetencyLevel(BaseModel):
    """One step on a competency's scale.

    Levels are words rather than numbers, and their order is the order
    they are listed in. ``level-3`` needs a lookup table to mean
    anything, and every stored record becomes wrong the moment a scale
    gains or loses a step; "Entrusted to act unsupervised" explains
    itself and survives the scale changing around it.

    The names come from whichever national framework defines the
    competency - the RCR entrustment scale, the UK SACT Board's four
    levels - and are quoted rather than harmonised, so a sign-off means
    what the framework says it means.

    Attributes:
        id: Stable identifier for this level, referenced by a sign-off.
        name: The framework's own wording, shown to a reader.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str


class CompetencyScope(BaseModel):
    """One thing a sign-off for a competency may cover.

    Some competencies are signed off one part of practice at a time:
    prescribing chemotherapy for lung cancer is assessed apart from
    prescribing it for breast cancer, though both are the one act. A
    scope names the part, so the two sit side by side rather than the
    later replacing the earlier.

    Picked from this list and never typed, because a signed record
    cannot be edited and the scope decides which sign-offs form one
    history: "Breast" and "breast cancer" would be two.

    Attributes:
        id: Stable identifier for this scope, referenced by a record.
        name: What a reader is shown.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str


class Specialty(BaseModel):
    """A word a framework may be filed under.

    A filter and nothing else: nobody chooses one, and no access turns
    on one. Listed in ``shared/specialties.yaml`` so a framework naming a
    specialty can be checked against the list.

    Attributes:
        id: Stable identifier, named by a framework.
        display_name: What a reader is shown.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    display_name: str


class Framework(BaseModel):
    """One published document a clinician works to, as a set of competencies.

    The UK SACT Board's prescriber competencies are a framework; so is
    one hospital's own sign-off sheet. Each is one file in the
    definitions directory, declaring itself with a ``framework:`` block
    above its competencies, and its items are the assessable entries of
    that file. A clinician chooses the frameworks they work to and is
    offered what those contain, so the passport never lists every
    competency Quill knows.

    Quill hosts each framework as its publisher wrote it and writes no
    standard of its own: the words, the order and the levels are the
    document's. A revised document is a new framework, not an edit, so a
    sign-off keeps the words it was signed under.

    Attributes:
        id: Stable identifier, and the file's name without ``.yaml``.
        name: What a reader is shown.
        publisher: Who wrote the document.
        version: Which edition, in the publisher's own words.
        specialties: The specialties it is filed under, from
            ``shared/specialties.yaml``. Empty where it belongs to
            every specialty, as general clinical skills do.
        passport_only: Whether its entries exist only to be recorded in
            a passport. True for a framework written from a paper form,
            whose statements nobody should be granted as a permission.
            Such entries are refused at every place a competency is
            granted, and their ids must start with the framework's id.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    publisher: str
    version: str
    specialties: list[str] = []
    passport_only: bool = False


#: The scope every list must offer, so somebody whose part of practice
#: is not listed yet is never blocked. The detail goes in the record's
#: comment, and the real entry is added when it comes up.
OTHER_SCOPE_ID: str = "other"


class CompetencyEntry(BaseModel):
    """A single competency definition, validated from YAML.

    Attributes:
        id: The competency id, used everywhere a competency is referenced.
        display_name: Human-readable name.
        retired_on: The date this competency stopped being available for new
            use, or None while it is current. Entries are retired rather
            than deleted - see ``retired_on`` handling below and
            ``docs/docs/plans/2026-09-06-org-scoped-access-findings.md``.
        levels: The scale this competency is signed off against, in
            order, or None where the honest answer is simply signed off
            or not. Declared per competency because the number of levels
            genuinely differs: cannulation is signed off or it is not,
            while prescribing SACT has real intermediate states. Used by
            the clinician passport; CBAC ignores it entirely, since
            holding a competency is a yes or no question.
        scopes: What a sign-off or a logbook entry for this competency
            may cover, or None where it is assessed as a whole. Must
            include ``other``. Used by the clinician passport; CBAC
            ignores it, since somebody holds a competency or does not.
        expires_after_months: How long a sign-off stands before it wants
            revisiting, or None where nothing expires. Recorded and
            shown; nothing acts on it, because what a lapsed sign-off
            implies is a clinical decision rather than a technical one.
        assessable: Whether somebody can watch this being done and sign
            it off, so whether the clinician passport may record it.
            Opt-in, and false unless the definition says otherwise:
            ``manage_users`` or ``access_own_patient_records`` is a
            software permission, not a skill, and anything added for
            access control stays out of the passport until somebody
            decides it belongs there. CBAC ignores it.
        framework_id: The framework this entry belongs to, or None. Set
            by the loader from the file the entry is in, never written in
            the YAML: an entry cannot be filed in one framework and claim
            another.
        may_grant: The competencies a holder of this one may grant to
            and remove from other people, or None where holding it
            gives no such authority. A whitelist on the granting
            competency, so nothing new can be granted without
            somebody adding it here. ``manage_users`` has no list:
            it may grant anything, and is checked separately in
            ``app.cbac.grant_scope``.
        may_assign_professions: The base professions a holder may give
            somebody, or None. Read with ``may_grant``.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    display_name: str
    retired_on: date | None = None
    levels: list[CompetencyLevel] | None = None
    scopes: list[CompetencyScope] | None = None
    expires_after_months: int | None = None
    assessable: bool = False
    framework_id: str | None = None
    may_grant: list[str] | None = None
    may_assign_professions: list[str] | None = None


# Load competencies from every YAML file in the definitions directory.
#
# A directory rather than one file, so the catalogue can be split by kind
# - clinical.yaml describes what may be done to a patient, and
# admin.yaml what may be done to Quill - and split further later
# without touching this loader. The files are merged into one flat
# catalogue and the id is what everything references.
#
# Which file an entry lives in carries no meaning to access control. It
# carries one meaning to the clinician passport: a file that declares a
# ``framework:`` block is a framework, and the assessable entries in it
# are that framework's items.
COMPETENCY_DEFINITIONS_DIR: Path = SHARED_DIR / "competency-definitions"

SPECIALTIES_FILE: Path = SHARED_DIR / "specialties.yaml"


def _load_specialties(path: Path) -> list[Specialty]:
    """Read the specialties a framework may be filed under.

    Args:
        path: The specialties file.

    Returns:
        The specialties, in the order the file lists them.

    Raises:
        ValueError: If an id is listed twice.
    """
    with open(path) as f:
        data: Any = yaml.safe_load(f)

    specialties = [Specialty(**raw) for raw in data["specialties"]]
    ids = [specialty.id for specialty in specialties]

    if len(set(ids)) != len(ids):
        raise ValueError(
            f"Duplicate specialty ids in {path.name}: "
            + ", ".join(sorted(ids))
            + "."
        )

    return specialties


SPECIALTIES: list[Specialty] = _load_specialties(SPECIALTIES_FILE)

SPECIALTY_IDS: tuple[str, ...] = tuple(s.id for s in SPECIALTIES)


def _load_competencies(directory: Path) -> list[CompetencyEntry]:
    """Read and merge every competency definition file in *directory*.

    Args:
        directory: The directory holding the definition files.

    Returns:
        Every competency defined across the directory, in filename order.
        See :func:`_load_catalogue`, which also returns the frameworks
        and raises for everything this does.
    """
    return _load_catalogue(directory)[0]


def _framework_of(data: Any, path: Path) -> Framework | None:
    """The framework a definition file declares, or None.

    Args:
        data: The parsed file.
        path: The file, named in a refusal.

    Returns:
        The framework, where the file has a ``framework:`` block.

    Raises:
        ValueError: If its id is not the file's name, or it names a
            specialty that is not listed. A misspelt specialty would
            hide the framework from a filter without a word.
    """
    raw = data.get("framework")
    if raw is None:
        return None

    framework = Framework(**raw)

    if framework.id != path.stem:
        raise ValueError(
            f"Framework {framework.id!r} is declared in {path.name}. A "
            "framework's id is its file's name, so the two cannot differ."
        )

    unknown = sorted(set(framework.specialties) - set(SPECIALTY_IDS))
    if unknown:
        raise ValueError(
            f"Framework {framework.id!r} in {path.name} names "
            + ("specialties" if len(unknown) > 1 else "a specialty")
            + " not in shared/specialties.yaml: "
            + ", ".join(unknown)
            + "."
        )

    return framework


def _check_belongs(
    entry: CompetencyEntry, framework: Framework | None, path: Path
) -> None:
    """Refuse an entry whose framework cannot hold it.

    Args:
        entry: The competency being loaded.
        framework: The framework its file declares, if any.
        path: The file, named in a refusal.

    Raises:
        ValueError: If an active assessable entry is in no framework, so
            no clinician could ever be offered it; or an entry in a
            passport-only framework is not assessable, or does not carry
            the framework's id at the front of its own.
    """
    if framework is None:
        if entry.assessable and entry.retired_on is None:
            raise ValueError(
                f"Competency {entry.id!r} in {path.name} is assessable "
                "and belongs to no framework. The passport offers only "
                "what a framework contains, so add a framework: block to "
                "the file or move the entry into one."
            )
        return

    if not framework.passport_only:
        return

    if not entry.assessable:
        raise ValueError(
            f"Competency {entry.id!r} in {path.name} is not assessable, "
            f"in a framework marked passport_only. Every entry of "
            f"{framework.id!r} exists to be recorded in a passport."
        )

    if not entry.id.startswith(f"{framework.id}_"):
        raise ValueError(
            f"Competency {entry.id!r} in {path.name} must start with "
            f"{framework.id + '_'!r}. Ids are unique across the directory, "
            "and two frameworks describing the same act need two."
        )


def _load_catalogue(
    directory: Path,
) -> tuple[list[CompetencyEntry], list[Framework]]:
    """Read every definition file: the competencies, and the frameworks.

    Args:
        directory: The directory holding the definition files.

    Returns:
        Every competency defined across the directory, in filename
        order, and every framework a file declares, in the same order.

    Raises:
        FileNotFoundError: If the directory holds no definition files at
            all, which means a missing mount or a bad path rather than an
            empty catalogue.
        ValueError: If an id is defined in more than one file. Ids are
            referenced from stored records, so a duplicate makes which
            definition applies depend on filename order.
    """
    # Sorted so the merged order is the same on every machine, whatever
    # order the filesystem hands the entries back in.
    paths = sorted(directory.glob("*.yaml"))
    if not paths:
        raise FileNotFoundError(
            f"No competency definitions found in {directory}. Expected at "
            "least one *.yaml file."
        )

    entries: list[CompetencyEntry] = []
    frameworks: list[Framework] = []
    seen: dict[str, Path] = {}
    for path in paths:
        with open(path) as f:
            data: Any = yaml.safe_load(f)

        framework = _framework_of(data, path)
        if framework is not None:
            frameworks.append(framework)

        for raw in data["competencies"]:
            if "framework_id" in raw:
                raise ValueError(
                    f"Competency {raw.get('id')!r} in {path.name} sets "
                    "framework_id. An entry belongs to the framework its "
                    "file declares, and cannot name another."
                )

            entry = CompetencyEntry(**raw)
            if framework is not None:
                entry = entry.model_copy(update={"framework_id": framework.id})

            _check_belongs(entry, framework, path)

            # A sign-off stores the level id, so two levels sharing one
            # would make a stored record ambiguous about which step of
            # the scale was reached.
            if entry.levels is not None:
                level_ids = [lvl.id for lvl in entry.levels]
                if len(set(level_ids)) != len(level_ids):
                    raise ValueError(
                        f"Competency {entry.id!r} in {path.name} has "
                        "duplicate level ids: "
                        + ", ".join(sorted(level_ids))
                        + "."
                    )
                if not level_ids:
                    raise ValueError(
                        f"Competency {entry.id!r} in {path.name} declares "
                        "an empty level list. Omit levels entirely where a "
                        "competency is simply signed off or not."
                    )

            _check_scopes(entry, path)

            if entry.id in seen:
                raise ValueError(
                    f"Duplicate competency id {entry.id!r}: defined in "
                    f"{seen[entry.id].name} and {path.name}. Ids must be "
                    "unique across the whole directory."
                )
            seen[entry.id] = path
            entries.append(entry)

    _check_may_grant(entries, frameworks)
    return entries, frameworks


def _check_scopes(entry: CompetencyEntry, path: Path) -> None:
    """Refuse a scope list a record could not rely on.

    Args:
        entry: The competency being loaded.
        path: The file it came from, named in the refusal.

    Raises:
        ValueError: If the list is empty, repeats an id, or leaves out
            ``other``. A record stores the scope id, so two scopes
            sharing one would make it ambiguous what was signed off.
    """
    if entry.scopes is None:
        return

    scope_ids = [scope.id for scope in entry.scopes]

    if not scope_ids:
        raise ValueError(
            f"Competency {entry.id!r} in {path.name} declares an empty "
            "scope list. Omit scopes entirely where a competency is "
            "assessed as a whole."
        )

    if len(set(scope_ids)) != len(scope_ids):
        raise ValueError(
            f"Competency {entry.id!r} in {path.name} has duplicate scope "
            "ids: " + ", ".join(sorted(scope_ids)) + "."
        )

    if OTHER_SCOPE_ID not in scope_ids:
        raise ValueError(
            f"Competency {entry.id!r} in {path.name} declares scopes with "
            f"no {OTHER_SCOPE_ID!r}. Every list needs one, so nobody is "
            "blocked by a missing entry."
        )


#: The root competency. Its holder may grant anything, so naming it in
#: another competency's ``may_grant`` would hand the root on through a
#: side door.
ROOT_COMPETENCY: str = "manage_users"

#: The paid half of the clinician passport. Somebody gets it by paying,
#: by joining an org unit whose cover is on, or from a Passport admin. So
#: exactly one scoped manager may name it on its ``may_grant`` list:
#: ``SOLD_COMPETENCY_GRANTER``. Any other list naming it would let that
#: manager give away what is sold, and nothing would visibly go wrong: the
#: person would simply be able to write.
SOLD_COMPETENCY: str = "passport_write"

#: The one scoped manager whose whitelist may include ``SOLD_COMPETENCY``.
SOLD_COMPETENCY_GRANTER: str = "manage_passport"


def _check_may_grant(
    entries: list[CompetencyEntry], frameworks: list[Framework]
) -> None:
    """Refuse a ``may_grant`` list naming anything it should not.

    Checked at load, because a misspelt id in a whitelist fails silently:
    it names a competency nobody can be given, and the one meant is left
    out without a word.

    Args:
        entries: The whole merged catalogue.
        frameworks: The frameworks the directory declares.

    Raises:
        ValueError: If a list names an unknown or retired competency,
            the root competency, an entry of a passport-only framework,
            or the sold one on any list but its granter's.
    """
    passport_only = {f.id for f in frameworks if f.passport_only}
    by_id = {entry.id: entry for entry in entries}
    for entry in entries:
        for granted in entry.may_grant or []:
            target = by_id.get(granted)
            if target is None:
                raise ValueError(
                    f"Competency {entry.id!r} may_grant names unknown "
                    f"competency {granted!r}."
                )
            if target.retired_on is not None:
                raise ValueError(
                    f"Competency {entry.id!r} may_grant names retired "
                    f"competency {granted!r}."
                )
            if target.framework_id in passport_only:
                raise ValueError(
                    f"Competency {entry.id!r} may_grant names {granted!r}, "
                    "which exists only to be recorded in a passport and "
                    "is granted to nobody."
                )
            if granted == ROOT_COMPETENCY:
                raise ValueError(
                    f"Competency {entry.id!r} may_grant names "
                    f"{ROOT_COMPETENCY!r}, which may only be granted by "
                    "its own holders."
                )
            if (
                granted == SOLD_COMPETENCY
                and entry.id != SOLD_COMPETENCY_GRANTER
            ):
                raise ValueError(
                    f"Competency {entry.id!r} may_grant names "
                    f"{SOLD_COMPETENCY!r}, which is sold rather than "
                    f"granted. Only {SOLD_COMPETENCY_GRANTER!r} may."
                )


COMPETENCIES: list[CompetencyEntry]
FRAMEWORKS: list[Framework]
COMPETENCIES, FRAMEWORKS = _load_catalogue(COMPETENCY_DEFINITIONS_DIR)

FRAMEWORK_IDS: tuple[str, ...] = tuple(f.id for f in FRAMEWORKS)

# The ids that exist only to be recorded in a passport: the entries of a
# framework written from a paper form. Refused wherever a competency is
# granted, since nobody should hold "can define the mechanism of action"
# as a permission.
PASSPORT_ONLY_COMPETENCY_IDS: tuple[str, ...] = tuple(
    c.id
    for c in COMPETENCIES
    if c.framework_id is not None
    and any(f.passport_only for f in FRAMEWORKS if f.id == c.framework_id)
)

# Every competency id the catalogue has ever defined, retired ones
# included. Reads and audits use this, so nothing already stored becomes
# unreadable when a competency is retired.
COMPETENCY_IDS: tuple[str, ...] = tuple(c.id for c in COMPETENCIES)

# The ids still available for new use. Write boundaries use this, so a
# retired competency cannot be newly granted.
ACTIVE_COMPETENCY_IDS: tuple[str, ...] = tuple(
    c.id for c in COMPETENCIES if c.retired_on is None
)

RETIRED_COMPETENCY_IDS: tuple[str, ...] = tuple(
    c.id for c in COMPETENCIES if c.retired_on is not None
)

# The ids the clinician passport may record something new against:
# active, and marked assessable. A record already holding an id outside
# this set stays readable; only new writes are refused.
ASSESSABLE_COMPETENCY_IDS: tuple[str, ...] = tuple(
    c.id for c in COMPETENCIES if c.retired_on is None and c.assessable
)

# The competencies that manage people within a whitelist: every active
# entry with a ``may_grant`` or ``may_assign_professions`` list, such as
# ``manage_teaching``. A people route admits ``manage_users`` or any of
# these, then asks ``app.cbac.grant_scope`` what the caller may hand out,
# so a new scoped manager needs only its YAML entry rather than an edit
# to every route that once named ``manage_teaching``.
SCOPED_MANAGER_IDS: tuple[str, ...] = tuple(
    c.id
    for c in COMPETENCIES
    if c.retired_on is None and (c.may_grant or c.may_assign_professions)
)

# Create Literal type for type hints
CompetencyId = Literal[COMPETENCY_IDS]  # type: ignore[valid-type]

# Create Enum for runtime validation (dynamically loaded from YAML)
ClinicalCompetency = Enum(  # type: ignore[misc]
    "ClinicalCompetency",
    {c.id.upper(): c.id for c in COMPETENCIES},
)


def get_competency_details(competency_id: str) -> CompetencyEntry | None:
    """Get full details of a competency by ID."""
    for competency in COMPETENCIES:
        if competency.id == competency_id:
            return competency
    return None


def is_valid_competency(competency_id: str) -> bool:
    """Check if a competency ID is valid."""
    return competency_id in COMPETENCY_IDS


def unknown_competency_ids(ids: Iterable[str]) -> list[str]:
    """Return the ids the catalogue has never defined.

    A competency id is a bare string in three unconnected org_units - this
    catalogue, the JSON columns on ``users``, and ``practising_competency``
    - with no foreign key between them. Nothing reports a misspelt one, so
    it silently becomes a competency nobody holds.

    Retired ids count as known. They were valid when stored, and the record
    of what someone was authorised to do has to stay readable.

    Args:
        ids: Competency ids to check.

    Returns:
        The unrecognised ids, sorted and deduplicated. Empty when all are
        known.
    """
    known = set(COMPETENCY_IDS)
    return sorted({i for i in ids if i not in known})


def retired_competency_ids(ids: Iterable[str]) -> list[str]:
    """Return the ids that exist but are no longer available for new use.

    Args:
        ids: Competency ids to check.

    Returns:
        The retired ids, sorted and deduplicated.
    """
    retired = set(RETIRED_COMPETENCY_IDS)
    return sorted({i for i in ids if i in retired})


def get_framework(framework_id: str) -> Framework | None:
    """A framework by id, or None."""
    for framework in FRAMEWORKS:
        if framework.id == framework_id:
            return framework
    return None


def framework_competencies(framework_id: str) -> list[CompetencyEntry]:
    """A framework's items, in the order its file lists them.

    Its active assessable entries: what a clinician working to it may
    record. A file may hold permissions beside them, as clinical.yaml
    does, and those are not items.

    Args:
        framework_id: Which framework.

    Returns:
        Its items, or an empty list for an unknown framework.
    """
    return [
        c
        for c in COMPETENCIES
        if c.framework_id == framework_id
        and c.assessable
        and c.retired_on is None
    ]


def passport_only_competency_ids(ids: Iterable[str]) -> list[str]:
    """Return the ids that exist only to be recorded in a passport.

    Args:
        ids: Competency ids to check.

    Returns:
        The passport-only ids, sorted and deduplicated.
    """
    passport_only = set(PASSPORT_ONLY_COMPETENCY_IDS)
    return sorted({i for i in ids if i in passport_only})


def validate_competency_ids(ids: Iterable[str]) -> list[str]:
    """Validate ids at a write boundary, where retired means refused.

    Args:
        ids: Competency ids to validate.

    Returns:
        The same ids, as a list.

    Raises:
        ValueError: If any id is unrecognised, recognised but retired, or
            an item of a passport-only framework. Each is reported
            differently: one is a typo, one a competency that may no
            longer be newly granted, and one a statement on a paper form
            that was never a permission.
    """
    checked = list(ids)

    unknown = unknown_competency_ids(checked)
    if unknown:
        raise ValueError(
            "Unknown competency "
            + ("ids" if len(unknown) > 1 else "id")
            + ": "
            + ", ".join(unknown)
            + ". Competencies are defined in shared/competency-definitions/."
        )

    retired = retired_competency_ids(checked)
    if retired:
        raise ValueError(
            "Retired competency "
            + ("ids" if len(retired) > 1 else "id")
            + ": "
            + ", ".join(retired)
            + ". Retired competencies cannot be newly granted; existing "
            "records keep them."
        )

    passport_only = passport_only_competency_ids(checked)
    if passport_only:
        raise ValueError(
            "Passport-only competency "
            + ("ids" if len(passport_only) > 1 else "id")
            + ": "
            + ", ".join(passport_only)
            + ". These are items of a framework, recorded in a clinician "
            "passport, and are granted to nobody."
        )

    return checked

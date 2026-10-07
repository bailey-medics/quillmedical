"""Rebuilding ``competencies.yaml`` from the records beneath it.

The index answers the question asked ninety-nine times out of a hundred
– is this person signed off for this – while the directories beneath
hold the detail that only matters at a panel, an audit, or a concern.

**It is derived, never authored.** Nothing writes an index entry by
hand; every write regenerates the whole file by walking the sign-off
folders, the logbook and the certificates. That is what makes the
"if it disagrees with the directories, they win" rule true rather than
aspirational: there is no code path that could produce a disagreement
and leave it there. The cost is reading a few directories per write,
which at passport volumes is nothing.

**It counts and never compares.** An entry carries
``logbook_entries: 38`` and no target, no percentage, no ready-or-not.
How many is enough is a judgement belonging to the assessor, and a
system that appears to have decided first invites them to defer to it.

**Status is the latest sign-off's, not a conclusion.** The index reports
what the most recent record says, in observed-date order. It does not
decide whether an expired sign-off still counts, because what a lapsed
sign-off implies is a clinical decision that has not been made.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime

from . import paths, serialise
from .schemas import (
    SCHEMA_VERSION,
    Certificate,
    Index,
    IndexEntry,
    LogbookEntry,
    ScopeRef,
    SignOff,
)
from .store import PassportNotFoundError, PassportStore

#: What identifies one entry: the competency, and the scope its
#: sign-offs cover or ``None`` where the competency is assessed as a
#: whole.
EntryKey = tuple[str, str | None]


def _sign_offs(
    store: PassportStore, passport_id: str
) -> dict[EntryKey, list[tuple[str, SignOff]]]:
    """Every sign-off, grouped by competency and scope, oldest first.

    Grouped by scope as well as competency because a sign-off for one
    scope says nothing about another: lung at one level and breast at a
    lower one are both true at once, and neither is the other's history.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.

    Returns:
        Competency id and scope id to a list of (folder name, record),
        sorted by the date the work was observed, then by folder name so
        a same-day pair has a stable order.

    Raises:
        RecordFormatError: If a sign-off file cannot be read. Deliberately
            not swallowed: an index that quietly skipped an unreadable
            record would under-report what someone is signed off for,
            which is the one direction a passport must not fail in.
    """
    found: dict[EntryKey, list[tuple[str, SignOff]]] = defaultdict(list)

    for folder in store.list_dir(passport_id, paths.SIGN_OFFS):
        name = folder.name

        try:
            content = store.read(passport_id, paths.sign_off_file(name))
        except PassportNotFoundError:
            # A directory with no sign-off.yaml is not a sign-off. It
            # cannot arise through the application, so it means somebody
            # created a folder by hand; ignoring it is kinder than
            # refusing to rebuild the whole index.
            continue

        record = serialise.from_yaml(SignOff, content)
        scope_id = record.scope.id if record.scope is not None else None
        found[(record.competency.id, scope_id)].append((name, record))

    for records in found.values():
        records.sort(key=lambda pair: (pair[1].observed_on, pair[0]))

    return found


def _logbook_counts(
    store: PassportStore, passport_id: str
) -> tuple[dict[EntryKey, int], dict[EntryKey, ScopeRef]]:
    """How many entries each competency has, scope by scope.

    Counts entries filed under the competency *and* entries filed
    elsewhere that name it in ``also_counts_towards``, so an unusual case
    logged once is counted everywhere it belongs without being
    duplicated on disk.

    An entry is counted under the scope it names, and under no scope
    where it names none. An entry counted towards another competency
    through ``also_counts_towards`` carries no scope there: its scope is
    one of the competency it is filed under, and means nothing to the
    other.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.

    Returns:
        Competency id and scope id to a count, and the same key to the
        scope as an entry recorded it, so an index entry with no
        sign-off behind it can still name its scope in words.
    """
    counts: dict[EntryKey, int] = defaultdict(int)
    scopes: dict[EntryKey, ScopeRef] = {}

    for competency_dir in store.list_dir(passport_id, paths.LOGBOOK):
        competency = competency_dir.name

        for entry_path in store.list_dir(passport_id, competency_dir):
            entry = serialise.from_yaml(
                LogbookEntry, store.read(passport_id, entry_path)
            )

            scope_id = entry.scope.id if entry.scope is not None else None
            counts[(competency, scope_id)] += 1
            if entry.scope is not None:
                scopes[(competency, scope_id)] = entry.scope

            for also in entry.also_counts_towards:
                if also != competency:
                    counts[(also, None)] += 1

    return counts, scopes


def evidence_for(
    store: PassportStore,
    passport_id: str,
    competency_id: str,
    scope_id: str | None,
) -> tuple[int, list[str]]:
    """What is logged and certified towards one competency and scope.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        competency_id: Which competency.
        scope_id: Which of its scopes, or ``None`` for one assessed as a
            whole.

    Returns:
        The number of logbook entries naming that scope, and the
        certificate folders relating to the competency. A certificate
        names no scope, so every scope of a competency sees them all.
    """
    logbook, _ = _logbook_counts(store, passport_id)
    certificates = _certificates(store, passport_id)

    return (
        logbook.get((competency_id, scope_id), 0),
        certificates.get(competency_id, []),
    )


def _certificates(
    store: PassportStore, passport_id: str
) -> dict[str, list[str]]:
    """Which certificate folders relate to each competency.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.

    Returns:
        Competency id to certificate folder names, sorted. A certificate
        may appear under several competencies, because one course
        legitimately supports more than one.
    """
    related: dict[str, list[str]] = defaultdict(list)

    for folder in store.list_dir(passport_id, paths.CERTIFICATES):
        name = folder.name

        try:
            content = store.read(passport_id, paths.certificate_file(name))
        except PassportNotFoundError:
            continue

        certificate = serialise.from_yaml(Certificate, content)

        for competency in certificate.competencies:
            related[competency.id].append(name)

    for names in related.values():
        names.sort()

    return related


def _entry(
    competency_id: str,
    sign_offs: list[tuple[str, SignOff]],
    logbook_entries: int,
    certificates: list[str],
    *,
    name: str | None = None,
    scope: ScopeRef | None = None,
) -> IndexEntry:
    """One competency's line in the index.

    Args:
        competency_id: Which competency.
        sign_offs: Its sign-offs, oldest first.
        logbook_entries: How many procedures are logged towards it.
        certificates: Certificate folders relating to it.
        name: The competency's name, where another of its entries has
            a sign-off to read it from. Used only where this one has
            none.
        scope: Which scope the entry is for, as a logbook entry recorded
            it. Used only where there are no sign-offs to read it from.

    Returns:
        The entry. Where there are sign-offs the latest one supplies the
        status, level, dates and assessor; where there are none – a
        competency with only a logbook and certificates – the status is
        ``requested`` as the nearest honest answer to "there is evidence
        here but nobody has signed anything".
    """
    if not sign_offs:
        # A competency with evidence and no assessment. Naming it here
        # rather than omitting it is the point: an assessor should be
        # able to see that thirty procedures are logged and nothing has
        # been signed.
        return IndexEntry(
            id=competency_id,
            # The index is rebuilt with no catalogue to look a name up
            # in, so with no sign-off anywhere for this competency the
            # id stands in for it.
            name=name or competency_id.replace("_", " ").capitalize(),
            scope=scope,
            status="requested",
            logbook_entries=logbook_entries,
            certificates=certificates,
        )

    latest_name, latest = sign_offs[-1]
    earlier = [name for name, _ in reversed(sign_offs[:-1])]

    assessor = (
        latest.signed_off_by.name if latest.signed_off_by is not None else None
    )
    signed_on = latest.signed_at.date() if latest.signed_at else None

    # The holder must never find a different level from the one they
    # asked for without the assessor's reason beside it.
    changed = (
        latest.level is not None
        and latest.requested_level is not None
        and latest.level.id != latest.requested_level.id
    )

    return IndexEntry(
        id=competency_id,
        name=latest.competency.name,
        scope=latest.scope,
        status=latest.status,
        level=latest.level,
        requested_level=latest.requested_level,
        level_change_reason=latest.comments if changed else None,
        signed_on=signed_on,
        signed_off_by=assessor,
        expires_on=latest.expires_on,
        sign_off=latest_name,
        previous_sign_offs=earlier,
        logbook_entries=logbook_entries,
        certificates=certificates,
    )


def competency_names(index: Index) -> dict[str, str]:
    """Each competency in an index, once, with the name to show for it.

    A competency signed off scope by scope has several entries and one
    logbook, so anything listing a logbook wants each competency once.
    An entry with a sign-off behind it carries the competency's real
    name; one with only evidence carries a stand-in made from the id, so
    the real name is preferred where an index holds both.

    Args:
        index: The index.

    Returns:
        Competency id to name, in name order.
    """
    names: dict[str, str] = {}

    for entry in index.competencies:
        if entry.id not in names or entry.sign_off is not None:
            names[entry.id] = entry.name

    return dict(sorted(names.items(), key=lambda item: item[1]))


def build(
    store: PassportStore,
    passport_id: str,
    *,
    now: datetime | None = None,
) -> Index:
    """Rebuild the whole index from what is on disk.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        now: When the rebuild happened, for tests.

    Returns:
        The index, with competencies in id order so two rebuilds of an
        unchanged passport produce byte-identical files – otherwise
        every write would show a spurious diff.

    Raises:
        ValueError: If *now* is naive.
    """
    moment = now if now is not None else datetime.now(UTC)

    if moment.tzinfo is None:
        raise ValueError("Refusing a naive datetime: pass an aware one.")

    sign_offs = _sign_offs(store, passport_id)
    logbook, logbook_scopes = _logbook_counts(store, passport_id)
    certificates = _certificates(store, passport_id)

    # A competency's name as its latest sign-off recorded it, for any of
    # its entries that have only evidence behind them.
    names = {
        competency_id: records[-1][1].competency.name
        for (competency_id, _), records in sign_offs.items()
    }

    # Every competency with any evidence at all, not just signed ones.
    # Logbook entries get an entry for the scope they name even where
    # nothing is signed for it: the evidence is there. A competency with
    # only certificates gets one with no scope.
    keys: set[EntryKey] = set(sign_offs) | set(logbook)
    with_an_entry = {competency_id for competency_id, _ in keys}
    keys |= {
        (competency_id, None)
        for competency_id in set(certificates) - with_an_entry
    }

    return Index(
        schema_version=SCHEMA_VERSION,
        generated_at=moment,
        competencies=[
            _entry(
                competency_id,
                sign_offs.get((competency_id, scope_id), []),
                logbook.get((competency_id, scope_id), 0),
                # A certificate names no scope, so each of a competency's
                # entries reports them all.
                certificates.get(competency_id, []),
                name=names.get(competency_id),
                scope=logbook_scopes.get((competency_id, scope_id)),
            )
            # An entry with no scope sorts before its competency's
            # scoped ones.
            for competency_id, scope_id in sorted(
                keys, key=lambda key: (key[0], key[1] or "")
            )
        ],
    )


def render(index: Index) -> str:
    """The index as the file that gets committed.

    Args:
        index: The rebuilt index.

    Returns:
        YAML, with a comment saying not to edit it – the one file in a
        passport where a hand edit would be silently discarded on the
        next write, so it says so.
    """
    return serialise.to_yaml(
        index,
        comment=(
            "Derived index, rebuilt on every write. Do not edit: the "
            "directories beneath are authoritative and any change here "
            "is overwritten."
        ),
    )

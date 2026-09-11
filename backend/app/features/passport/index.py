"""Rebuilding ``competencies.yaml`` from the records beneath it.

The index answers the question asked ninety-nine times out of a hundred
— is this person signed off for this — while the directories beneath
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
    SignOff,
)
from .store import PassportNotFoundError, PassportStore


def _sign_offs(
    store: PassportStore, passport_id: str
) -> dict[str, list[tuple[str, SignOff]]]:
    """Every sign-off, grouped by competency and ordered oldest first.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.

    Returns:
        Competency id to a list of (folder name, record), sorted by the
        date the work was observed, then by folder name so a same-day
        pair has a stable order.

    Raises:
        RecordFormatError: If a sign-off file cannot be read. Deliberately
            not swallowed: an index that quietly skipped an unreadable
            record would under-report what someone is signed off for,
            which is the one direction a passport must not fail in.
    """
    found: dict[str, list[tuple[str, SignOff]]] = defaultdict(list)

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
        found[record.competency.id].append((name, record))

    for records in found.values():
        records.sort(key=lambda pair: (pair[1].observed_on, pair[0]))

    return found


def _logbook_counts(store: PassportStore, passport_id: str) -> dict[str, int]:
    """How many entries each competency has.

    Counts entries filed under the competency *and* entries filed
    elsewhere that name it in ``also_counts_towards``, so an unusual case
    logged once is counted everywhere it belongs without being
    duplicated on disk.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.

    Returns:
        Competency id to a count.
    """
    counts: dict[str, int] = defaultdict(int)

    for competency_dir in store.list_dir(passport_id, paths.LOGBOOK):
        competency = competency_dir.name

        for entry_path in store.list_dir(passport_id, competency_dir):
            counts[competency] += 1

            entry = serialise.from_yaml(
                LogbookEntry, store.read(passport_id, entry_path)
            )

            for also in entry.also_counts_towards:
                if also != competency:
                    counts[also] += 1

    return counts


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
) -> IndexEntry:
    """One competency's line in the index.

    Args:
        competency_id: Which competency.
        sign_offs: Its sign-offs, oldest first.
        logbook_entries: How many procedures are logged towards it.
        certificates: Certificate folders relating to it.

    Returns:
        The entry. Where there are sign-offs the latest one supplies the
        status, level, dates and assessor; where there are none — a
        competency with only a logbook and certificates — the status is
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
            name=competency_id.replace("_", " ").capitalize(),
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

    return IndexEntry(
        id=competency_id,
        name=latest.competency.name,
        status=latest.status,
        level=latest.level,
        signed_on=signed_on,
        signed_off_by=assessor,
        expires_on=latest.expires_on,
        sign_off=latest_name,
        previous_sign_offs=earlier,
        logbook_entries=logbook_entries,
        certificates=certificates,
    )


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
        unchanged passport produce byte-identical files — otherwise
        every write would show a spurious diff.

    Raises:
        ValueError: If *now* is naive.
    """
    moment = now if now is not None else datetime.now(UTC)

    if moment.tzinfo is None:
        raise ValueError("Refusing a naive datetime: pass an aware one.")

    sign_offs = _sign_offs(store, passport_id)
    logbook = _logbook_counts(store, passport_id)
    certificates = _certificates(store, passport_id)

    # Every competency with any evidence at all, not just signed ones.
    competencies = set(sign_offs) | set(logbook) | set(certificates)

    return Index(
        schema_version=SCHEMA_VERSION,
        generated_at=moment,
        competencies=[
            _entry(
                competency_id,
                sign_offs.get(competency_id, []),
                logbook.get(competency_id, 0),
                certificates.get(competency_id, []),
            )
            for competency_id in sorted(competencies)
        ],
    )


def render(index: Index) -> str:
    """The index as the file that gets committed.

    Args:
        index: The rebuilt index.

    Returns:
        YAML, with a comment saying not to edit it — the one file in a
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

"""Creating, amending and removing self-declared evidence.

Certificates, logbook entries, reflections and CPD activities: the four
kinds of record a holder enters about themselves. Each is one validated
write and one commit, and each rebuilds the index in the same commit, so
the summary never lags the records it describes.

**These are editable, and a sign-off is not.** That difference is the
whole reason they live in a separate module. A mistyped logbook date
should be fixable in seconds, because nobody else has vouched for it; a
sign-off is a named person's attestation and is corrected only by
superseding it. Conflating the two would either make evidence
needlessly rigid or make an attestation quietly mutable.

**Nobody countersigns any of this.** A logbook of two hundred
bronchoscopies proves activity, not competence. The interface should
make that obvious, and the storage layer keeps them apart so it can.

**Reflections are holder-only.** Not readable by an assessor, an
organisation admin, or anyone else. Written reflection can be disclosed
in legal proceedings and UK doctors are wary of it for good reason, so
the narrower default is the safer one. This module does not enforce
that — authorisation is the router's job — but the separation exists so
the router has something to gate.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, date, datetime, timedelta
from pathlib import PurePosixPath

from . import ids, index, paths, serialise
from .commits import Actor, CommitAction
from .commits import build as build_message
from .schemas import Certificate, CpdEntry, LogbookEntry, Reflection
from .store import PassportHead, PassportNotFoundError, PassportStore


class RecordNotFoundError(Exception):
    """No record of that kind exists under that name."""


class _PendingView(PassportStore):
    """The passport as it will be once a write lands.

    A read-only overlay over the real store: files being written read
    back as their new contents, files being deleted read as absent, and
    everything else falls through. It exists so the index can be built
    from the state a commit is *about* to create, which is what lets the
    records and their summary land in one commit rather than two.

    Deliberately not a general-purpose transaction. It answers the two
    questions the index asks — read this file, list this directory — and
    refuses everything else, so it cannot quietly become a second write
    path with different rules.
    """

    def __init__(
        self,
        store: PassportStore,
        passport_id: str,
        files: Mapping[PurePosixPath, str | bytes],
        delete: tuple[PurePosixPath, ...],
    ) -> None:
        self._store = store
        self._passport_id = passport_id
        self._files = dict(files)
        self._deleted = set(delete)

    def read(self, passport_id: str, path: PurePosixPath) -> bytes:
        """Read a file as it will be after the write."""
        if path in self._deleted:
            raise PassportNotFoundError(f"{path} is being removed.")

        if path in self._files:
            content = self._files[path]
            return content.encode() if isinstance(content, str) else content

        return self._store.read(passport_id, path)

    def list_dir(
        self, passport_id: str, path: PurePosixPath
    ) -> list[PurePosixPath]:
        """List a directory as it will be after the write.

        Entries deep under *path* contribute only their next segment, so
        listing ``sign-offs`` yields folder names rather than the files
        inside them — matching what the real store returns.
        """
        existing = {
            entry
            for entry in self._store.list_dir(passport_id, path)
            if entry not in self._deleted
        }

        depth = len(path.parts)
        for pending in self._files:
            if pending.is_relative_to(path) and len(pending.parts) > depth:
                existing.add(PurePosixPath(*pending.parts[: depth + 1]))

        # A directory whose only file is being deleted disappears, since
        # git cannot represent an empty directory anyway.
        surviving = {
            entry
            for entry in existing
            if not (
                entry.parts[-1].endswith((".yaml", ".md"))
                and entry in self._deleted
            )
        }

        return sorted(surviving)

    def exists(self, passport_id: str) -> bool:
        """Whether the passport exists. Unchanged by a pending write."""
        return self._store.exists(passport_id)

    def head(self, passport_id: str) -> PassportHead:
        """Where the repository is now, before the pending write."""
        return self._store.head(passport_id)

    def create(self, *args: object, **kwargs: object) -> str:
        """Not available: this view never writes."""
        raise NotImplementedError(
            "A pending view is read-only; write through the real store."
        )

    def write(self, *args: object, **kwargs: object) -> str:
        """Not available: this view never writes."""
        raise NotImplementedError(
            "A pending view is read-only; write through the real store."
        )


def _write(
    store: PassportStore,
    passport_id: str,
    actor: Actor,
    action: CommitAction,
    summary: str,
    files: Mapping[PurePosixPath, str | bytes],
    *,
    competency: str | None = None,
    delete: tuple[PurePosixPath, ...] = (),
    now: datetime | None = None,
) -> str:
    """Write records and rebuild the index, in one commit.

    The single write path for every self-declared record, so the index
    cannot be rebuilt by one caller and forgotten by another.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        actor: Who is making the change — always the holder here, since
            nobody else may write self-declared evidence.
        action: What kind of change, for the commit message.
        summary: A short description, built from structured values.
        files: The record files to write.
        competency: The competency the change concerns, where it
            concerns one.
        delete: Paths to remove in the same commit.
        now: For tests.

    Returns:
        The new commit id.
    """
    head = store.head(passport_id)

    # The index summarises the records, so it must be rebuilt from what
    # this write is about to leave on disk — not from what is there now.
    # Committing the records first and the index second would leave a
    # commit in history whose summary disagrees with its own records,
    # which is the state the "directories win" rule exists to prevent.
    #
    # So the change is applied to a view of the passport, the index is
    # built from that view, and records and index go in one commit.
    view = _PendingView(store, passport_id, files, delete)
    rebuilt = index.build(view, passport_id, now=now)

    staged = dict(files)
    staged[paths.INDEX] = index.render(rebuilt)

    return store.write(
        passport_id,
        staged,
        build_message(action, summary, actor, competency=competency),
        actor,
        head,
        delete=delete,
    )


def _unique_dir_name(
    store: PassportStore,
    passport_id: str,
    parent: PurePosixPath,
    on: date,
    label: str,
) -> str:
    """A record directory name not already taken.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        parent: The directory the record goes in.
        on: The date the record is about.
        label: Free text to slugify.

    Returns:
        ``<date>-<slug>``, with ``-2`` or higher where that is taken.
        Names are fixed at creation and never reused, because the name
        is the handle the index refers to.
    """
    taken = {entry.name for entry in store.list_dir(passport_id, parent)}

    suffix = 1
    while True:
        name = ids.record_dir_name(on, label, suffix=suffix)
        if name not in taken:
            return name
        suffix += 1


def _next_entry_filename(
    store: PassportStore,
    passport_id: str,
    directory: PurePosixPath,
    moment: datetime,
) -> str:
    """A write-time filename not already taken.

    Two entries logged in the same second would otherwise collide. The
    server bumps to the next second rather than adding a hash suffix,
    which reads as noise to anyone who is not a developer.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        directory: Where the entry goes.
        moment: When it is being written.

    Returns:
        The filename stem, without a suffix.
    """
    taken = {entry.stem for entry in store.list_dir(passport_id, directory)}

    candidate = moment
    while ids.entry_filename(candidate) in taken:
        candidate += timedelta(seconds=1)

    return ids.entry_filename(candidate)


# --- Certificates ---------------------------------------------------------


def add_certificate(
    store: PassportStore,
    passport_id: str,
    actor: Actor,
    certificate: Certificate,
    *,
    now: datetime | None = None,
) -> tuple[str, str]:
    """File a certificate the holder is claiming.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        actor: The holder.
        certificate: What they are claiming.
        now: For tests.

    Returns:
        The folder name and the commit id.
    """
    name = _unique_dir_name(
        store,
        passport_id,
        paths.CERTIFICATES,
        certificate.awarded_on,
        certificate.title,
    )

    commit = _write(
        store,
        passport_id,
        actor,
        "create",
        f"add certificate {name}",
        {
            paths.certificate_file(name): serialise.to_yaml(
                certificate,
                comment=(
                    "A certificate the holder recorded. Self-declared: "
                    "nobody countersigns it."
                ),
            )
        },
        now=now,
    )

    return name, commit


def amend_certificate(
    store: PassportStore,
    passport_id: str,
    actor: Actor,
    name: str,
    certificate: Certificate,
    *,
    now: datetime | None = None,
) -> str:
    """Correct a certificate.

    The folder name does not change even if the title or date does: it
    is the handle the index refers to, and renaming would orphan every
    reference for the sake of cosmetics.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        actor: The holder.
        name: Which certificate folder.
        certificate: The corrected record.
        now: For tests.

    Returns:
        The commit id.

    Raises:
        RecordNotFoundError: If there is no such certificate.
    """
    _require(store, passport_id, paths.certificate_file(name), "certificate")

    return _write(
        store,
        passport_id,
        actor,
        "amend",
        f"amend certificate {name}",
        {
            paths.certificate_file(name): serialise.to_yaml(
                certificate,
                comment=(
                    "A certificate the holder recorded. Self-declared: "
                    "nobody countersigns it."
                ),
            )
        },
        now=now,
    )


def remove_certificate(
    store: PassportStore,
    passport_id: str,
    actor: Actor,
    name: str,
    *,
    now: datetime | None = None,
) -> str:
    """Remove a certificate recorded in error.

    The file goes; the history keeps it, as it keeps everything.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        actor: The holder.
        name: Which certificate folder.
        now: For tests.

    Returns:
        The commit id.

    Raises:
        RecordNotFoundError: If there is no such certificate.
    """
    path = paths.certificate_file(name)
    _require(store, passport_id, path, "certificate")

    return _write(
        store,
        passport_id,
        actor,
        "remove",
        f"remove certificate {name}",
        {},
        delete=(path,),
        now=now,
    )


# --- Logbook --------------------------------------------------------------


def add_logbook_entry(
    store: PassportStore,
    passport_id: str,
    actor: Actor,
    competency: str,
    entry: LogbookEntry,
    *,
    now: datetime | None = None,
) -> tuple[str, str]:
    """Log one procedure.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        actor: The holder.
        competency: Which competency it counts towards.
        entry: What happened.
        now: For tests.

    Returns:
        The filename stem and the commit id.
    """
    moment = now if now is not None else datetime.now(UTC)
    directory = paths.logbook_dir(competency)
    stem = _next_entry_filename(store, passport_id, directory, moment)

    commit = _write(
        store,
        passport_id,
        actor,
        "create",
        f"log a {competency} procedure",
        {
            paths.logbook_entry(competency, stem): serialise.to_yaml(
                entry,
                comment=(
                    "One logged procedure. Self-declared: nobody "
                    "countersigns a logbook."
                ),
            )
        },
        competency=competency,
        now=now,
    )

    return stem, commit


def amend_logbook_entry(
    store: PassportStore,
    passport_id: str,
    actor: Actor,
    competency: str,
    stem: str,
    entry: LogbookEntry,
    *,
    now: datetime | None = None,
) -> str:
    """Correct a logged procedure.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        actor: The holder.
        competency: Which competency it is filed under.
        stem: Which entry.
        entry: The corrected record.
        now: For tests.

    Returns:
        The commit id.

    Raises:
        RecordNotFoundError: If there is no such entry.
    """
    path = paths.logbook_entry(competency, stem)
    _require(store, passport_id, path, "logbook entry")

    return _write(
        store,
        passport_id,
        actor,
        "amend",
        f"amend a {competency} entry",
        {
            path: serialise.to_yaml(
                entry,
                comment=(
                    "One logged procedure. Self-declared: nobody "
                    "countersigns a logbook."
                ),
            )
        },
        competency=competency,
        now=now,
    )


def remove_logbook_entry(
    store: PassportStore,
    passport_id: str,
    actor: Actor,
    competency: str,
    stem: str,
    *,
    now: datetime | None = None,
) -> str:
    """Remove a logged procedure recorded in error.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        actor: The holder.
        competency: Which competency it is filed under.
        stem: Which entry.
        now: For tests.

    Returns:
        The commit id.

    Raises:
        RecordNotFoundError: If there is no such entry.
    """
    path = paths.logbook_entry(competency, stem)
    _require(store, passport_id, path, "logbook entry")

    return _write(
        store,
        passport_id,
        actor,
        "remove",
        f"remove a {competency} entry",
        {},
        competency=competency,
        delete=(path,),
        now=now,
    )


# --- Reflections ----------------------------------------------------------


def add_reflection(
    store: PassportStore,
    passport_id: str,
    actor: Actor,
    reflection: Reflection,
    body: str,
    *,
    now: datetime | None = None,
) -> tuple[str, str]:
    """Write a reflection.

    Holder-only. Nothing else in a passport is as sensitive, and the
    router is expected to refuse every other reader.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        actor: The holder.
        reflection: Its structured fields.
        body: The writing, which is the substance.
        now: For tests.

    Returns:
        The folder name and the commit id.
    """
    name = _unique_dir_name(
        store,
        passport_id,
        paths.REFLECTIONS,
        reflection.written_on,
        reflection.title,
    )

    commit = _write(
        store,
        passport_id,
        actor,
        "create",
        f"add reflection {name}",
        {
            paths.reflection_file(name): serialise.reflection_to_markdown(
                reflection, body
            )
        },
        now=now,
    )

    return name, commit


def amend_reflection(
    store: PassportStore,
    passport_id: str,
    actor: Actor,
    name: str,
    reflection: Reflection,
    body: str,
    *,
    now: datetime | None = None,
) -> str:
    """Rewrite a reflection.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        actor: The holder.
        name: Which reflection folder.
        reflection: Its corrected fields.
        body: The corrected writing.
        now: For tests.

    Returns:
        The commit id.

    Raises:
        RecordNotFoundError: If there is no such reflection.
    """
    path = paths.reflection_file(name)
    _require(store, passport_id, path, "reflection")

    return _write(
        store,
        passport_id,
        actor,
        "amend",
        f"amend reflection {name}",
        {path: serialise.reflection_to_markdown(reflection, body)},
        now=now,
    )


def remove_reflection(
    store: PassportStore,
    passport_id: str,
    actor: Actor,
    name: str,
    *,
    now: datetime | None = None,
) -> str:
    """Remove a reflection.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        actor: The holder.
        name: Which reflection folder.
        now: For tests.

    Returns:
        The commit id.

    Raises:
        RecordNotFoundError: If there is no such reflection.
    """
    path = paths.reflection_file(name)
    _require(store, passport_id, path, "reflection")

    return _write(
        store,
        passport_id,
        actor,
        "remove",
        f"remove reflection {name}",
        {},
        delete=(path,),
        now=now,
    )


# --- CPD ------------------------------------------------------------------


def add_cpd_entry(
    store: PassportStore,
    passport_id: str,
    actor: Actor,
    entry: CpdEntry,
    *,
    now: datetime | None = None,
) -> tuple[str, str]:
    """Record a CPD activity.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        actor: The holder.
        entry: What they did.
        now: For tests.

    Returns:
        The filename stem and the commit id.
    """
    moment = now if now is not None else datetime.now(UTC)
    year = entry.activity_on.year
    directory = paths.cpd_dir(year)
    stem = _next_entry_filename(store, passport_id, directory, moment)

    commit = _write(
        store,
        passport_id,
        actor,
        "create",
        f"add CPD for {year}",
        {
            paths.cpd_entry(year, stem): serialise.to_yaml(
                entry,
                comment=(
                    "One CPD activity. Grouped by year, because "
                    "appraisal asks what you did this year."
                ),
            )
        },
        now=now,
    )

    return stem, commit


def amend_cpd_entry(
    store: PassportStore,
    passport_id: str,
    actor: Actor,
    year: int,
    stem: str,
    entry: CpdEntry,
    *,
    now: datetime | None = None,
) -> str:
    """Correct a CPD activity.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        actor: The holder.
        year: Which year it is filed under.
        stem: Which entry.
        entry: The corrected record.
        now: For tests.

    Returns:
        The commit id.

    Raises:
        RecordNotFoundError: If there is no such entry.
    """
    path = paths.cpd_entry(year, stem)
    _require(store, passport_id, path, "CPD entry")

    return _write(
        store,
        passport_id,
        actor,
        "amend",
        f"amend CPD for {year}",
        {
            path: serialise.to_yaml(
                entry,
                comment=(
                    "One CPD activity. Grouped by year, because "
                    "appraisal asks what you did this year."
                ),
            )
        },
        now=now,
    )


def remove_cpd_entry(
    store: PassportStore,
    passport_id: str,
    actor: Actor,
    year: int,
    stem: str,
    *,
    now: datetime | None = None,
) -> str:
    """Remove a CPD activity recorded in error.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        actor: The holder.
        year: Which year it is filed under.
        stem: Which entry.
        now: For tests.

    Returns:
        The commit id.

    Raises:
        RecordNotFoundError: If there is no such entry.
    """
    path = paths.cpd_entry(year, stem)
    _require(store, passport_id, path, "CPD entry")

    return _write(
        store,
        passport_id,
        actor,
        "remove",
        f"remove CPD for {year}",
        {},
        delete=(path,),
        now=now,
    )


def _require(
    store: PassportStore,
    passport_id: str,
    path: PurePosixPath,
    what: str,
) -> None:
    """Refuse unless the record exists.

    A guard clause at the top of every amend and remove, so nothing
    writes a commit that changes nothing — an amend to a record that was
    never there would otherwise land as an empty commit claiming to have
    corrected something.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        path: The record file.
        what: What to call it in the error.

    Raises:
        RecordNotFoundError: If it is not there.
    """
    try:
        store.read(passport_id, path)
    except PassportNotFoundError as error:
        raise RecordNotFoundError(f"No {what} at {path}.") from error

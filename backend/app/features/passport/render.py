"""Rendering a passport as one readable Markdown document.

A view, never a record. The files in the repository are canonical and
this output is assembled from them on demand — it is deliberately not
written back, because a stored rendering is a second version of the
truth waiting to disagree with the first.

What the shape is for: somebody at an ARCP panel, an appraisal, or a job
interview needs one document they can read top to bottom. The repository
answers "what happened" precisely; this answers "where does this person
stand" at a glance, then carries the detail underneath for anyone who
wants it.

Three rules run through it.

**Counts, never comparisons.** The logbook reports thirty-eight
procedures and stops. No target, no percentage, no ready-or-not. How
many is enough belongs to the assessor, and a document that appeared to
have decided first would invite a reader to defer to it.

**Superseded records stay visible.** A corrected sign-off is shown, with
what replaced it. Hiding it would make the document a summary of
conclusions rather than a record of what was decided and when.

**Clinical dates order clinical things.** Logbook and CPD entries sort by
the date inside the entry, not by the filename — a filename records when
Quill wrote the file, which for five procedures logged on a Friday
evening is the order somebody typed them up rather than the order they
happened.
"""

from __future__ import annotations

from datetime import date
from pathlib import PurePosixPath

from . import paths
from .schemas import (
    Certificate,
    CpdEntry,
    Index,
    IndexEntry,
    LogbookEntry,
    Profile,
    Reflection,
    SignOff,
)
from .serialise import from_yaml, reflection_from_markdown
from .store import PassportNotFoundError, PassportStore

#: What a reader sees where a passport records nothing. An empty section
#: is stated rather than omitted: a missing heading reads as an oversight,
#: while "No certificates recorded." is an answer.
_NOTHING = "_Nothing recorded._"


def render(
    store: PassportStore,
    passport_id: str,
    *,
    include_reflections: bool = False,
) -> str:
    """Render a whole passport as Markdown.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        include_reflections: Whether to include the holder's
            reflections. Off by default, and the caller must ask: a
            reflection is holder-only, and a rendering handed to a panel
            or an employer must not carry one by accident. Written
            reflection can be disclosed in legal proceedings, so the
            default has to be the narrow one.

    Returns:
        The document.

    Raises:
        PassportNotFoundError: If there is no such passport.
    """
    profile = from_yaml(Profile, store.read(passport_id, paths.PROFILE))
    index = from_yaml(Index, store.read(passport_id, paths.INDEX))

    parts = [
        _front_page(profile, index),
        _competency_table(index),
        _logbook_section(store, passport_id, index),
        _certificates_section(store, passport_id),
        _cpd_section(store, passport_id),
    ]

    if include_reflections:
        parts.append(_reflections_section(store, passport_id))

    parts.append(_sign_off_appendix(store, passport_id, index))

    return "\n\n".join(part.rstrip() for part in parts if part) + "\n"


def _front_page(profile: Profile, index: Index) -> str:
    """Who this is, and what they are registered as."""
    lines = [
        "# Clinician passport",
        "",
        f"**{profile.name}**",
        "",
    ]

    if profile.registrations:
        for registration in profile.registrations:
            state = (
                "verified"
                if registration.verified
                else "declared, not verified"
            )
            lines.append(
                f"- {registration.body} {registration.number} " f"— _{state}_"
            )
        lines.append("")

    lines.extend(
        [
            f"Generated {index.generated_at.date().isoformat()}.",
            "",
            "This is a record of assessed clinical competence: what this "
            "person has been signed off to do, by whom, and on what "
            "evidence. Registrations are recorded as declared; a "
            "registration is marked verified only where somebody has "
            "checked a register by hand.",
        ]
    )

    return "\n".join(lines)


def _competency_table(index: Index) -> str:
    """One row per competency, with where it stands.

    A table rather than bullets: this is the page people actually read,
    and a reader scanning for one competency wants a column to run their
    eye down.
    """
    lines = ["## Competencies", ""]

    if not index.competencies:
        lines.append(_NOTHING)
        return "\n".join(lines)

    lines.extend(
        [
            "| Competency | Level | Status | Signed off by | Date | Expires |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
    )

    for entry in sorted(index.competencies, key=lambda e: e.name):
        lines.append(
            "| {name} | {level} | {status} | {by} | {on} | {expires} |".format(
                name=entry.name,
                level=entry.level.name if entry.level else "—",
                status=_status_word(entry),
                by=entry.signed_off_by or "—",
                on=entry.signed_on.isoformat() if entry.signed_on else "—",
                expires=(
                    entry.expires_on.isoformat() if entry.expires_on else "—"
                ),
            )
        )

    return "\n".join(lines)


def _status_word(entry: IndexEntry) -> str:
    """How a competency's state reads to a person.

    An expired sign-off still reads ``signed off``, with the expiry date
    in its own column for a reader to weigh. What a lapsed sign-off
    implies is a clinical decision nobody has made, so the document
    reports the date and draws no conclusion from it.
    """
    return {
        "requested": "awaiting assessor",
        "signed_off": "signed off",
        "declined": "declined",
        "superseded": "superseded",
    }.get(entry.status, entry.status)


def _logbook_section(
    store: PassportStore, passport_id: str, index: Index
) -> str:
    """Logged procedures, grouped by competency and counted."""
    lines = ["## Logbook", ""]
    any_entries = False

    for entry in sorted(index.competencies, key=lambda e: e.name):
        rows = _logbook_entries(store, passport_id, entry.id)

        if not rows:
            continue

        any_entries = True
        lines.extend([f"### {entry.name}", ""])
        lines.append(f"{len(rows)} recorded.")
        lines.append("")

        for performed_on, record in rows:
            detail = ", ".join(
                part
                for part in (
                    record.setting,
                    record.supervision,
                    record.indication,
                    record.outcome,
                )
                if part
            )
            lines.append(
                f"- **{performed_on.isoformat()}** — {detail or 'recorded'}"
            )

        lines.append("")

    if not any_entries:
        lines.append(_NOTHING)

    return "\n".join(lines)


def _logbook_entries(
    store: PassportStore, passport_id: str, competency_id: str
) -> list[tuple[date, LogbookEntry]]:
    """One competency's entries, oldest clinical date first."""
    found: list[tuple[date, LogbookEntry]] = []

    try:
        listing = store.list_dir(passport_id, paths.logbook_dir(competency_id))
    except (PassportNotFoundError, paths.PassportPathError):
        return found

    for path in listing:
        record = from_yaml(LogbookEntry, store.read(passport_id, path))
        found.append((record.performed_on, record))

    found.sort(key=lambda item: item[0])
    return found


def _certificates_section(store: PassportStore, passport_id: str) -> str:
    """Courses, qualifications and awards the holder is claiming."""
    lines = ["## Certificates", ""]
    found: list[Certificate] = []

    for entry in _list(store, passport_id, paths.CERTIFICATES):
        raw = store.read(passport_id, paths.certificate_file(entry))
        found.append(from_yaml(Certificate, raw))

    if not found:
        lines.append(_NOTHING)
        return "\n".join(lines)

    lines.append(
        "Self-declared: recorded by the holder, with nobody " "countersigning."
    )
    lines.append("")

    for certificate in sorted(found, key=lambda c: c.awarded_on):
        lines.append(
            f"- **{certificate.title}** — {certificate.issuer}, "
            f"{certificate.awarded_on.isoformat()}"
        )

        if certificate.competencies:
            names = ", ".join(c.name for c in certificate.competencies)
            lines.append(f"  - Relates to: {names}")

        if certificate.expires_on:
            lines.append(f"  - Expires: {certificate.expires_on.isoformat()}")

    return "\n".join(lines)


def _cpd_section(store: PassportStore, passport_id: str) -> str:
    """Continuing professional development, newest year first.

    Years descend because appraisal asks what you did *this* year, and
    the current one should not be at the bottom of a long list.
    """
    lines = ["## Continuing professional development", ""]
    years = _list(store, passport_id, paths.CPD)

    if not years:
        lines.append(_NOTHING)
        return "\n".join(lines)

    any_entries = False

    for year in sorted(years, reverse=True):
        entries = _cpd_entries(store, passport_id, year)

        if not entries:
            continue

        any_entries = True
        hours = sum(e.hours or 0 for e in entries)
        lines.extend([f"### {year}", ""])

        # "1 activities" reads as a bug to anyone looking at their own
        # record, and this document is read by the person it describes.
        activities = "activity" if len(entries) == 1 else "activities"

        if hours:
            lines.append(f"{len(entries)} {activities}, {hours:g} hours.")
        else:
            lines.append(f"{len(entries)} {activities}.")

        lines.append("")

        for entry in entries:
            suffix = f" ({entry.hours:g} hours)" if entry.hours else ""
            lines.append(
                f"- **{entry.activity_on.isoformat()}** — {entry.title}"
                f" [{entry.activity_type}]{suffix}"
            )

        lines.append("")

    if not any_entries:
        lines.append(_NOTHING)

    return "\n".join(lines)


def _cpd_entries(
    store: PassportStore, passport_id: str, year: str
) -> list[CpdEntry]:
    """One year's activities, oldest first by the date they happened."""
    found: list[CpdEntry] = []

    try:
        listing = store.list_dir(passport_id, paths.CPD / year)
    except (PassportNotFoundError, paths.PassportPathError):
        return found

    for path in listing:
        found.append(from_yaml(CpdEntry, store.read(passport_id, path)))

    found.sort(key=lambda entry: entry.activity_on)
    return found


def _reflections_section(store: PassportStore, passport_id: str) -> str:
    """The holder's own writing, included only when explicitly asked for."""
    lines = ["## Reflections", ""]
    found: list[tuple[Reflection, str]] = []

    for name in _list(store, passport_id, paths.REFLECTIONS):
        raw = store.read(passport_id, paths.reflection_file(name))
        found.append(reflection_from_markdown(raw))

    if not found:
        lines.append(_NOTHING)
        return "\n".join(lines)

    for reflection, body in sorted(found, key=lambda item: item[0].written_on):
        lines.extend(
            [
                f"### {reflection.title}",
                "",
                f"_{reflection.written_on.isoformat()}_",
                "",
                body.strip(),
                "",
            ]
        )

    return "\n".join(lines)


def _sign_off_appendix(
    store: PassportStore, passport_id: str, index: Index
) -> str:
    """Every sign-off in full, superseded ones included.

    The part an auditor or a panel reads. Each record carries its own
    fingerprint so a printed page can be checked against the repository,
    and superseded records stay visible because a document that showed
    only current conclusions would hide what was decided and when.
    """
    lines = ["## Sign-offs in full", ""]
    names = _list(store, passport_id, paths.SIGN_OFFS)

    if not names:
        lines.append(_NOTHING)
        return "\n".join(lines)

    records: list[tuple[str, SignOff]] = []

    for name in names:
        raw = store.read(passport_id, paths.sign_off_file(name))
        records.append((name, from_yaml(SignOff, raw)))

    records.sort(key=lambda item: item[1].observed_on)

    for name, record in records:
        lines.extend(_one_sign_off(name, record))

    return "\n".join(lines)


def _one_sign_off(name: str, record: SignOff) -> list[str]:
    """One sign-off, rendered in full."""
    lines = [f"### {record.competency.name}", ""]

    if record.level:
        lines.append(f"**Level:** {record.level.name}")
        lines.append("")

    lines.append(f"- Status: {record.status}")
    lines.append(f"- Kind: {record.kind}")
    lines.append(f"- Observed: {record.observed_on.isoformat()}")

    if record.signed_at:
        lines.append(f"- Signed: {record.signed_at.date().isoformat()}")

    if record.meaning:
        lines.append(f"- The assessor {record.meaning}")

    if record.signed_off_by:
        assessor = record.signed_off_by
        registrations = ", ".join(
            f"{r.body} {r.number}" for r in assessor.registrations
        )
        standing = (
            "registration verified"
            if assessor.registration_verified
            else "registration declared, not verified"
        )
        lines.append(
            f"- Signed off by: {assessor.name}, {assessor.role}"
            + (f" ({registrations})" if registrations else "")
            + f" — _{standing}_"
        )

    if record.expires_on:
        lines.append(f"- Expires: {record.expires_on.isoformat()}")

    if record.corrects:
        lines.append(f"- Corrects an earlier record: `{record.corrects}`")

    if record.evidence:
        lines.append(
            f"- Evidence in view when signed: "
            f"{record.evidence.logbook_entries} logbook entries, "
            f"{len(record.evidence.certificates)} certificates"
        )

    if record.comments:
        lines.extend(["", f"> {record.comments}"])

    if record.content_hash:
        lines.extend(
            ["", f"Fingerprint: `{record.content_hash}`", f"Record: `{name}`"]
        )

    lines.append("")
    return lines


def _list(
    store: PassportStore, passport_id: str, path: PurePosixPath
) -> list[str]:
    """Directory entry names under *path*, or nothing if it is absent.

    An absent directory and an empty one mean the same to a reader, and
    git cannot represent an empty directory anyway.
    """
    try:
        return [entry.name for entry in store.list_dir(passport_id, path)]
    except (PassportNotFoundError, paths.PassportPathError):
        return []

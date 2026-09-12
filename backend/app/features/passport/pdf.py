"""Rendering a passport as a printable PDF.

The artefact somebody carries into an ARCP panel or an interview. It
holds the same facts as the Markdown rendering and answers a different
need: paper, in a room, with no laptop.

``platypus`` rather than the ``pdfgen`` canvas the teaching certificate
uses. A certificate is one page of fixed layout, so drawing at absolute
coordinates is right for it. A passport flows — a registrar with fifty
sign-offs and three hundred logbook entries produces a document of
unknown length — and platypus does the pagination, table splitting and
text wrapping that would otherwise have to be written by hand.

**Nothing here may fail a download.** That policy comes from
``features/teaching/certificate.py``, where a malformed style block in
somebody else's content repository must degrade to a default rather than
raise. The passport has no style config, so the same discipline is
applied where it does apply: to the record data. A sign-off missing an
optional field, a competency whose name is empty, a date that will not
format — each degrades to a readable placeholder rather than denying
somebody their own record on the morning of a panel.

**Reflections are counted, never printed.** There is deliberately no
option to include them: the count is evidence of a habit an appraiser
looks for, and the writing is about real patients. A PDF is the form
most likely to be handed onward and hardest to redact once printed, so
a parameter that could switch the text on would be a mistake waiting to
be made.

**The footer carries the head commit, and every sign-off its own
fingerprint.** That is what makes a printed page checkable: a reader
with the repository can confirm the paper matches it. The PDF states
what those hashes prove and what they do not, because a fingerprint on
official-looking paper invites more confidence than it has earned.
"""

from __future__ import annotations

import io
import logging
from datetime import date, datetime
from typing import Any

from reportlab.lib import colors  # type: ignore[import-untyped]
from reportlab.lib.enums import TA_LEFT  # type: ignore[import-untyped]
from reportlab.lib.pagesizes import A4  # type: ignore[import-untyped]
from reportlab.lib.styles import (  # type: ignore[import-untyped]
    ParagraphStyle,
    getSampleStyleSheet,
)
from reportlab.lib.units import mm  # type: ignore[import-untyped]
from reportlab.platypus import (  # type: ignore[import-untyped]
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from . import paths
from .schemas import (
    Certificate,
    CpdEntry,
    Index,
    IndexEntry,
    LogbookEntry,
    Profile,
    SignOff,
)
from .serialise import from_yaml, reflection_from_markdown
from .store import PassportNotFoundError, PassportStore

logger = logging.getLogger(__name__)

#: What a missing or unreadable value prints as. One dash, everywhere,
#: so a reader learns its meaning once rather than meeting three
#: different spellings of "we do not know".
_MISSING = "—"

#: Room for the footer, which carries the head commit on every page.
_BOTTOM_MARGIN = 22 * mm


def render_pdf(
    store: PassportStore,
    passport_id: str,
    *,
    head_commit: str | None = None,
    generated_at: datetime | None = None,
) -> bytes:
    """Render a whole passport as a PDF.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        head_commit: The commit this was rendered from, printed in the
            footer so a printed page can be tied to a repository state.
        generated_at: When, for tests.

    Returns:
        The PDF bytes.

    Raises:
        PassportNotFoundError: If there is no such passport. The only
            failure this function raises — everything past reading the
            passport degrades rather than denying the download.
    """
    profile = from_yaml(Profile, store.read(passport_id, paths.PROFILE))
    index = from_yaml(Index, store.read(passport_id, paths.INDEX))
    moment = generated_at or datetime.now(tz=None).astimezone()

    buffer = io.BytesIO()
    styles = _styles()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=_BOTTOM_MARGIN,
        title=f"Clinician passport — {_text(profile.name)}",
        author="Quill Medical",
    )

    story: list[Any] = []
    story.extend(_front_page(profile, index, moment, styles))
    story.extend(_competency_table(index, styles))
    story.extend(_logbook_totals(store, passport_id, index, styles))
    story.extend(_certificates(store, passport_id, styles))
    story.extend(_cpd(store, passport_id, styles))

    story.extend(_reflections_note(store, passport_id, styles))
    story.extend(_sign_offs(store, passport_id, styles))

    document.build(
        story,
        onFirstPage=_footer_drawer(head_commit),
        onLaterPages=_footer_drawer(head_commit),
    )

    return buffer.getvalue()


def _styles() -> dict[str, ParagraphStyle]:
    """The document's paragraph styles.

    Built here rather than read from configuration: a passport has no
    per-tenant styling, and the teaching certificate's config parsing
    exists because bank configs are authored outside this repository.
    Nothing equivalent applies, so there is nothing to parse defensively
    — the defensiveness belongs on the record data instead.
    """
    sheet = getSampleStyleSheet()

    return {
        "title": ParagraphStyle(
            "PassportTitle",
            parent=sheet["Title"],
            fontSize=20,
            spaceAfter=4 * mm,
            alignment=TA_LEFT,
        ),
        "holder": ParagraphStyle(
            "PassportHolder",
            parent=sheet["Heading2"],
            fontSize=14,
            spaceAfter=2 * mm,
        ),
        "heading": ParagraphStyle(
            "PassportHeading",
            parent=sheet["Heading2"],
            fontSize=13,
            spaceBefore=6 * mm,
            spaceAfter=2 * mm,
        ),
        "subheading": ParagraphStyle(
            "PassportSubheading",
            parent=sheet["Heading3"],
            fontSize=11,
            spaceBefore=3 * mm,
            spaceAfter=1 * mm,
        ),
        "body": ParagraphStyle(
            "PassportBody",
            parent=sheet["BodyText"],
            fontSize=9.5,
            leading=13,
        ),
        "caveat": ParagraphStyle(
            "PassportCaveat",
            parent=sheet["BodyText"],
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#555555"),
        ),
        "cell": ParagraphStyle(
            "PassportCell", parent=sheet["BodyText"], fontSize=8.5, leading=11
        ),
    }


def _text(value: object) -> str:
    """Any value as safe paragraph text, or the placeholder.

    Escapes the three characters platypus treats as markup. A logbook
    note containing ``<`` would otherwise raise mid-build and cost
    somebody their download, which is precisely the failure this module
    refuses to have.
    """
    if value is None:
        return _MISSING

    text = str(value).strip()

    if not text:
        return _MISSING

    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _day(value: date | datetime | None) -> str:
    """A date as ``2026-03-14``, or the placeholder if it will not format."""
    if value is None:
        return _MISSING

    try:
        if isinstance(value, datetime):
            return value.date().isoformat()
        return value.isoformat()
    except (AttributeError, ValueError):  # pragma: no cover - defensive
        logger.warning("Unformattable date in a passport; printing a dash")
        return _MISSING


def _front_page(
    profile: Profile,
    index: Index,
    moment: datetime,
    styles: dict[str, ParagraphStyle],
) -> list[Any]:
    """Who this is, what they are registered as, and what this proves."""
    story: list[Any] = [
        Paragraph("Clinician passport", styles["title"]),
        Paragraph(_text(profile.name), styles["holder"]),
    ]

    for registration in profile.registrations:
        standing = (
            "verified" if registration.verified else "declared, not verified"
        )
        story.append(
            Paragraph(
                f"{_text(registration.body)} {_text(registration.number)} "
                f"— <i>{standing}</i>",
                styles["body"],
            )
        )

    story.extend(
        [
            Spacer(1, 4 * mm),
            Paragraph(
                f"Generated {_day(moment)}.",
                styles["body"],
            ),
            Spacer(1, 2 * mm),
            Paragraph(
                "This is a record of assessed clinical competence: what "
                "this person has been signed off to do, by whom, and on "
                "what evidence. Registrations are recorded as declared; "
                "one is marked verified only where somebody has checked a "
                "register by hand. The fingerprints printed against each "
                "sign-off show the record has not changed since it was "
                "written — they do not prove a registration, and they "
                "prove nothing to a reader who distrusts the system that "
                "wrote them.",
                styles["caveat"],
            ),
        ]
    )

    return story


def _competency_table(
    index: Index, styles: dict[str, ParagraphStyle]
) -> list[Any]:
    """One row per competency: the page people actually read."""
    story: list[Any] = [Paragraph("Competencies", styles["heading"])]

    if not index.competencies:
        story.append(Paragraph("Nothing recorded.", styles["body"]))
        return story

    header = ["Competency", "Level", "Status", "Signed off by", "Date"]
    rows: list[list[Any]] = [
        [Paragraph(f"<b>{cell}</b>", styles["cell"]) for cell in header]
    ]

    for entry in sorted(index.competencies, key=lambda e: e.name):
        rows.append(
            [
                Paragraph(_text(entry.name), styles["cell"]),
                Paragraph(
                    _text(entry.level.name if entry.level else None),
                    styles["cell"],
                ),
                Paragraph(_status_word(entry), styles["cell"]),
                Paragraph(_text(entry.signed_off_by), styles["cell"]),
                Paragraph(_day(entry.signed_on), styles["cell"]),
            ]
        )

    table = Table(
        rows,
        colWidths=[52 * mm, 38 * mm, 26 * mm, 34 * mm, 24 * mm],
        repeatRows=1,
    )
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#BBBBBB")),
                (
                    "BACKGROUND",
                    (0, 0),
                    (-1, 0),
                    colors.HexColor("#EEEEEE"),
                ),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )

    story.append(table)
    return story


def _status_word(entry: IndexEntry) -> str:
    """How a competency's state reads on paper.

    An expired sign-off still reads "signed off". What a lapsed sign-off
    implies is a clinical decision nobody has made, so the document
    reports and does not conclude.
    """
    return {
        "requested": "awaiting assessor",
        "signed_off": "signed off",
        "declined": "declined",
        "superseded": "superseded",
    }.get(entry.status, _text(entry.status))


def _logbook_totals(
    store: PassportStore,
    passport_id: str,
    index: Index,
    styles: dict[str, ParagraphStyle],
) -> list[Any]:
    """How many procedures were logged, by competency and by year.

    Totals rather than entries, which is where this parts company with
    the Markdown rendering. A registrar with three hundred bronchoscopies
    does not want three hundred printed lines; they want to answer "how
    many did I do, and when" at a glance, and the repository holds the
    detail for anyone who needs it.

    Grouped by ``performed_on`` — the clinical date inside the entry —
    not by the filename, which records when Quill wrote the file.

    Still a count and never a comparison. No target, no expected number,
    nothing that suggests whether it is enough: that judgement belongs
    to the assessor, and a table that appeared to have made it would
    invite a reader to defer to it.
    """
    story: list[Any] = [Paragraph("Logbook", styles["heading"])]
    counts: dict[str, dict[int, int]] = {}
    years: set[int] = set()

    for entry in index.competencies:
        per_year = _counts_by_year(store, passport_id, entry.id)

        if not per_year:
            continue

        counts[entry.name] = per_year
        years.update(per_year)

    if not counts:
        story.append(Paragraph("Nothing recorded.", styles["body"]))
        return story

    ordered_years = sorted(years)
    header = ["Competency", *[str(year) for year in ordered_years], "Total"]
    rows: list[list[Any]] = [
        [Paragraph(f"<b>{cell}</b>", styles["cell"]) for cell in header]
    ]

    for name in sorted(counts):
        per_year = counts[name]
        cells = [Paragraph(_text(name), styles["cell"])]
        cells.extend(
            Paragraph(str(per_year.get(year, 0)), styles["cell"])
            for year in ordered_years
        )
        cells.append(
            Paragraph(f"<b>{sum(per_year.values())}</b>", styles["cell"])
        )
        rows.append(cells)

    # A totals row: the number most people are looking for.
    footer = [Paragraph("<b>All procedures</b>", styles["cell"])]
    footer.extend(
        Paragraph(
            f"<b>{sum(p.get(year, 0) for p in counts.values())}</b>",
            styles["cell"],
        )
        for year in ordered_years
    )
    footer.append(
        Paragraph(
            f"<b>{sum(sum(p.values()) for p in counts.values())}</b>",
            styles["cell"],
        )
    )
    rows.append(footer)

    year_width = min(18 * mm, (100 * mm) / max(len(ordered_years), 1))
    table = Table(
        rows,
        colWidths=[
            174 * mm - year_width * (len(ordered_years) + 1),
            *[year_width] * len(ordered_years),
            year_width,
        ],
        repeatRows=1,
    )
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#BBBBBB")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEEEEE")),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F6F6F6")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )

    story.append(table)
    return story


def _counts_by_year(
    store: PassportStore, passport_id: str, competency_id: str
) -> dict[int, int]:
    """One competency's entries counted by the year they happened in.

    An unreadable entry is skipped with a warning rather than raising:
    a single bad file must not cost somebody the whole printout.
    """
    per_year: dict[int, int] = {}

    try:
        listing = store.list_dir(passport_id, paths.logbook_dir(competency_id))
    except (PassportNotFoundError, paths.PassportPathError):
        return per_year

    for path in listing:
        try:
            record = from_yaml(LogbookEntry, store.read(passport_id, path))
        except Exception:  # noqa: BLE001 - one bad entry must not stop a print
            logger.warning("Skipping unreadable logbook entry %s", path)
            continue

        year = record.performed_on.year
        per_year[year] = per_year.get(year, 0) + 1

    return per_year


def _certificates(
    store: PassportStore, passport_id: str, styles: dict[str, ParagraphStyle]
) -> list[Any]:
    """Courses and awards, marked plainly as self-declared."""
    story: list[Any] = [Paragraph("Certificates", styles["heading"])]
    found: list[Certificate] = []

    for name in _list(store, passport_id, paths.CERTIFICATES):
        try:
            raw = store.read(passport_id, paths.certificate_file(name))
            found.append(from_yaml(Certificate, raw))
        except Exception:  # noqa: BLE001 - one bad file must not stop a print
            logger.warning("Skipping unreadable certificate %s", name)

    if not found:
        story.append(Paragraph("Nothing recorded.", styles["body"]))
        return story

    story.append(
        Paragraph(
            "Recorded by the holder, with nobody countersigning.",
            styles["caveat"],
        )
    )

    for certificate in sorted(found, key=lambda c: c.awarded_on):
        story.append(
            Paragraph(
                f"<b>{_text(certificate.title)}</b> — "
                f"{_text(certificate.issuer)}, "
                f"{_day(certificate.awarded_on)}",
                styles["body"],
            )
        )

    return story


def _cpd(
    store: PassportStore, passport_id: str, styles: dict[str, ParagraphStyle]
) -> list[Any]:
    """Continuing professional development, newest year first."""
    story: list[Any] = [
        Paragraph("Continuing professional development", styles["heading"])
    ]
    years = sorted(_list(store, passport_id, paths.CPD), reverse=True)
    any_entries = False

    for year in years:
        entries: list[CpdEntry] = []

        for path in _list_paths(store, passport_id, paths.CPD / year):
            try:
                entries.append(
                    from_yaml(CpdEntry, store.read(passport_id, path))
                )
            except Exception:  # noqa: BLE001 - as above
                logger.warning("Skipping unreadable CPD entry in %s", year)

        if not entries:
            continue

        any_entries = True
        entries.sort(key=lambda entry: entry.activity_on)
        hours = sum(entry.hours or 0 for entry in entries)
        activities = "activity" if len(entries) == 1 else "activities"
        summary = f"{len(entries)} {activities}"

        if hours:
            summary += f", {hours:g} hours"

        story.append(
            Paragraph(f"{_text(year)} — {summary}", styles["subheading"])
        )

        for entry in entries:
            story.append(
                Paragraph(
                    f"{_day(entry.activity_on)} — {_text(entry.title)} "
                    f"[{_text(entry.activity_type)}]",
                    styles["body"],
                )
            )

    if not any_entries:
        story.append(Paragraph("Nothing recorded.", styles["body"]))

    return story


def _reflections_note(
    store: PassportStore, passport_id: str, styles: dict[str, ParagraphStyle]
) -> list[Any]:
    """How many reflections were written each year, and nothing else.

    The count is worth printing and the content is not. That somebody
    wrote nine reflections across a year is what an appraiser is looking
    for — evidence of a habit — and it discloses nothing about any
    patient or any case.

    The writing itself never appears, even when a caller asks for
    reflections. A PDF is the form most likely to be handed to somebody
    else and hardest to redact once printed, and written reflection can
    be disclosed in legal proceedings, so the text stays in the
    repository where its holder controls who reads it.

    Only ``written_on`` is read. No title, because a title alone can
    identify a case — "the arrest on ward 12" names nobody and tells
    anyone who was there exactly which patient it was.
    """
    story: list[Any] = [Paragraph("Reflections", styles["heading"])]
    per_year: dict[int, int] = {}

    for name in _list(store, passport_id, paths.REFLECTIONS):
        try:
            raw = store.read(passport_id, paths.reflection_file(name))
            reflection, _body = reflection_from_markdown(raw)
        except Exception:  # noqa: BLE001 - one bad file must not stop a print
            logger.warning("Skipping unreadable reflection %s", name)
            continue

        year = reflection.written_on.year
        per_year[year] = per_year.get(year, 0) + 1

    if not per_year:
        story.append(Paragraph("Nothing recorded.", styles["body"]))
        return story

    story.append(
        Paragraph(
            "Counts only. The writing is the holder's own and is not "
            "printed here.",
            styles["caveat"],
        )
    )

    rows: list[list[Any]] = [
        [
            Paragraph("<b>Year</b>", styles["cell"]),
            Paragraph("<b>Reflections written</b>", styles["cell"]),
        ]
    ]

    for year in sorted(per_year, reverse=True):
        rows.append(
            [
                Paragraph(str(year), styles["cell"]),
                Paragraph(str(per_year[year]), styles["cell"]),
            ]
        )

    rows.append(
        [
            Paragraph("<b>Total</b>", styles["cell"]),
            Paragraph(f"<b>{sum(per_year.values())}</b>", styles["cell"]),
        ]
    )

    table = Table(rows, colWidths=[30 * mm, 40 * mm], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#BBBBBB")),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EEEEEE")),
                ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F6F6F6")),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )

    story.append(table)
    return story


def _sign_offs(
    store: PassportStore, passport_id: str, styles: dict[str, ParagraphStyle]
) -> list[Any]:
    """Every sign-off in full, each with its own fingerprint."""
    story: list[Any] = [
        PageBreak(),
        Paragraph("Sign-offs in full", styles["heading"]),
    ]

    records: list[tuple[str, SignOff]] = []

    for name in _list(store, passport_id, paths.SIGN_OFFS):
        try:
            raw = store.read(passport_id, paths.sign_off_file(name))
            records.append((name, from_yaml(SignOff, raw)))
        except Exception:  # noqa: BLE001 - one bad record must still print
            logger.warning("Skipping unreadable sign-off %s", name)

    if not records:
        story.append(Paragraph("Nothing recorded.", styles["body"]))
        return story

    records.sort(key=lambda item: item[1].observed_on)

    for name, record in records:
        story.append(KeepTogether(_one_sign_off(name, record, styles)))

    return story


def _one_sign_off(
    name: str, record: SignOff, styles: dict[str, ParagraphStyle]
) -> list[Any]:
    """One sign-off, kept on a single page where it fits."""
    block: list[Any] = [
        Paragraph(_text(record.competency.name), styles["subheading"])
    ]

    facts = [
        f"Status: {_text(record.status)}",
        f"Observed: {_day(record.observed_on)}",
    ]

    if record.level:
        facts.insert(0, f"Level: {_text(record.level.name)}")

    if record.signed_at:
        facts.append(f"Signed: {_day(record.signed_at)}")

    if record.meaning:
        facts.append(f"The assessor {_text(record.meaning)}")

    if record.expires_on:
        facts.append(f"Expires: {_day(record.expires_on)}")

    block.append(Paragraph(" · ".join(facts), styles["body"]))

    if record.signed_off_by:
        assessor = record.signed_off_by
        registrations = ", ".join(
            f"{_text(r.body)} {_text(r.number)}"
            for r in assessor.registrations
        )
        standing = (
            "registration verified"
            if assessor.registration_verified
            else "registration declared, not verified"
        )
        block.append(
            Paragraph(
                f"Signed off by {_text(assessor.name)}, "
                f"{_text(assessor.role)}"
                + (f" ({registrations})" if registrations else "")
                + f" — <i>{standing}</i>",
                styles["body"],
            )
        )

    if record.comments:
        block.append(
            Paragraph(f"<i>{_text(record.comments)}</i>", styles["body"])
        )

    if record.content_hash:
        block.append(
            Paragraph(
                f"Fingerprint {_text(record.content_hash)}", styles["caveat"]
            )
        )

    block.append(Spacer(1, 3 * mm))
    return block


def _footer_drawer(head_commit: str | None) -> Any:
    """A page callback printing the commit and page number.

    The commit is what ties a printed page to a repository state, so it
    goes on every page rather than only the first: pages get separated.
    """

    def draw(canvas_obj: Any, document: Any) -> None:
        canvas_obj.saveState()
        canvas_obj.setFont("Helvetica", 7.5)
        canvas_obj.setFillColor(colors.HexColor("#666666"))

        left = document.leftMargin
        baseline = 12 * mm

        if head_commit:
            canvas_obj.drawString(
                left, baseline, f"Repository commit {head_commit}"
            )

        canvas_obj.drawRightString(
            A4[0] - document.rightMargin,
            baseline,
            f"Page {document.page}",
        )
        canvas_obj.restoreState()

    return draw


def _list(store: PassportStore, passport_id: str, path: Any) -> list[str]:
    """Directory entry names under *path*, or nothing if it is absent."""
    try:
        return [entry.name for entry in store.list_dir(passport_id, path)]
    except (PassportNotFoundError, paths.PassportPathError):
        return []


def _list_paths(
    store: PassportStore, passport_id: str, path: Any
) -> list[Any]:
    """Full paths under *path*, or nothing if it is absent."""
    try:
        return list(store.list_dir(passport_id, path))
    except (PassportNotFoundError, paths.PassportPathError):
        return []

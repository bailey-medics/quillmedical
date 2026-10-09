"""How the index is rebuilt from the records, asked of index.py itself."""

from collections.abc import Mapping
from datetime import UTC, date, datetime, timedelta
from pathlib import PurePosixPath

import pytest

from app.features.passport import index, paths, serialise
from app.features.passport.commits import Actor, CommitMessage
from app.features.passport.schemas import (
    SCHEMA_VERSION,
    Assessor,
    Certificate,
    CompetencyRef,
    Index,
    IndexEntry,
    LevelRef,
    LogbookEntry,
    PassportModel,
    ScopeRef,
    SignOff,
    SignOffStatus,
)
from app.features.passport.serialise import RecordFormatError
from app.features.passport.store import (
    PassportHead,
    PassportNotFoundError,
    PassportStore,
)

PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
NOW = datetime(2026, 3, 14, 14, 32, 7, tzinfo=UTC)

CANNULATION = "perform_cannulation"
SACT = "prescribe_sact"
LUNG = ScopeRef(id="lung", name="Lung")
BREAST = ScopeRef(id="breast", name="Breast")
LEVEL_2 = LevelRef(id="level_2", name="Direct supervision")
LEVEL_3 = LevelRef(id="level_3", name="Indirect supervision")


class FakeStore(PassportStore):
    """One passport's files held in memory, read and listed as git would.

    Only what the index asks of a store: ``read`` refuses a file that is
    not there, and ``list_dir`` gives the entries directly beneath a
    directory, sorted, or nothing where there is no such directory.
    """

    def __init__(self) -> None:
        self.files: dict[PurePosixPath, str] = {}

    def put(self, path: PurePosixPath, record: PassportModel | str) -> None:
        self.files[path] = (
            record if isinstance(record, str) else serialise.to_yaml(record)
        )

    def read(self, passport_id: str, path: PurePosixPath) -> bytes:
        if path not in self.files:
            raise PassportNotFoundError(f"No file {path}.")

        return self.files[path].encode()

    def list_dir(
        self, passport_id: str, path: PurePosixPath
    ) -> list[PurePosixPath]:
        depth = len(path.parts)

        return sorted(
            {
                PurePosixPath(*found.parts[: depth + 1])
                for found in self.files
                if found.parts[:depth] == path.parts
                and len(found.parts) > depth
            }
        )

    def exists(self, passport_id: str) -> bool:
        raise NotImplementedError

    def create(
        self,
        passport_id: str,
        files: Mapping[PurePosixPath, str | bytes],
        message: CommitMessage,
        actor: Actor,
    ) -> str:
        raise NotImplementedError

    def head(self, passport_id: str) -> PassportHead:
        raise NotImplementedError

    def contains(self, passport_id: str, commit: str) -> bool:
        raise NotImplementedError

    def write(
        self,
        passport_id: str,
        files: Mapping[PurePosixPath, str | bytes],
        message: CommitMessage,
        actor: Actor,
        expected_head: PassportHead,
        *,
        delete: tuple[PurePosixPath, ...] = (),
    ) -> str:
        raise NotImplementedError


def _sign_off(
    competency_id: str = CANNULATION,
    *,
    observed_on: date,
    status: SignOffStatus = "requested",
    name: str = "Perform cannulation",
    scope: ScopeRef | None = None,
    level: LevelRef | None = None,
    requested_level: LevelRef | None = None,
    comments: str | None = None,
    expires_on: date | None = None,
    signed_at: datetime = NOW,
) -> SignOff:
    """A sign-off, with an assessor and a moment where it says it is signed."""
    signed = status == "signed_off"

    return SignOff(
        id=f"{observed_on.isoformat()}-{competency_id}",
        competency=CompetencyRef(id=competency_id, name=name),
        kind="initial",
        status=status,
        level=level,
        requested_level=requested_level,
        scope=scope,
        observed_on=observed_on,
        signed_at=signed_at if signed else None,
        expires_on=expires_on,
        signed_off_by=(
            Assessor(user_id="42", name="Dr Ada Marsh", role="Consultant")
            if signed
            else None
        ),
        meaning="directly observed" if signed else None,
        comments=comments,
    )


def _file_sign_off(store: FakeStore, folder: str, record: SignOff) -> None:
    store.put(paths.sign_off_file(folder), record)


def _log(
    store: FakeStore,
    competency_id: str,
    stem: str,
    *,
    scope: ScopeRef | None = None,
    also: list[str] | None = None,
) -> None:
    store.put(
        paths.logbook_entry(competency_id, stem),
        LogbookEntry(
            performed_on=date(2026, 3, 12),
            scope=scope,
            also_counts_towards=also or [],
        ),
    )


def _certify(store: FakeStore, folder: str, *competency_ids: str) -> None:
    store.put(
        paths.certificate_file(folder),
        Certificate(
            id=folder,
            title="A course",
            issuer="Royal College of Physicians",
            awarded_on=date(2025, 11, 4),
            competencies=[
                CompetencyRef(id=competency_id, name="As the course named it")
                for competency_id in competency_ids
            ],
        ),
    )


def _keys(built: Index) -> list[tuple[str, str | None]]:
    """Which entries an index holds, in its order: competency and scope."""
    return [
        (entry.id, entry.scope.id if entry.scope is not None else None)
        for entry in built.competencies
    ]


# --- _sign_offs -------------------------------------------------------------


def test_a_passport_with_no_sign_offs_has_none_to_group() -> None:
    assert index._sign_offs(FakeStore(), PASSPORT_ID) == {}


def test_sign_offs_are_grouped_by_competency_and_by_scope() -> None:
    """A sign-off for one scope is no part of another's history."""
    store = FakeStore()
    whole = _sign_off(observed_on=date(2026, 1, 5))
    lung = _sign_off(SACT, observed_on=date(2026, 1, 6), scope=LUNG)
    breast = _sign_off(SACT, observed_on=date(2026, 1, 7), scope=BREAST)
    _file_sign_off(store, "2026-01-05-perform-cannulation", whole)
    _file_sign_off(store, "2026-01-06-prescribe-sact", lung)
    _file_sign_off(store, "2026-01-07-prescribe-sact", breast)

    found = index._sign_offs(store, PASSPORT_ID)

    assert found == {
        (CANNULATION, None): [("2026-01-05-perform-cannulation", whole)],
        (SACT, "lung"): [("2026-01-06-prescribe-sact", lung)],
        (SACT, "breast"): [("2026-01-07-prescribe-sact", breast)],
    }


def test_sign_offs_are_ordered_by_day_observed_not_folder_name() -> None:
    store = FakeStore()
    earlier = _sign_off(observed_on=date(2026, 1, 5))
    later = _sign_off(observed_on=date(2026, 2, 5))
    _file_sign_off(store, "2026-01-01-zz-filed-first", later)
    _file_sign_off(store, "2026-09-09-aa-filed-last", earlier)

    found = index._sign_offs(store, PASSPORT_ID)

    assert [name for name, _ in found[(CANNULATION, None)]] == [
        "2026-09-09-aa-filed-last",
        "2026-01-01-zz-filed-first",
    ]


def test_sign_offs_observed_the_same_day_are_in_folder_order() -> None:
    store = FakeStore()
    record = _sign_off(observed_on=date(2026, 1, 5))
    _file_sign_off(store, "2026-01-05-perform-cannulation-2", record)
    _file_sign_off(store, "2026-01-05-perform-cannulation", record)

    found = index._sign_offs(store, PASSPORT_ID)

    assert [name for name, _ in found[(CANNULATION, None)]] == [
        "2026-01-05-perform-cannulation",
        "2026-01-05-perform-cannulation-2",
    ]


def test_a_sign_off_folder_holding_no_record_is_passed_over() -> None:
    """Somebody made the folder by hand: the rest is still rebuilt."""
    store = FakeStore()
    record = _sign_off(observed_on=date(2026, 1, 5))
    _file_sign_off(store, "2026-01-05-perform-cannulation", record)
    store.put(
        paths.sign_off_reflection("2026-01-06-made-by-hand"), "Some notes.\n"
    )

    found = index._sign_offs(store, PASSPORT_ID)

    assert found == {
        (CANNULATION, None): [("2026-01-05-perform-cannulation", record)]
    }


@pytest.mark.parametrize(
    "stray",
    [
        paths.SIGN_OFFS / "notes" / "sign-off.yaml",
        paths.SIGN_OFFS / "Notes For Me" / "anything.txt",
        paths.SIGN_OFFS / "readme.txt",
    ],
)
def test_a_folder_or_file_with_a_name_of_its_own_is_passed_over(
    stray: PurePosixPath,
) -> None:
    """Not a date and a slug, so made by hand: the rest is still rebuilt."""
    store = FakeStore()
    record = _sign_off(observed_on=date(2026, 1, 5))
    _file_sign_off(store, "2026-01-05-perform-cannulation", record)
    store.put(stray, "x\n")

    found = index._sign_offs(store, PASSPORT_ID)

    assert found == {
        (CANNULATION, None): [("2026-01-05-perform-cannulation", record)]
    }


def test_a_sign_off_that_cannot_be_read_is_not_quietly_skipped() -> None:
    """Skipping it would under-report what somebody is signed off for."""
    store = FakeStore()
    store.put(
        paths.sign_off_file("2026-01-05-perform-cannulation"),
        "status: signed_off\n",
    )

    with pytest.raises(RecordFormatError):
        index._sign_offs(store, PASSPORT_ID)


# --- _logbook_counts --------------------------------------------------------


def test_an_empty_logbook_counts_nothing() -> None:
    assert index._logbook_counts(FakeStore(), PASSPORT_ID) == ({}, {})


def test_entries_are_counted_for_each_competency_and_scope() -> None:
    store = FakeStore()
    _log(store, CANNULATION, "2026-03-12-090000")
    _log(store, CANNULATION, "2026-03-12-100000")
    _log(store, SACT, "2026-03-12-110000", scope=LUNG)
    _log(store, SACT, "2026-03-12-120000", scope=LUNG)
    _log(store, SACT, "2026-03-12-130000", scope=LUNG)
    _log(store, SACT, "2026-03-12-140000", scope=BREAST)
    _log(store, SACT, "2026-03-12-150000")

    counts, _scopes = index._logbook_counts(store, PASSPORT_ID)

    assert counts == {
        (CANNULATION, None): 2,
        (SACT, "lung"): 3,
        (SACT, "breast"): 1,
        (SACT, None): 1,
    }


def test_the_scopes_are_kept_as_the_entries_worded_them() -> None:
    """Only for entries naming one: an unscoped count has no words."""
    store = FakeStore()
    _log(store, CANNULATION, "2026-03-12-090000")
    _log(store, SACT, "2026-03-12-110000", scope=LUNG)
    _log(store, SACT, "2026-03-12-140000", scope=BREAST)

    _counts, scopes = index._logbook_counts(store, PASSPORT_ID)

    assert scopes == {(SACT, "lung"): LUNG, (SACT, "breast"): BREAST}


def test_an_entry_is_counted_everywhere_it_also_counts_towards() -> None:
    store = FakeStore()
    _log(
        store,
        CANNULATION,
        "2026-03-12-090000",
        also=["perform_venepuncture", "take_informed_consent"],
    )

    counts, _scopes = index._logbook_counts(store, PASSPORT_ID)

    assert counts == {
        (CANNULATION, None): 1,
        ("perform_venepuncture", None): 1,
        ("take_informed_consent", None): 1,
    }


def test_an_entry_carries_no_scope_to_what_it_also_counts_towards() -> None:
    """Its scope is one of the competency it is filed under."""
    store = FakeStore()
    _log(
        store,
        SACT,
        "2026-03-12-110000",
        scope=LUNG,
        also=["take_informed_consent"],
    )

    counts, scopes = index._logbook_counts(store, PASSPORT_ID)

    assert counts == {(SACT, "lung"): 1, ("take_informed_consent", None): 1}
    assert scopes == {(SACT, "lung"): LUNG}


def test_an_entry_naming_its_own_competency_again_is_counted_once() -> None:
    store = FakeStore()
    _log(store, CANNULATION, "2026-03-12-090000", also=[CANNULATION])

    counts, _scopes = index._logbook_counts(store, PASSPORT_ID)

    assert counts == {(CANNULATION, None): 1}


def test_a_logbook_entry_that_cannot_be_read_stops_the_count() -> None:
    store = FakeStore()
    store.put(
        paths.logbook_entry(CANNULATION, "2026-03-12-090000"),
        "- not\n- a mapping\n",
    )

    with pytest.raises(RecordFormatError):
        index._logbook_counts(store, PASSPORT_ID)


# --- _certificates ----------------------------------------------------------


def test_a_passport_with_no_certificates_relates_none() -> None:
    assert index._certificates(FakeStore(), PASSPORT_ID) == {}


def test_a_certificate_is_listed_under_each_competency_it_names() -> None:
    store = FakeStore()
    _certify(store, "2025-11-04-vascular-access", CANNULATION, SACT)

    assert index._certificates(store, PASSPORT_ID) == {
        CANNULATION: ["2025-11-04-vascular-access"],
        SACT: ["2025-11-04-vascular-access"],
    }


def test_certificates_for_a_competency_are_listed_in_folder_order() -> None:
    store = FakeStore()
    _certify(store, "2025-11-04-vascular-access", CANNULATION)
    _certify(store, "2024-02-01-induction", CANNULATION)
    _certify(store, "2025-11-04-sact-passport", SACT)

    assert index._certificates(store, PASSPORT_ID) == {
        CANNULATION: ["2024-02-01-induction", "2025-11-04-vascular-access"],
        SACT: ["2025-11-04-sact-passport"],
    }


def test_a_certificate_naming_no_competency_is_listed_nowhere() -> None:
    store = FakeStore()
    _certify(store, "2025-11-04-fire-safety")

    assert index._certificates(store, PASSPORT_ID) == {}


def test_a_certificate_folder_holding_no_record_is_passed_over() -> None:
    store = FakeStore()
    _certify(store, "2025-11-04-vascular-access", CANNULATION)
    store.put(
        paths.certificate_dir("2025-12-01-made-by-hand") / "scan.txt", "x\n"
    )

    assert index._certificates(store, PASSPORT_ID) == {
        CANNULATION: ["2025-11-04-vascular-access"]
    }


@pytest.mark.parametrize(
    "stray",
    [
        paths.CERTIFICATES / "scans" / "certificate.yaml",
        paths.CERTIFICATES / "readme.txt",
    ],
)
def test_a_certificate_folder_with_a_name_of_its_own_is_passed_over(
    stray: PurePosixPath,
) -> None:
    store = FakeStore()
    _certify(store, "2025-11-04-vascular-access", CANNULATION)
    store.put(stray, "x\n")

    assert index._certificates(store, PASSPORT_ID) == {
        CANNULATION: ["2025-11-04-vascular-access"]
    }


def test_a_certificate_that_cannot_be_read_is_not_quietly_skipped() -> None:
    store = FakeStore()
    store.put(
        paths.certificate_file("2025-11-04-vascular-access"),
        "title: [unfinished\n",
    )

    with pytest.raises(RecordFormatError):
        index._certificates(store, PASSPORT_ID)


# --- evidence_for -----------------------------------------------------------


def test_evidence_is_one_scopes_entries_and_every_certificate() -> None:
    """A certificate names no scope, so every scope sees them all."""
    store = FakeStore()
    _log(store, SACT, "2026-03-12-110000", scope=LUNG)
    _log(store, SACT, "2026-03-12-120000", scope=LUNG)
    _log(store, SACT, "2026-03-12-140000", scope=BREAST)
    _log(store, SACT, "2026-03-12-150000")
    _certify(store, "2025-11-04-sact-passport", SACT)

    certificates = ["2025-11-04-sact-passport"]
    assert index.evidence_for(store, PASSPORT_ID, SACT, "lung") == (
        2,
        certificates,
    )
    assert index.evidence_for(store, PASSPORT_ID, SACT, "breast") == (
        1,
        certificates,
    )
    assert index.evidence_for(store, PASSPORT_ID, SACT, None) == (
        1,
        certificates,
    )


def test_a_scope_with_nothing_logged_still_sees_certificates() -> None:
    store = FakeStore()
    _log(store, SACT, "2026-03-12-110000", scope=LUNG)
    _certify(store, "2025-11-04-sact-passport", SACT)

    assert index.evidence_for(store, PASSPORT_ID, SACT, "colorectal") == (
        0,
        ["2025-11-04-sact-passport"],
    )


def test_a_competency_with_no_evidence_has_none() -> None:
    store = FakeStore()
    _log(store, SACT, "2026-03-12-110000", scope=LUNG)
    _certify(store, "2025-11-04-sact-passport", SACT)

    assert index.evidence_for(store, PASSPORT_ID, CANNULATION, None) == (0, [])
    assert index.evidence_for(FakeStore(), PASSPORT_ID, SACT, "lung") == (
        0,
        [],
    )


# --- _entry -----------------------------------------------------------------


def test_evidence_with_no_sign_off_is_listed_as_requested() -> None:
    entry = index._entry(CANNULATION, [], 30, ["2025-11-04-vascular-access"])

    assert entry == IndexEntry(
        id=CANNULATION,
        name="Perform cannulation",
        status="requested",
        logbook_entries=30,
        certificates=["2025-11-04-vascular-access"],
    )
    assert entry.sign_off is None
    assert entry.previous_sign_offs == []


def test_with_no_sign_off_anywhere_the_id_stands_in_for_the_name() -> None:
    entry = index._entry("take_informed_consent", [], 1, [])

    assert entry.name == "Take informed consent"


def test_an_unsigned_entry_takes_the_name_and_scope_given() -> None:
    entry = index._entry(
        SACT,
        [],
        4,
        [],
        name="Review and prescribe systemic anti-cancer therapy",
        scope=LUNG,
    )

    assert entry.name == "Review and prescribe systemic anti-cancer therapy"
    assert entry.scope == LUNG


def test_the_latest_sign_off_supplies_everything_an_entry_says() -> None:
    signed_at = datetime(2026, 2, 6, 23, 30, tzinfo=UTC)
    latest = _sign_off(
        SACT,
        observed_on=date(2026, 2, 5),
        status="signed_off",
        name="Review and prescribe SACT",
        scope=LUNG,
        level=LEVEL_3,
        requested_level=LEVEL_3,
        expires_on=date(2029, 2, 5),
        signed_at=signed_at,
    )
    earlier = _sign_off(
        SACT, observed_on=date(2026, 1, 5), status="declined", scope=LUNG
    )

    entry = index._entry(
        SACT,
        [("2026-01-05-prescribe-sact", earlier), ("2026-02-05-sact", latest)],
        12,
        ["2025-11-04-sact-passport"],
    )

    assert entry == IndexEntry(
        id=SACT,
        name="Review and prescribe SACT",
        scope=LUNG,
        status="signed_off",
        level=LEVEL_3,
        requested_level=LEVEL_3,
        level_change_reason=None,
        signed_on=date(2026, 2, 6),
        signed_off_by="Dr Ada Marsh",
        expires_on=date(2029, 2, 5),
        sign_off="2026-02-05-sact",
        previous_sign_offs=["2026-01-05-prescribe-sact"],
        logbook_entries=12,
        certificates=["2025-11-04-sact-passport"],
    )


def test_a_signed_entry_ignores_the_name_and_scope_given() -> None:
    record = _sign_off(
        SACT, observed_on=date(2026, 1, 5), name="As signed", scope=LUNG
    )

    entry = index._entry(
        SACT,
        [("2026-01-05-prescribe-sact", record)],
        0,
        [],
        name="As another entry had it",
        scope=BREAST,
    )

    assert entry.name == "As signed"
    assert entry.scope == LUNG


def test_earlier_sign_offs_are_listed_newest_first() -> None:
    records = [
        (f"2026-0{month}-05-perform-cannulation", _sign_off(observed_on=day))
        for month, day in (
            (1, date(2026, 1, 5)),
            (2, date(2026, 2, 5)),
            (3, date(2026, 3, 5)),
        )
    ]

    entry = index._entry(CANNULATION, records, 0, [])

    assert entry.sign_off == "2026-03-05-perform-cannulation"
    assert entry.previous_sign_offs == [
        "2026-02-05-perform-cannulation",
        "2026-01-05-perform-cannulation",
    ]


def test_an_open_request_has_nobody_and_no_day_signed() -> None:
    record = _sign_off(observed_on=date(2026, 1, 5), requested_level=LEVEL_2)

    entry = index._entry(
        CANNULATION, [("2026-01-05-perform-cannulation", record)], 0, []
    )

    assert entry.status == "requested"
    assert entry.signed_on is None
    assert entry.signed_off_by is None
    assert entry.requested_level == LEVEL_2
    assert entry.sign_off == "2026-01-05-perform-cannulation"


@pytest.mark.parametrize("latest_status", ["declined", "superseded"])
def test_status_is_the_latest_records_and_not_a_conclusion(
    latest_status: SignOffStatus,
) -> None:
    """An earlier sign-off is not held up against the one after it."""
    signed = _sign_off(observed_on=date(2026, 1, 5), status="signed_off")
    after = _sign_off(observed_on=date(2026, 2, 5), status=latest_status)

    entry = index._entry(
        CANNULATION,
        [
            ("2026-01-05-perform-cannulation", signed),
            ("2026-02-05-perform-cannulation", after),
        ],
        0,
        [],
    )

    assert entry.status == latest_status
    assert entry.signed_off_by is None


def test_a_sign_off_past_its_expiry_is_still_reported_as_signed_off() -> None:
    """What a lapsed sign-off implies is not the index's to decide."""
    record = _sign_off(
        observed_on=date(2020, 1, 5),
        status="signed_off",
        expires_on=NOW.date() - timedelta(days=1),
    )

    entry = index._entry(
        CANNULATION, [("2020-01-05-perform-cannulation", record)], 0, []
    )

    assert entry.status == "signed_off"
    assert entry.expires_on == NOW.date() - timedelta(days=1)


def test_a_changed_level_carries_the_assessors_reason() -> None:
    record = _sign_off(
        observed_on=date(2026, 1, 5),
        status="signed_off",
        level=LEVEL_2,
        requested_level=LEVEL_3,
        comments="Needs more independent lists first.",
    )

    entry = index._entry(
        CANNULATION, [("2026-01-05-perform-cannulation", record)], 0, []
    )

    assert entry.level == LEVEL_2
    assert entry.requested_level == LEVEL_3
    assert entry.level_change_reason == "Needs more independent lists first."


@pytest.mark.parametrize(
    ("level", "requested_level"),
    [
        (LEVEL_3, LEVEL_3),
        (LEVEL_3, None),
        (None, LEVEL_3),
        (None, None),
    ],
)
def test_a_comment_is_not_a_reason_unless_the_level_changed(
    level: LevelRef | None, requested_level: LevelRef | None
) -> None:
    """The same level, or either one missing, is no change to explain."""
    record = _sign_off(
        observed_on=date(2026, 1, 5),
        status="signed_off",
        level=level,
        requested_level=requested_level,
        comments="A pleasure to observe.",
    )

    entry = index._entry(
        CANNULATION, [("2026-01-05-perform-cannulation", record)], 0, []
    )

    assert entry.level_change_reason is None


# --- competency_names -------------------------------------------------------


def _index_of(*entries: IndexEntry) -> Index:
    return Index(
        schema_version=SCHEMA_VERSION,
        generated_at=NOW,
        competencies=list(entries),
    )


def _listed(
    competency_id: str,
    name: str,
    *,
    sign_off: str | None = None,
    scope: ScopeRef | None = None,
) -> IndexEntry:
    return IndexEntry(
        id=competency_id,
        name=name,
        scope=scope,
        status="requested",
        sign_off=sign_off,
    )


def test_an_empty_index_names_no_competencies() -> None:
    assert index.competency_names(_index_of()) == {}


def test_each_competency_is_named_once_in_name_order() -> None:
    names = index.competency_names(
        _index_of(
            _listed("perform_venepuncture", "Venepuncture"),
            _listed(SACT, "Prescribe SACT", scope=BREAST),
            _listed(SACT, "Prescribe SACT", scope=LUNG),
            _listed(CANNULATION, "Cannulation"),
        )
    )

    assert list(names.items()) == [
        (CANNULATION, "Cannulation"),
        (SACT, "Prescribe SACT"),
        ("perform_venepuncture", "Venepuncture"),
    ]


def test_a_name_from_a_sign_off_is_preferred_in_either_order() -> None:
    signed = _listed(
        SACT, "Review and prescribe SACT", sign_off="2026-01-05-sact"
    )
    stand_in = _listed(SACT, "Prescribe sact", scope=LUNG)

    assert index.competency_names(_index_of(stand_in, signed)) == {
        SACT: "Review and prescribe SACT"
    }
    assert index.competency_names(_index_of(signed, stand_in)) == {
        SACT: "Review and prescribe SACT"
    }


def test_a_stand_in_name_is_used_where_no_entry_has_a_sign_off() -> None:
    names = index.competency_names(
        _index_of(_listed(SACT, "Prescribe sact", scope=LUNG))
    )

    assert names == {SACT: "Prescribe sact"}


# --- build ------------------------------------------------------------------


def test_an_empty_passport_builds_an_index_with_no_competencies() -> None:
    built = index.build(FakeStore(), PASSPORT_ID, now=NOW)

    assert built == Index(
        schema_version=SCHEMA_VERSION, generated_at=NOW, competencies=[]
    )


def test_a_naive_moment_is_refused() -> None:
    with pytest.raises(ValueError, match="naive"):
        index.build(FakeStore(), PASSPORT_ID, now=datetime(2026, 3, 14, 14))


def test_with_no_moment_given_the_index_is_stamped_now_and_aware() -> None:
    before = datetime.now(UTC)

    built = index.build(FakeStore(), PASSPORT_ID)

    assert built.generated_at.tzinfo is not None
    assert before <= built.generated_at <= datetime.now(UTC)


def test_every_competency_with_any_evidence_gets_an_entry() -> None:
    """A sign-off, a logbook entry or a certificate: any one is enough."""
    store = FakeStore()
    _file_sign_off(
        store,
        "2026-01-05-perform-cannulation",
        _sign_off(observed_on=date(2026, 1, 5)),
    )
    _log(store, "perform_venepuncture", "2026-03-12-090000")
    _certify(store, "2025-11-04-consent-course", "take_informed_consent")

    built = index.build(store, PASSPORT_ID, now=NOW)

    assert _keys(built) == [
        (CANNULATION, None),
        ("perform_venepuncture", None),
        ("take_informed_consent", None),
    ]
    by_id = {entry.id: entry for entry in built.competencies}
    assert by_id[CANNULATION].sign_off == "2026-01-05-perform-cannulation"
    assert by_id["perform_venepuncture"].logbook_entries == 1
    assert by_id["perform_venepuncture"].sign_off is None
    assert by_id["take_informed_consent"].certificates == [
        "2025-11-04-consent-course"
    ]
    assert by_id["take_informed_consent"].status == "requested"


def test_entries_are_in_id_order_unscoped_before_scoped() -> None:
    store = FakeStore()
    _log(store, SACT, "2026-03-12-110000", scope=LUNG)
    _log(store, SACT, "2026-03-12-140000", scope=BREAST)
    _log(store, SACT, "2026-03-12-150000")
    _log(store, "take_informed_consent", "2026-03-12-160000")
    _log(store, CANNULATION, "2026-03-12-090000")

    built = index.build(store, PASSPORT_ID, now=NOW)

    assert _keys(built) == [
        (CANNULATION, None),
        (SACT, None),
        (SACT, "breast"),
        (SACT, "lung"),
        ("take_informed_consent", None),
    ]


def test_each_scope_has_an_entry_with_its_own_sign_offs_and_count() -> None:
    store = FakeStore()
    _file_sign_off(
        store,
        "2026-01-05-prescribe-sact",
        _sign_off(
            SACT,
            observed_on=date(2026, 1, 5),
            status="signed_off",
            scope=LUNG,
            level=LEVEL_3,
        ),
    )
    _file_sign_off(
        store,
        "2026-02-05-prescribe-sact",
        _sign_off(SACT, observed_on=date(2026, 2, 5), scope=BREAST),
    )
    _log(store, SACT, "2026-03-12-110000", scope=LUNG)
    _log(store, SACT, "2026-03-12-120000", scope=LUNG)

    built = index.build(store, PASSPORT_ID, now=NOW)

    breast, lung = built.competencies
    assert (lung.status, lung.level, lung.logbook_entries) == (
        "signed_off",
        LEVEL_3,
        2,
    )
    assert lung.sign_off == "2026-01-05-prescribe-sact"
    assert lung.previous_sign_offs == []
    assert (breast.status, breast.level, breast.logbook_entries) == (
        "requested",
        None,
        0,
    )
    assert breast.sign_off == "2026-02-05-prescribe-sact"


def test_a_scope_with_only_a_logbook_borrows_the_signed_name() -> None:
    """The name from the competency's sign-off, the scope from the entry."""
    store = FakeStore()
    _file_sign_off(
        store,
        "2026-01-05-prescribe-sact",
        _sign_off(
            SACT,
            observed_on=date(2026, 1, 5),
            name="Review and prescribe SACT",
            scope=LUNG,
        ),
    )
    _log(store, SACT, "2026-03-12-140000", scope=BREAST)

    built = index.build(store, PASSPORT_ID, now=NOW)

    breast = built.competencies[0]
    assert breast.scope == BREAST
    assert breast.name == "Review and prescribe SACT"
    assert breast.status == "requested"
    assert breast.sign_off is None
    assert breast.logbook_entries == 1


def test_a_certificate_is_reported_by_every_entry_of_its_competency() -> None:
    """And adds no unscoped entry where the competency already has one."""
    store = FakeStore()
    _log(store, SACT, "2026-03-12-110000", scope=LUNG)
    _log(store, SACT, "2026-03-12-140000", scope=BREAST)
    _certify(store, "2025-11-04-sact-passport", SACT)

    built = index.build(store, PASSPORT_ID, now=NOW)

    assert _keys(built) == [(SACT, "breast"), (SACT, "lung")]
    assert [entry.certificates for entry in built.competencies] == [
        ["2025-11-04-sact-passport"],
        ["2025-11-04-sact-passport"],
    ]


def test_counting_towards_another_competency_gives_it_an_entry() -> None:
    store = FakeStore()
    _log(
        store,
        SACT,
        "2026-03-12-110000",
        scope=LUNG,
        also=["take_informed_consent"],
    )

    built = index.build(store, PASSPORT_ID, now=NOW)

    assert _keys(built) == [(SACT, "lung"), ("take_informed_consent", None)]
    assert [entry.logbook_entries for entry in built.competencies] == [1, 1]


def test_an_unreadable_sign_off_stops_the_whole_rebuild() -> None:
    store = FakeStore()
    _log(store, CANNULATION, "2026-03-12-090000")
    store.put(
        paths.sign_off_file("2026-01-05-perform-cannulation"), "nonsense\n"
    )

    with pytest.raises(RecordFormatError):
        index.build(store, PASSPORT_ID, now=NOW)


# --- render -----------------------------------------------------------------


def test_the_rendered_index_opens_by_saying_not_to_edit_it() -> None:
    rendered = index.render(index.build(FakeStore(), PASSPORT_ID, now=NOW))

    first_line = rendered.splitlines()[0]
    assert first_line.startswith("# Derived index")
    assert "Do not edit" in first_line


def test_the_rendered_index_reads_back_as_the_index_built() -> None:
    store = FakeStore()
    _file_sign_off(
        store,
        "2026-01-05-prescribe-sact",
        _sign_off(
            SACT,
            observed_on=date(2026, 1, 5),
            status="signed_off",
            scope=LUNG,
            level=LEVEL_2,
            requested_level=LEVEL_3,
            comments="Not yet.",
        ),
    )
    _log(store, SACT, "2026-03-12-110000", scope=LUNG)
    _certify(store, "2025-11-04-sact-passport", SACT)
    built = index.build(store, PASSPORT_ID, now=NOW)

    read_back = serialise.from_yaml(Index, index.render(built))

    assert read_back == built


def test_two_rebuilds_of_an_unchanged_passport_render_the_same_bytes() -> None:
    store = FakeStore()
    _log(store, SACT, "2026-03-12-110000", scope=LUNG)
    _log(store, CANNULATION, "2026-03-12-090000")
    _certify(store, "2025-11-04-sact-passport", SACT, CANNULATION)

    first = index.render(index.build(store, PASSPORT_ID, now=NOW))
    second = index.render(index.build(store, PASSPORT_ID, now=NOW))

    assert first == second

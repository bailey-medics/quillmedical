"""What the teaching lists say of each row, asked of listing.py itself."""

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.cbac.positions import set_clinical_lead
from app.features.teaching import media, storage
from app.features.teaching.access import BankOnShow, DelegatesInView
from app.features.teaching.listing import (
    delegate_rows,
    learning_module_rows,
    question_bank_rows,
)
from app.features.teaching.models import Assessment, QuestionBankConfig
from app.features.teaching.schemas import DelegateOut
from app.models import OrgUnit, Position, PositionHolding, User
from app.organisations import add_org_unit_member

BANK = "polyps"
OTHER_BANK = "bleeding"
NOBODY_HAS_THIS_ID = 987_654


def _organisation(db: Session, name: str = "Trust") -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.flush()

    return org


def _ward(db: Session, parent: OrgUnit, name: str = "Ward 9") -> OrgUnit:
    ward = OrgUnit(name=name, type="ward", parent_id=parent.id)
    db.add(ward)
    db.flush()

    return ward


def _person(db: Session, username: str, full_name: str | None = None) -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        full_name=full_name,
        password_hash="x",
        is_active=True,
        email_verified=True,
        base_profession="teaching_delegate",
    )
    db.add(user)
    db.flush()

    return user


def _attempt(
    db: Session,
    org: OrgUnit,
    user: User,
    *,
    passed: bool | None,
    days_ago: int,
    finished: bool = True,
    bank_id: str = BANK,
) -> datetime:
    """One attempt, and when it was made."""
    when = datetime.now(UTC) - timedelta(days=days_ago)
    db.add(
        Assessment(
            user_id=user.id,
            org_unit_id=org.id,
            question_bank_id=bank_id,
            bank_version=1,
            time_limit_minutes=60,
            total_items=3,
            is_passed=passed,
            started_at=when,
            completed_at=when if finished else None,
        )
    )
    db.flush()

    return when


def _view(
    org: OrgUnit, *people: User, places: tuple[OrgUnit, ...] = ()
) -> DelegatesInView:
    return DelegatesInView(
        organisation_ids=[org.id],
        place_ids={place.id for place in places},
        people_ids={person.id for person in people},
    )


def _one_row(
    db: Session, view: DelegatesInView, bank_id: str | None = None
) -> DelegateOut:
    rows = delegate_rows(db, view, bank_id=bank_id)
    assert len(rows) == 1

    return rows[0]


def _same_moment(found: datetime | None, expected: datetime) -> bool:
    """SQLite hands back a naive value where Postgres gives an aware one."""
    assert found is not None
    if found.tzinfo is None:
        found = found.replace(tzinfo=UTC)

    return found == expected


# --- delegate_rows: who gets a row ------------------------------------------


def test_with_nobody_in_view_there_are_no_rows(db_session: Session) -> None:
    org = _organisation(db_session)

    assert delegate_rows(db_session, _view(org), bank_id=None) == []


def test_an_id_no_account_has_gives_no_row(db_session: Session) -> None:
    view = DelegatesInView(
        organisation_ids=[_organisation(db_session).id],
        place_ids=set(),
        people_ids={NOBODY_HAS_THIS_ID},
    )

    assert delegate_rows(db_session, view, bank_id=None) == []


def test_somebody_with_no_attempt_is_listed_with_no_result(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    person = _person(db_session, "delegate")

    assert _one_row(db_session, _view(org, person)) == DelegateOut(
        id=person.id,
        name="delegate",
        email="delegate@example.com",
        site_name=None,
        clinical_lead=None,
        learning_completed=None,
        assessment_result=None,
        assessment_date=None,
        first_time_pass=False,
    )


def test_a_delegate_is_named_in_full_where_a_name_is_held(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    person = _person(db_session, "delegate", "Dee Legate")

    assert _one_row(db_session, _view(org, person)).name == "Dee Legate"


def test_everybody_in_view_gets_a_row(db_session: Session) -> None:
    org = _organisation(db_session)
    one = _person(db_session, "one")
    two = _person(db_session, "two")

    rows = delegate_rows(db_session, _view(org, one, two), bank_id=None)

    assert {row.id for row in rows} == {one.id, two.id}


# --- delegate_rows: the result ----------------------------------------------


def test_a_passed_attempt_is_a_pass_dated_when_it_was_finished(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    person = _person(db_session, "delegate")
    when = _attempt(db_session, org, person, passed=True, days_ago=2)

    row = _one_row(db_session, _view(org, person))

    assert row.assessment_result == "pass"
    assert _same_moment(row.assessment_date, when)
    assert row.first_time_pass is True


def test_a_failed_attempt_is_a_fail(db_session: Session) -> None:
    org = _organisation(db_session)
    person = _person(db_session, "delegate")
    _attempt(db_session, org, person, passed=False, days_ago=2)

    row = _one_row(db_session, _view(org, person))

    assert row.assessment_result == "fail"
    assert row.first_time_pass is False


def test_an_attempt_not_yet_finished_is_incomplete_and_undated(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    person = _person(db_session, "delegate")
    _attempt(db_session, org, person, passed=None, days_ago=2, finished=False)

    row = _one_row(db_session, _view(org, person))

    assert row.assessment_result == "incomplete"
    assert row.assessment_date is None
    assert row.first_time_pass is False


def test_a_finished_attempt_with_no_verdict_has_a_date_and_no_result(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    person = _person(db_session, "delegate")
    when = _attempt(db_session, org, person, passed=None, days_ago=2)

    row = _one_row(db_session, _view(org, person))

    assert row.assessment_result is None
    assert _same_moment(row.assessment_date, when)


def test_the_latest_attempt_is_the_one_reported(db_session: Session) -> None:
    org = _organisation(db_session)
    person = _person(db_session, "delegate")
    _attempt(db_session, org, person, passed=True, days_ago=9)
    _attempt(db_session, org, person, passed=False, days_ago=1)

    assert _one_row(db_session, _view(org, person)).assessment_result == (
        "fail"
    )


def test_a_pass_after_a_finished_attempt_is_not_a_first_time_pass(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    person = _person(db_session, "delegate")
    _attempt(db_session, org, person, passed=False, days_ago=9)
    _attempt(db_session, org, person, passed=True, days_ago=1)

    row = _one_row(db_session, _view(org, person))

    assert row.assessment_result == "pass"
    assert row.first_time_pass is False


def test_an_abandoned_attempt_does_not_cost_a_first_time_pass(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    person = _person(db_session, "delegate")
    _attempt(db_session, org, person, passed=None, days_ago=9, finished=False)
    _attempt(db_session, org, person, passed=True, days_ago=1)

    assert _one_row(db_session, _view(org, person)).first_time_pass is True


def test_an_attempt_at_another_organisation_is_not_read(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Elsewhere")
    person = _person(db_session, "delegate")
    _attempt(db_session, elsewhere, person, passed=True, days_ago=2)

    row = _one_row(db_session, _view(org, person))

    assert row.assessment_result is None
    assert row.first_time_pass is False


# --- delegate_rows: one module ----------------------------------------------


def test_every_modules_attempts_are_read_together_without_a_module(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    person = _person(db_session, "delegate")
    _attempt(db_session, org, person, passed=True, days_ago=9)
    _attempt(
        db_session, org, person, passed=False, days_ago=1, bank_id=OTHER_BANK
    )

    row = _one_row(db_session, _view(org, person))

    assert row.assessment_result == "fail"
    assert row.first_time_pass is False


def test_a_module_narrows_the_result_to_its_own_attempts(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    person = _person(db_session, "delegate")
    _attempt(db_session, org, person, passed=True, days_ago=9)
    _attempt(
        db_session, org, person, passed=False, days_ago=1, bank_id=OTHER_BANK
    )

    row = _one_row(db_session, _view(org, person), BANK)

    assert row.assessment_result == "pass"
    assert row.first_time_pass is True


def test_somebody_who_never_started_the_module_gets_no_row(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    sat_it = _person(db_session, "sat-it")
    sat_another = _person(db_session, "sat-another")
    _attempt(db_session, org, sat_it, passed=True, days_ago=2)
    _attempt(
        db_session,
        org,
        sat_another,
        passed=True,
        days_ago=2,
        bank_id=OTHER_BANK,
    )

    rows = delegate_rows(
        db_session, _view(org, sat_it, sat_another), bank_id=BANK
    )

    assert [row.id for row in rows] == [sat_it.id]


def test_somebody_who_started_the_module_and_stopped_gets_a_row(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    person = _person(db_session, "delegate")
    _attempt(db_session, org, person, passed=None, days_ago=2, finished=False)

    assert _one_row(
        db_session, _view(org, person), BANK
    ).assessment_result == ("incomplete")


def test_a_module_nobody_in_view_attempted_there_lists_nobody(
    db_session: Session,
) -> None:
    """A module the caller's organisations do not serve, for one."""
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Elsewhere")
    person = _person(db_session, "delegate")
    _attempt(db_session, elsewhere, person, passed=True, days_ago=2)

    assert delegate_rows(db_session, _view(org, person), bank_id=BANK) == []


# --- delegate_rows: the site and its clinical lead --------------------------


def test_a_delegate_is_shown_at_the_site_they_belong_to(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    ward = _ward(db_session, org)
    person = _person(db_session, "delegate")
    add_org_unit_member(db_session, ward.id, person.id, "trainee")

    row = _one_row(db_session, _view(org, person, places=(ward,)))

    assert row.site_name == "Ward 9"
    assert row.clinical_lead is None


def test_the_site_they_train_at_is_shown_before_one_they_staff(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    staffed = _ward(db_session, org, "Ward 1")
    trained = _ward(db_session, org, "Ward 2")
    person = _person(db_session, "delegate")
    add_org_unit_member(db_session, staffed.id, person.id, "staff")
    add_org_unit_member(db_session, trained.id, person.id, "trainee")

    row = _one_row(db_session, _view(org, person, places=(staffed, trained)))

    assert row.site_name == "Ward 2"


def test_of_two_sites_in_one_capacity_the_earlier_made_is_shown(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    first = _ward(db_session, org, "Ward 1")
    second = _ward(db_session, org, "Ward 2")
    person = _person(db_session, "delegate")
    add_org_unit_member(db_session, second.id, person.id, "staff")
    add_org_unit_member(db_session, first.id, person.id, "staff")

    row = _one_row(db_session, _view(org, person, places=(first, second)))

    assert row.site_name == "Ward 1"


def test_a_site_outside_the_callers_organisations_is_not_shown(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Elsewhere")
    their_ward = _ward(db_session, elsewhere, "Ward 3")
    lead = _person(db_session, "lead", "Their Lead")
    set_clinical_lead(db_session, their_ward, lead)
    person = _person(db_session, "delegate")
    add_org_unit_member(db_session, their_ward.id, person.id, "trainee")
    db_session.flush()

    row = _one_row(db_session, _view(org, person))

    assert row.site_name is None
    assert row.clinical_lead is None


def test_membership_of_the_organisation_itself_is_not_a_site(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    person = _person(db_session, "delegate")
    add_org_unit_member(db_session, org.id, person.id, "trainee")

    assert _one_row(db_session, _view(org, person)).site_name is None


def test_the_sites_clinical_lead_is_named_in_full(db_session: Session) -> None:
    org = _organisation(db_session)
    ward = _ward(db_session, org)
    lead = _person(db_session, "lead", "Lee Der")
    set_clinical_lead(db_session, ward, lead)
    person = _person(db_session, "delegate")
    add_org_unit_member(db_session, ward.id, person.id, "trainee")
    db_session.flush()

    row = _one_row(db_session, _view(org, person, places=(ward,)))

    assert row.clinical_lead == "Lee Der"


def test_a_clinical_lead_with_no_name_held_is_named_by_username(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    ward = _ward(db_session, org)
    set_clinical_lead(db_session, ward, _person(db_session, "lead"))
    person = _person(db_session, "delegate")
    add_org_unit_member(db_session, ward.id, person.id, "trainee")
    db_session.flush()

    row = _one_row(db_session, _view(org, person, places=(ward,)))

    assert row.clinical_lead == "lead"


def test_a_clinical_lead_whose_account_is_gone_is_not_named(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    ward = _ward(db_session, org)
    set_clinical_lead(db_session, ward, _person(db_session, "lead"))
    db_session.flush()
    post = db_session.query(Position).filter_by(org_unit_id=ward.id).one()
    db_session.query(PositionHolding).filter_by(position_id=post.id).update(
        {"user_id": NOBODY_HAS_THIS_ID}
    )
    person = _person(db_session, "delegate")
    add_org_unit_member(db_session, ward.id, person.id, "trainee")
    db_session.flush()

    row = _one_row(db_session, _view(org, person, places=(ward,)))

    assert row.site_name == "Ward 9"
    assert row.clinical_lead is None


# --- learning_module_rows: where the content is read from -------------------


def _no_bucket_no_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", None)
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", None
    )


def _bucket(
    monkeypatch: pytest.MonkeyPatch,
    described: dict[str, dict[str, object] | None],
    *,
    mdx: dict[str, str | None] | None = None,
    incomplete: tuple[str, ...] = (),
) -> list[tuple[int, str]]:
    """A bucket holding *described*, and each completeness question asked.

    A module named in *mdx* has learning content, which may be None for
    a file that is listed and cannot be read.
    """
    slides = mdx or {}
    asked: list[tuple[int, str]] = []

    def is_complete(db: Session, organisation_id: int, bank_id: str) -> bool:
        asked.append((organisation_id, bank_id))

        return bank_id not in incomplete

    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", "bucket")
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", "/not/read"
    )
    monkeypatch.setattr(
        storage, "list_banks_in_gcs", lambda b: list(described)
    )
    monkeypatch.setattr(
        storage, "download_module_yaml_from_gcs", lambda b, m: described[m]
    )
    monkeypatch.setattr(
        storage, "has_learning_content_gcs", lambda b, m: m in slides
    )
    monkeypatch.setattr(
        storage, "download_learning_mdx_from_gcs", lambda b, m: slides[m]
    )
    monkeypatch.setattr(media, "module_media_is_complete", is_complete)

    return asked


def _on_disk(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    bank_id: str = BANK,
    *,
    module_yaml: str | None = "title: On disk\norder: 4\n",
    slides: str | None = None,
) -> None:
    """One module in a content repository on disk, and no bucket."""
    module = tmp_path / "content-repo" / "modules" / bank_id
    assessment = module / "assessment"
    assessment.mkdir(parents=True)
    # discover_local_banks only sees a module whose assessment/ carries
    # assessment.yaml or config.yaml.
    (assessment / "config.yaml").write_text(
        f"id: {bank_id}\ntitle: Test\n", encoding="utf-8"
    )

    if module_yaml is not None:
        (module / "module.yaml").write_text(module_yaml, encoding="utf-8")

    if slides is not None:
        (module / "learning").mkdir()
        (module / "learning" / "content.mdx").write_text(
            slides, encoding="utf-8"
        )

    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", None)
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", str(tmp_path)
    )


def test_with_no_module_open_the_content_store_is_not_read(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    listed: list[str] = []

    def list_it(bucket: str) -> list[str]:
        listed.append(bucket)

        return [BANK]

    _bucket(monkeypatch, {BANK: {"title": "Polyps"}})
    monkeypatch.setattr(storage, "list_banks_in_gcs", list_it)

    assert learning_module_rows(db_session, {}) == []
    assert listed == []


def test_with_neither_a_bucket_nor_a_path_there_are_no_rows(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _no_bucket_no_path(monkeypatch)

    assert learning_module_rows(db_session, {BANK: 1}) == []


def test_a_bucket_that_cannot_be_listed_gives_no_rows(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    def refuse(bucket: str) -> list[str]:
        raise RuntimeError("the bucket is away")

    _bucket(monkeypatch, {BANK: {"title": "Polyps"}})
    monkeypatch.setattr(storage, "list_banks_in_gcs", refuse)

    assert learning_module_rows(db_session, {BANK: 1}) == []


# --- learning_module_rows: from the bucket ----------------------------------


def test_a_row_says_what_module_yaml_says(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bucket(
        monkeypatch,
        {
            BANK: {
                "moduleId": "polyps-2026",
                "title": "Polyps",
                "order": 3,
                "status": "live",
                "renewalMonths": 36,
                "description": "Sizing and describing polyps.",
            }
        },
        mdx={BANK: "## One\n\nFirst.\n\n## Two\n\nSecond."},
    )

    assert learning_module_rows(db_session, {BANK: 1}) == [
        {
            "module_id": "polyps-2026",
            "title": "Polyps",
            "order": 3,
            "status": "live",
            "renewal_months": 36,
            "has_learning": True,
            "slide_count": 2,
            "description": "Sizing and describing polyps.",
        }
    ]


def test_what_module_yaml_leaves_out_falls_back_to_the_module_id(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bucket(monkeypatch, {BANK: {"author": "somebody"}})

    assert learning_module_rows(db_session, {BANK: 1}) == [
        {
            "module_id": BANK,
            "title": BANK,
            "order": 0,
            "status": "draft",
            "renewal_months": None,
            "has_learning": False,
            "slide_count": 0,
            "description": None,
        }
    ]


def test_learning_content_that_cannot_be_read_counts_no_slides(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bucket(monkeypatch, {BANK: {"title": "Polyps"}}, mdx={BANK: None})

    (row,) = learning_module_rows(db_session, {BANK: 1})

    assert row["has_learning"] is True
    assert row["slide_count"] == 0


def test_a_module_in_the_bucket_that_is_not_open_gets_no_row(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    asked = _bucket(
        monkeypatch,
        {BANK: {"title": "Polyps"}, OTHER_BANK: {"title": "Bleeding"}},
    )

    rows = learning_module_rows(db_session, {BANK: 1})

    assert [row["module_id"] for row in rows] == [BANK]
    assert asked == [(1, BANK)]


def test_an_open_module_the_bucket_does_not_hold_gets_no_row(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bucket(monkeypatch, {BANK: {"title": "Polyps"}})

    rows = learning_module_rows(db_session, {BANK: 1, "not-in-bucket": 1})

    assert [row["module_id"] for row in rows] == [BANK]


def test_completeness_is_asked_of_the_organisation_that_opens_the_module(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    asked = _bucket(
        monkeypatch,
        {BANK: {"title": "Polyps"}, OTHER_BANK: {"title": "Bleeding"}},
    )

    learning_module_rows(db_session, {BANK: 7, OTHER_BANK: 8})

    assert asked == [(7, BANK), (8, OTHER_BANK)]


def test_a_module_missing_some_of_its_media_gets_no_row(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bucket(
        monkeypatch,
        {BANK: {"title": "Polyps"}, OTHER_BANK: {"title": "Bleeding"}},
        incomplete=(BANK,),
    )

    rows = learning_module_rows(db_session, {BANK: 1, OTHER_BANK: 1})

    assert [row["module_id"] for row in rows] == [OTHER_BANK]


@pytest.mark.parametrize("nothing", [None, {}])
def test_a_module_with_no_module_yaml_in_the_bucket_gets_no_row(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    nothing: dict[str, object] | None,
) -> None:
    _bucket(monkeypatch, {BANK: nothing})

    assert learning_module_rows(db_session, {BANK: 1}) == []


def test_rows_are_in_the_order_module_yaml_gives(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bucket(
        monkeypatch,
        {
            "last": {"order": 9},
            "first": {"order": 1},
            "unordered": {"title": "No order given"},
        },
    )

    rows = learning_module_rows(
        db_session, {"last": 1, "first": 1, "unordered": 1}
    )

    assert [row["module_id"] for row in rows] == ["unordered", "first", "last"]


# --- learning_module_rows: from disk ----------------------------------------


def test_a_module_on_disk_with_learning_content_counts_its_slides(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _on_disk(
        monkeypatch,
        tmp_path,
        slides="## One\n\nFirst.\n\n## Two\n\nSecond.\n\n## Three\n\nThird.",
    )

    assert learning_module_rows(db_session, {BANK: 1}) == [
        {
            "module_id": BANK,
            "title": "On disk",
            "order": 4,
            "status": "draft",
            "renewal_months": None,
            "has_learning": True,
            "slide_count": 3,
            "description": None,
        }
    ]


def test_a_module_on_disk_with_no_learning_content_counts_none(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _on_disk(monkeypatch, tmp_path)

    (row,) = learning_module_rows(db_session, {BANK: 1})

    assert row["has_learning"] is False
    assert row["slide_count"] == 0


@pytest.mark.parametrize("module_yaml", [None, ""])
def test_a_module_on_disk_with_no_module_yaml_gets_no_row(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    module_yaml: str | None,
) -> None:
    _on_disk(monkeypatch, tmp_path, module_yaml=module_yaml)

    assert learning_module_rows(db_session, {BANK: 1}) == []


def test_a_module_on_disk_that_is_not_open_gets_no_row(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _on_disk(monkeypatch, tmp_path)

    assert learning_module_rows(db_session, {OTHER_BANK: 1}) == []


def test_a_module_on_disk_missing_some_of_its_media_gets_no_row(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Asked of the real gate: a video nobody has uploaded."""
    _on_disk(
        monkeypatch,
        tmp_path,
        slides='## One\n\n<Video ref="lecture-01" />',
    )

    assert learning_module_rows(db_session, {BANK: 1}) == []


def test_a_module_whose_folder_cannot_be_found_gets_no_row(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Listed in the older flat layout, which has no module folder."""
    flat = tmp_path / BANK
    flat.mkdir()
    (flat / "config.yaml").write_text(f"id: {BANK}\n", encoding="utf-8")
    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", None)
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", str(tmp_path)
    )

    assert learning_module_rows(db_session, {BANK: 1}) == []


# --- question_bank_rows -----------------------------------------------------


def _synced(
    db: Session,
    org: OrgUnit,
    bank_id: str = BANK,
    *,
    version: int = 1,
    title: str = "Polyps",
    cover: str | None = None,
) -> QuestionBankConfig:
    """One version of a bank, synced into the organisation."""
    config = QuestionBankConfig(
        org_unit_id=org.id,
        question_bank_id=bank_id,
        version=version,
        title=title,
        description="A question bank.",
        type="uniform",
        cover_image_filename=cover,
        cover_image_focus="top" if cover else None,
        config_yaml={},
    )
    db.add(config)
    db.flush()

    return config


def _on_show(
    org: OrgUnit | None, *, version: int = 1, is_live: bool = True
) -> BankOnShow:
    return BankOnShow(
        version=version,
        is_live=is_live,
        organisation_id=org.id if org is not None else None,
    )


def _bank_store(
    monkeypatch: pytest.MonkeyPatch,
    *,
    bucket: str | None = None,
    base_path: str | None = "/content",
    incomplete: tuple[str, ...] = (),
    with_learning: tuple[str, ...] = (),
) -> tuple[list[tuple[int, str]], list[tuple[str, str]]]:
    """A content store, and each question asked of it.

    Returns:
        Each asking whether a bank's media is complete, as organisation
        and bank, and each asking whether a bank has learning pages, as
        content path and bank.
    """
    media_asked: list[tuple[int, str]] = []
    learning_asked: list[tuple[str, str]] = []

    def is_complete(db: Session, organisation_id: int, bank_id: str) -> bool:
        media_asked.append((organisation_id, bank_id))

        return bank_id not in incomplete

    def has_learning(path: str, bank_id: str) -> bool:
        learning_asked.append((path, bank_id))

        return bank_id in with_learning

    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", bucket)
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", base_path
    )
    monkeypatch.setattr(media, "module_media_is_complete", is_complete)
    monkeypatch.setattr(storage, "has_learning_content", has_learning)

    return media_asked, learning_asked


def test_with_no_bank_on_show_there_are_no_rows_and_nothing_is_asked(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _synced(db_session, _organisation(db_session))
    media_asked, learning_asked = _bank_store(monkeypatch)

    assert question_bank_rows(db_session, {}) == []
    assert media_asked == []
    assert learning_asked == []


def test_a_bank_row_says_what_the_promoted_version_says(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    config = _synced(db_session, org)
    _bank_store(monkeypatch, with_learning=(BANK,))

    assert question_bank_rows(db_session, {BANK: _on_show(org)}) == [
        {
            "id": config.id,
            "question_bank_id": BANK,
            "version": 1,
            "title": "Polyps",
            "description": "A question bank.",
            "type": "uniform",
            "synced_at": config.synced_at,
            "is_live": True,
            "has_learning": True,
            "cover_image_url": None,
            "cover_image_focus": None,
        }
    ]


def test_a_bank_closed_to_new_attempts_is_listed_and_said_to_be_closed(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _synced(db_session, org)
    _bank_store(monkeypatch)

    (row,) = question_bank_rows(
        db_session, {BANK: _on_show(org, is_live=False)}
    )

    assert row["is_live"] is False


def test_the_row_is_of_the_promoted_version_and_not_the_newest(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _synced(db_session, org, version=1, title="As promoted")
    _synced(db_session, org, version=2, title="Only synced")
    _bank_store(monkeypatch)

    (row,) = question_bank_rows(db_session, {BANK: _on_show(org, version=1)})

    assert (row["version"], row["title"]) == (1, "As promoted")


def test_completeness_is_asked_for_each_version_read_down_to_the_promoted_one(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Newest first, and not again for a version older than the promoted."""
    org = _organisation(db_session)
    _synced(db_session, org, version=1)
    _synced(db_session, org, version=2)
    _synced(db_session, org, version=3)
    media_asked, learning_asked = _bank_store(monkeypatch)

    question_bank_rows(db_session, {BANK: _on_show(org, version=2)})

    assert media_asked == [(org.id, BANK), (org.id, BANK)]
    assert learning_asked == [("/content", BANK)]


def test_a_bank_missing_some_of_its_media_gets_no_row(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _synced(db_session, org)
    _synced(db_session, org, OTHER_BANK, title="Bleeding")
    _bank_store(monkeypatch, incomplete=(BANK,))

    rows = question_bank_rows(
        db_session, {BANK: _on_show(org), OTHER_BANK: _on_show(org)}
    )

    assert [row["question_bank_id"] for row in rows] == [OTHER_BANK]


def test_a_bank_with_no_organisation_to_ask_about_its_media_gets_no_row(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _synced(db_session, _organisation(db_session))
    media_asked, _ = _bank_store(monkeypatch)

    assert question_bank_rows(db_session, {BANK: _on_show(None)}) == []
    assert media_asked == []


def test_a_promoted_version_that_was_never_synced_gets_no_row(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _synced(db_session, org, version=1)
    _bank_store(monkeypatch)

    assert (
        question_bank_rows(db_session, {BANK: _on_show(org, version=2)}) == []
    )


def test_a_bank_nobody_synced_at_all_gets_no_row(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _bank_store(monkeypatch)

    assert question_bank_rows(db_session, {BANK: _on_show(org)}) == []


def test_a_bank_synced_into_two_organisations_gets_one_row(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The copy read is not asked whose it is, and only one is read."""
    org = _organisation(db_session)
    educator = _organisation(db_session, "Educator")
    first = _synced(db_session, educator)
    second = _synced(db_session, org)
    _bank_store(monkeypatch)

    (row,) = question_bank_rows(db_session, {BANK: _on_show(org)})

    assert row["id"] in {first.id, second.id}


def test_a_bank_another_organisation_synced_is_listed_for_this_one(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Media is asked of the organisation on show, not the one that synced."""
    org = _organisation(db_session)
    educator = _organisation(db_session, "Educator")
    config = _synced(db_session, educator)
    media_asked, _ = _bank_store(monkeypatch)

    (row,) = question_bank_rows(db_session, {BANK: _on_show(org)})

    assert row["id"] == config.id
    assert media_asked == [(org.id, BANK)]


def test_bank_rows_are_in_bank_id_order(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _synced(db_session, org, "zebra", title="Zebra")
    _synced(db_session, org, "aardvark", title="Aardvark")
    _bank_store(monkeypatch)

    rows = question_bank_rows(
        db_session, {"zebra": _on_show(org), "aardvark": _on_show(org)}
    )

    assert [row["question_bank_id"] for row in rows] == ["aardvark", "zebra"]


def test_with_no_content_path_set_learning_is_asked_of_an_empty_one(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _synced(db_session, org)
    _, learning_asked = _bank_store(monkeypatch, base_path=None)

    (row,) = question_bank_rows(db_session, {BANK: _on_show(org)})

    assert learning_asked == [("", BANK)]
    assert row["has_learning"] is False


def test_a_cover_with_a_bucket_is_given_the_address_storage_signs(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _synced(db_session, org, cover="cover.jpg")
    _bank_store(monkeypatch, bucket="a-bucket")
    monkeypatch.setattr(
        storage,
        "get_cover_image_url_gcs",
        lambda bucket, bank_id, filename: (
            f"signed:{bucket}/{bank_id}/{filename}"
        ),
    )

    (row,) = question_bank_rows(db_session, {BANK: _on_show(org)})

    assert row["cover_image_url"] == f"signed:a-bucket/{BANK}/cover.jpg"
    assert row["cover_image_focus"] == "top"


def test_a_cover_with_no_bucket_is_given_the_local_address(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _synced(db_session, org, cover="cover.jpg")
    _bank_store(monkeypatch)
    monkeypatch.setattr(
        storage,
        "local_cover_image_url",
        lambda base_path, bank_id, filename: (
            f"local:{base_path}/{bank_id}/{filename}"
        ),
    )

    (row,) = question_bank_rows(db_session, {BANK: _on_show(org)})

    assert row["cover_image_url"] == f"local:/content/{BANK}/cover.jpg"


def test_a_bank_with_no_cover_has_no_address_and_none_is_asked_for(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    def refuse(*args: object) -> str:
        raise AssertionError("no cover to give an address for")

    org = _organisation(db_session)
    _synced(db_session, org)
    _bank_store(monkeypatch, bucket="a-bucket")
    monkeypatch.setattr(storage, "get_cover_image_url_gcs", refuse)

    (row,) = question_bank_rows(db_session, {BANK: _on_show(org)})

    assert row["cover_image_url"] is None

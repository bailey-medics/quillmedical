"""What the teaching lists say about each delegate and each module.

Who is listed is not decided here. ``app.features.teaching.access``
answers that, and hands its answer in: ``delegates_in_view`` for the
all-delegates view, ``modules_open_to`` for a learner's module list,
``banks_on_show_to`` for their list of question banks, and
``newest_copies_held_by`` and ``organisations_with_teaching_on`` for
the administrator's two lists.
These functions take that answer and build the rows, and refuse nobody.

They are apart from ``access`` because of what they read. A delegate's
row needs their attempts, their site and its clinical lead; a module's
row needs its ``module.yaml`` and its slides, from the bucket or from
disk. None of that is a question of who may see what.

The content store is reached through the ``storage``, ``media`` and
``mdx_parser`` modules by name, never by importing a function out of
them, so a test that replaces one of their functions replaces it here.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.positions import clinical_leads_of
from app.config import settings
from app.features.teaching import mdx_parser, media, storage
from app.features.teaching.access import BankOnShow, DelegatesInView
from app.features.teaching.models import (
    Assessment,
    QuestionBankConfig,
    QuestionBankItem,
    QuestionBankOrgStatus,
)
from app.features.teaching.module_content import module_is_servable
from app.features.teaching.schemas import (
    AdminBankOut,
    BankOrgRow,
    DelegateOut,
)
from app.models import OrgUnit, User, org_unit_member
from app.organisations import get_member_org_unit_ids

logger = logging.getLogger(__name__)


def delegate_rows(
    db: Session, view: DelegatesInView, *, bank_id: str | None
) -> list[DelegateOut]:
    """One row for each delegate in view, with their latest result.

    Only attempts made at the caller's organisations are read. Without
    *bank_id* every module's attempts are read together, so with two
    modules a delegate's latest attempt may be in either, and an attempt
    at one counts against a first-time pass in the other.

    With *bank_id*, only somebody who has started that module's
    assessment is listed, whether or not they finished it. Without it,
    everybody in view is listed, a result or none. A module the caller's
    organisations do not serve has no attempts there, so naming one
    lists nobody.

    The site and its clinical lead are looked up one person at a time:
    up to three queries for each person listed.

    Args:
        db: Core database session.
        view: What ``delegates_in_view`` gave for the caller.
        bank_id: The module to narrow to, or None for every module.

    Returns:
        The rows, in the order the database gives the people. Nobody,
        without asking the database, where nobody is in view.
    """
    if not view.people_ids:
        return []

    # Fetch user details. Every member of the caller's organisations is
    # listed: this used to exclude anyone whose rank said "admin" or
    # "superadmin", which was a display preference rather than a check -
    # the route is already gated by ``manage_teaching`` and scoped to the
    # caller's own organisations. It also read the column being retired,
    # and an administrator who is also a trainee is an ordinary case
    # rather than one worth hiding.
    people: dict[int, User] = {
        person.id: person
        for person in db.execute(
            select(User).where(User.id.in_(list(view.people_ids)))
        )
        .unique()
        .scalars()
        .all()
    }
    people_ids = list(people.keys())

    if not people_ids:
        return []

    # Get assessments for these users in caller's orgs
    assessments = (
        db.execute(
            select(Assessment)
            .where(
                Assessment.org_unit_id.in_(view.organisation_ids),
                Assessment.user_id.in_(people_ids),
                *(
                    [Assessment.question_bank_id == bank_id]
                    if bank_id is not None
                    else []
                ),
            )
            .order_by(Assessment.started_at.desc())
        )
        .scalars()
        .all()
    )
    latest_by_person: dict[int, Assessment] = {}
    all_by_person: dict[int, list[Assessment]] = {}

    for assessment in assessments:
        all_by_person.setdefault(assessment.user_id, []).append(assessment)
        if assessment.user_id not in latest_by_person:
            latest_by_person[assessment.user_id] = assessment

    # Get site and clinical lead info for each delegate
    site_and_lead = {
        person_id: _site_and_lead(db, person_id, view.place_ids)
        for person_id in people_ids
    }
    rows: list[DelegateOut] = []

    for person_id, person in people.items():
        latest = latest_by_person.get(person_id)

        # Asked about one module, the list is of who has attempted it.
        # Somebody who never started it is not a delegate of that module.
        if bank_id is not None and latest is None:
            continue

        # Determine assessment result
        result: str | None = None
        first_time_pass = False
        assessment_date: datetime | None = None

        if latest:
            if latest.is_passed is True:
                result = "pass"
            elif latest.is_passed is False:
                result = "fail"
            elif latest.completed_at is None:
                result = "incomplete"
            assessment_date = latest.completed_at

            # First time pass: passed on first attempt
            completed = [
                attempt
                for attempt in all_by_person.get(person_id, [])
                if attempt.completed_at is not None
            ]
            first_time_pass = latest.is_passed is True and len(completed) == 1

        site_name, lead_name = site_and_lead[person_id]

        rows.append(
            DelegateOut(
                id=person_id,
                name=person.full_name or person.username,
                email=person.email,
                site_name=site_name,
                clinical_lead=lead_name,
                learning_completed=None,
                assessment_result=result,
                assessment_date=assessment_date,
                first_time_pass=first_time_pass,
            )
        )

    return rows


def _site_and_lead(
    db: Session, person_id: int, place_ids: set[int]
) -> tuple[str | None, str | None]:
    """The site one person is shown at, and who leads it.

    Args:
        db: Core database session.
        person_id: The person.
        place_ids: The org_units beneath the caller's organisations. A
            membership anywhere else is not looked at.

    Returns:
        The site's name and its clinical lead's name, either of which
        may be None: no site among *place_ids*, a vacant post, or a post
        held by an account that is no longer there.
    """
    site_row = db.execute(
        select(OrgUnit.id, OrgUnit.name)
        .join(
            org_unit_member,
            org_unit_member.c.org_unit_id == OrgUnit.id,
        )
        .where(
            org_unit_member.c.user_id == person_id,
            OrgUnit.id.in_(place_ids),
        )
        # Where they are a trainee, if anywhere. Failing that, a site
        # they belong to in another capacity: an admin or a nurse who
        # sat the module is at a site as staff, and used to be shown
        # with no site and so no clinical lead.
        .order_by(
            (org_unit_member.c.capacity != "trainee"),
            OrgUnit.id,
        )
    ).first()
    site_id = site_row[0] if site_row else None
    site_name = site_row[1] if site_row else None

    # Whoever holds that site's clinical lead post. Keyed on the site's
    # id rather than its name: two organisations may each have a
    # "Ward 1", and matching on name named the wrong trust's lead.
    lead_name: str | None = None

    if site_id is not None:
        lead_id = clinical_leads_of(db, [int(site_id)]).get(int(site_id))
        if lead_id is not None:
            lead_row = db.execute(
                select(User.full_name, User.username).where(User.id == lead_id)
            ).first()
            if lead_row:
                lead_name = lead_row[0] or lead_row[1]

    return site_name, lead_name


def learning_module_rows(
    db: Session, opened_by: dict[str, int]
) -> list[dict[str, Any]]:
    """What a learner's module list says about each module open to them.

    Filtered rather than gated: without this filter the list named every
    module in the bucket, handing every user the full catalogue including
    modules their organisation was never given.

    The content is read from the bucket where one is configured, and
    otherwise from the content path on disk. A module is left out when
    its media is incomplete for the organisation that opens it, or when
    it has no ``module.yaml`` to describe it.

    The rows are plain values, not ``LearningModuleOut``: the list is
    put in order by what ``module.yaml`` says before the route's
    response model checks it, and building the model here would move
    that check ahead of the sort.

    Args:
        db: Core database session.
        opened_by: What ``modules_open_to`` gave: module id to the
            organisation that makes it visible.

    Returns:
        One row for each module, in the order ``module.yaml`` gives.
        Nothing, without reading the content store, where no module is
        open. Nothing where neither a bucket nor a content path is
        configured, or the bucket cannot be listed.
    """
    if not opened_by:
        return []

    bucket = settings.TEACHING_GCS_BUCKET
    base_path = settings.TEACHING_QUESTION_BANK_PATH

    if bucket:
        # Production: discover from GCS
        try:
            bank_ids = storage.list_banks_in_gcs(bucket)
        except Exception:
            return []
    elif base_path:
        bank_ids = storage.discover_local_banks(base_path)
    else:
        return []

    modules: list[dict[str, Any]] = []

    for bank_id in bank_ids:
        if bank_id not in opened_by:
            continue
        # Hidden, not shown disabled. A learner who can see a module
        # they cannot open raises a support question the admin cannot
        # answer from the learner's side.
        if not media.module_media_is_complete(db, opened_by[bank_id], bank_id):
            continue
        if bucket:
            meta = storage.download_module_yaml_from_gcs(bucket, bank_id) or {}
            if not meta:
                continue
            has_learning = storage.has_learning_content_gcs(bucket, bank_id)
            if has_learning:
                mdx = storage.download_learning_mdx_from_gcs(bucket, bank_id)
                slide_count = (
                    len(mdx_parser.parse_mdx_to_slides(mdx)) if mdx else 0
                )
            else:
                slide_count = 0
        else:
            module_dir = storage.resolve_module_dir(base_path or "", bank_id)
            if not module_dir:
                continue
            meta = mdx_parser.load_module_yaml(module_dir)
            if not meta:
                continue
            learning_path = module_dir / "learning" / "content.mdx"
            has_learning = learning_path.is_file()
            slide_count = (
                len(mdx_parser.load_learning_content(module_dir))
                if has_learning
                else 0
            )

        modules.append(
            {
                "module_id": meta.get("moduleId", bank_id),
                "title": meta.get("title", bank_id),
                "order": meta.get("order", 0),
                "status": meta.get("status", "draft"),
                "renewal_months": meta.get("renewalMonths"),
                "has_learning": has_learning,
                "slide_count": slide_count,
                "description": meta.get("description"),
            }
        )

    modules.sort(key=lambda m: m["order"])

    return modules


def question_bank_rows(
    db: Session, shown: dict[str, BankOnShow]
) -> list[dict[str, Any]]:
    """What a learner's list says about each question bank on show.

    One row for each bank, describing the version promoted for the
    learner and never a newer one that has only been synced. The synced
    copy read is whichever comes first for that bank and version: it is
    not asked whose copy it is, since the content may be owned by
    another (educator) organisation.

    A bank is left out when its media is incomplete for the
    organisation *shown* names for it, or when the promoted version has
    no synced copy. A bank closed to new attempts is listed, with
    ``is_live`` false.

    Whether the media is complete is asked once for each synced version
    read, newest first, until the promoted one is reached, and each
    asking reads the module's pages from the content store. So is
    whether the bank has learning pages, once for each row built.

    Args:
        db: Core database session.
        shown: What ``banks_on_show_to`` gave: bank id to how it stands.

    Returns:
        The fields of ``QuestionBankOut`` for each bank, as plain
        values, in bank id order. Nothing, without asking the database,
        where no bank is on show.
    """
    if not shown:
        return []

    # Fetch configs for visible banks (may be owned by a different org)
    configs = (
        db.execute(
            select(QuestionBankConfig)
            .where(QuestionBankConfig.question_bank_id.in_(list(shown)))
            .order_by(
                QuestionBankConfig.question_bank_id,
                QuestionBankConfig.version.desc(),
            )
        )
        .scalars()
        .all()
    )

    # Check which banks have learning content in the local repos
    base_path = settings.TEACHING_QUESTION_BANK_PATH or ""

    # De-duplicate by question_bank_id (user may be in multiple orgs
    # with the same bank configured)
    seen: set[str] = set()
    rows: list[dict[str, Any]] = []

    for config in configs:
        if config.question_bank_id in seen:
            continue

        on_show = shown[config.question_bank_id]

        # A module missing any of its media is not offered at all -
        # hidden rather than shown disabled, because a learner who can
        # see a module they cannot open raises a support question the
        # admin cannot answer from the learner's side.
        if not module_is_servable(
            db, on_show.organisation_id, config.question_bank_id
        ):
            continue
        # Only the promoted version, not whichever happens to be newest.
        if config.version != on_show.version:
            continue
        seen.add(config.question_bank_id)

        cover_image_url: str | None = None

        if config.cover_image_filename:
            bucket = settings.TEACHING_GCS_BUCKET
            if bucket:
                cover_image_url = storage.get_cover_image_url_gcs(
                    bucket,
                    config.question_bank_id,
                    config.cover_image_filename,
                )
            else:
                cover_image_url = storage.local_cover_image_url(
                    base_path,
                    config.question_bank_id,
                    config.cover_image_filename,
                )

        rows.append(
            {
                "id": config.id,
                "question_bank_id": config.question_bank_id,
                "version": config.version,
                "title": config.title,
                "description": config.description,
                "type": config.type,
                "synced_at": config.synced_at,
                "is_live": on_show.is_live,
                "has_learning": storage.has_learning_content(
                    base_path, config.question_bank_id
                ),
                "cover_image_url": cover_image_url,
                "cover_image_focus": config.cover_image_focus,
            }
        )

    return rows


def admin_bank_rows(
    db: Session, org_unit_id: int, held: dict[str, QuestionBankConfig]
) -> list[AdminBankOut]:
    """What an administrator's list says about each bank.

    One row for each bank the organisation holds a synced copy of, and
    one for each bank in the bucket, a bank that is both having one row.
    **The bucket is listed whole**: a bank the organisation has never
    synced is named by its id because it is there to be synced,
    whichever organisation it was written for. Such a row says nothing
    else of the bank: no title, no version and no items.

    A bucket that cannot be listed is logged and read as holding
    nothing, so the synced banks are still listed. With no bucket set,
    only they are: the content path on disk is not read.

    The items are counted with one query for each bank held, and are
    those of the newest version only.

    Args:
        db: Core database session.
        org_unit_id: The organisation the caller administers.
        held: What ``newest_copies_held_by`` gave for it.

    Returns:
        The rows, in bank id order.
    """
    # Count items per bank
    item_counts: dict[str, int] = {}

    for bank_id, copy in held.items():
        count = db.execute(
            select(QuestionBankItem.id).where(
                QuestionBankItem.org_unit_id == org_unit_id,
                QuestionBankItem.question_bank_id == bank_id,
                QuestionBankItem.bank_version == copy.version,
            )
        ).all()
        item_counts[bank_id] = len(count)

    # What this organisation actually serves, which is not necessarily the
    # newest imported. Showing both is the point: "version 3 active, version
    # 4 available" is the state an admin needs to notice.
    active_versions: dict[str, int | None] = {
        row.question_bank_id: row.active_version
        for row in db.execute(
            select(QuestionBankOrgStatus).where(
                QuestionBankOrgStatus.org_unit_id == org_unit_id,
            )
        )
        .scalars()
        .all()
    }

    # GCS banks
    gcs_bank_ids: set[str] = set()
    bucket = settings.TEACHING_GCS_BUCKET

    if bucket:
        try:
            gcs_bank_ids = set(storage.list_banks_in_gcs(bucket))
        except Exception:
            logger.exception("Failed to list GCS banks")

    # Merge
    all_bank_ids = set(held.keys()) | gcs_bank_ids
    rows: list[AdminBankOut] = []

    for bank_id in sorted(all_bank_ids):
        copy_held = held.get(bank_id)
        rows.append(
            AdminBankOut(
                bank_id=bank_id,
                title=copy_held.title if copy_held else None,
                version=copy_held.version if copy_held else None,
                active_version=active_versions.get(bank_id),
                type=copy_held.type if copy_held else None,
                synced_at=copy_held.synced_at if copy_held else None,
                in_gcs=bank_id in gcs_bank_ids,
                in_db=bank_id in held,
                item_count=item_counts.get(bank_id, 0),
            )
        )

    return rows


def media_org_unit_ids(db: Session, user: User, bank_id: str) -> set[int]:
    """The organisations whose videos of one module this user may manage.

    A video is stored once for each organisation holding the module's
    content. A superadmin manages every one of them; anybody else only
    those they belong to, so a teaching admin acts for their own.

    Args:
        db: Core database session.
        user: Who is asking.
        bank_id: The module.

    Returns:
        The org_unit ids, empty when the module is held nowhere the user
        may act.
    """
    holding = set(
        db.scalars(
            select(QuestionBankConfig.org_unit_id).where(
                QuestionBankConfig.question_bank_id == bank_id
            )
        ).all()
    )

    if user.platform_role == "superadmin":
        return holding

    return holding & set(get_member_org_unit_ids(db, user.id))


def bank_organisation_rows(
    db: Session,
    bank_id: str,
    organisations: list[OrgUnit],
    *,
    may_upload_videos_at: set[int] | None = None,
) -> list[BankOrgRow]:
    """How one bank stands at each of the organisations handed in.

    Whether it is open to new attempts there, and to site registration.
    An organisation with no status row for the bank is listed as closed
    to both. The bank is not looked up: an id nobody holds gives every
    organisation, each closed.

    Args:
        db: Core database session.
        bank_id: The question bank.
        organisations: What ``organisations_with_teaching_on`` gave.
        may_upload_videos_at: What ``media_org_unit_ids`` gave for the
            caller, so the page shows a video card for each of them.

    Returns:
        One row for each organisation, in the order they were given.
    """
    place_ids = [place.id for place in organisations]

    # Get bank status rows for these orgs
    statuses = {
        row.org_unit_id: row
        for row in db.execute(
            select(QuestionBankOrgStatus).where(
                QuestionBankOrgStatus.question_bank_id == bank_id,
                QuestionBankOrgStatus.org_unit_id.in_(place_ids),
            )
        )
        .scalars()
        .all()
    }
    upload_at = may_upload_videos_at or set()
    rows: list[BankOrgRow] = []

    for place in organisations:
        status = statuses.get(place.id)
        rows.append(
            BankOrgRow(
                org_unit_id=place.id,
                organisation_name=place.name,
                is_live=status.is_live if status else False,
                site_registration=(
                    status.site_registration if status else False
                ),
                may_upload_videos=place.id in upload_at,
            )
        )

    return rows

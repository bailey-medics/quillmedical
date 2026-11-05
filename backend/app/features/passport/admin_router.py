"""Syncing the frameworks by hand, for a Quill operator.

The framework pipeline starts the framework sync job when a framework
repository merges. When that step fails, as it would have during GitHub's
Actions outage on 4 November 2026, nothing else starts it, and the new
version waits until the next merge. This lets an operator start the job
from ``/admin/passport``. One run is enough to catch up: the job reads
every repository in ``FRAMEWORK_REPOSITORIES`` and stores every version
it lacks, and a second run changes nothing.

**The route starts the job and never syncs itself.** The job clones the
repositories as ``run-framework-sync`` and writes as the
``framework_sync`` database user, which may only add framework rows. The
web application can do neither, and holds only ``roles/run.invoker`` on
that one job: it starts it as configured, and cannot change what it reads.

**Operators only, and outside the passport feature gate.** Frameworks
belong to every organisation at once, so no organisation's admin may start
a sync, and an operator need not belong anywhere the passport is on.

See Phase 14 of
docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_core_db
from app.deps import DEP_REQUIRE_CSRF, DEP_REQUIRE_OPERATOR
from app.features.passport.models import PassportFrameworkSync
from app.rate_limit import limiter
from app.schemas.passport import (
    FrameworkSyncRunOut,
    FrameworkSyncStartedOut,
    FrameworkSyncStatusOut,
)

logger = logging.getLogger(__name__)

passport_admin_router = APIRouter(
    prefix="/passport/admin",
    tags=["passport"],
    dependencies=[DEP_REQUIRE_OPERATOR],
)

_DEP_SESSION = Depends(get_core_db)

#: Said where no job is set up: a developer's machine and the end-to-end
#: stack, which have no Cloud Run job to start.
NOT_SET_UP = "The framework sync is not set up here."


def _sync_job() -> str | None:
    """The job's full name, or None where none is set up."""
    from app.config import settings

    return settings.FRAMEWORK_SYNC_JOB


def _start(job: str) -> str:
    """Start one execution of *job*, as configured, and name it.

    No overrides: the web application may only start the job as it is,
    which is all ``roles/run.invoker`` allows.
    """
    from google.cloud import run_v2

    operation = run_v2.JobsClient().run_job(
        request=run_v2.RunJobRequest(name=job)
    )
    name: str = operation.operation.name

    return name


@passport_admin_router.get(
    "/framework-sync", response_model=FrameworkSyncStatusOut
)
def get_framework_sync(db: Session = _DEP_SESSION) -> FrameworkSyncStatusOut:
    """Whether the sync can be started here, and how its last run ended.

    A run in progress is not shown: it is one transaction, so its row
    appears only once it has finished.
    """
    newest = db.scalars(
        select(PassportFrameworkSync)
        .order_by(PassportFrameworkSync.id.desc())
        .limit(1)
    ).first()

    last_run = (
        FrameworkSyncRunOut.model_validate(newest, from_attributes=True)
        if newest is not None
        else None
    )

    return FrameworkSyncStatusOut(
        configured=_sync_job() is not None, last_run=last_run
    )


@passport_admin_router.post(
    "/framework-sync",
    response_model=FrameworkSyncStartedOut,
    dependencies=[DEP_REQUIRE_CSRF],
)
@limiter.limit("3/minute")
def start_framework_sync(request: Request) -> FrameworkSyncStartedOut:
    """Start the framework sync job, and answer once it has started.

    The run takes up to ten minutes, so the page reads how it ended from
    ``GET`` afterwards. Two runs never overlap: each waits for the other's
    lock (``sync._one_sync_at_a_time``), so pressing twice costs a second
    run that writes nothing.

    Raises:
        HTTPException: 503 where no job is set up, and 502 where the job
            could not be started.
    """
    job = _sync_job()

    if job is None:
        raise HTTPException(503, NOT_SET_UP)

    try:
        execution = _start(job)
    except Exception:
        # Every failure is the same to the operator: the job was not
        # started, and nothing changed. The traceback is logged.
        logger.exception("framework sync job could not be started")
        raise HTTPException(
            502,
            "The framework sync could not be started. Nothing has changed. "
            "Please try again.",
        ) from None

    logger.info("framework sync started execution=%s", execution)

    return FrameworkSyncStartedOut(execution=execution)

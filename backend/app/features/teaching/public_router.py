"""The teaching routes the registration page calls before anybody is
signed in: which modules can be chosen, and whether an email address
is a clinical lead's.

Open on purpose, so neither is on the teaching router, which puts every
route behind the teaching feature gate.

Moved out of ``main.py`` on 12 October 2026, as they were: the same
addresses and response models. ``main.py`` includes this router under
the API prefix.
"""

from fastapi import (
    APIRouter,
    Request,
)
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import (
    DEP_GET_SESSION,
)
from app.features.teaching.models import QuestionBankOrgStatus
from app.rate_limit import limiter
from app.schemas.auth import (
    TeachingModuleItem,
    TeachingModulesOut,
    ValidateClinicalLeadOut,
)
from app.schemas.limits import MAX_EMAIL
from app.users.register import (
    clinical_lead_site,
)

router = APIRouter()


@router.get("/teaching/public/modules", response_model=TeachingModulesOut)
def list_teaching_modules_public(
    db: Session = DEP_GET_SESSION,
) -> TeachingModulesOut:
    """List teaching modules available for registration.

    Public endpoint (no authentication required) that returns question
    banks where at least one organisation has site registration enabled.
    Used by the teaching registration page to populate the module selector.

    Returns:
        dict with key ``modules`` containing a list of
        ``{value, label}`` objects.
    """
    from app.features.teaching.models import (
        QuestionBankConfig,
    )

    registrable_bank_ids = (
        db.execute(
            select(QuestionBankOrgStatus.question_bank_id).where(
                QuestionBankOrgStatus.site_registration.is_(True)
            )
        )
        .scalars()
        .all()
    )

    if not registrable_bank_ids:
        return TeachingModulesOut(modules=[])

    # Newest version first, so the first row met for a bank is the one
    # everybody is served. Every version ever synced is kept, and each
    # organisation holds its own copy, so a bank has many rows here.
    configs = (
        db.execute(
            select(QuestionBankConfig)
            .where(
                QuestionBankConfig.question_bank_id.in_(registrable_bank_ids)
            )
            .order_by(QuestionBankConfig.version.desc())
        )
        .scalars()
        .all()
    )

    # One entry per bank, named by its newest version. This used to sort
    # the rows by title and keep the first, which named a bank by
    # whichever of its titles came first in the alphabet: a module
    # retitled "… Test" in a later version went on showing the old name,
    # the same as the module it had been renamed apart from.
    seen: set[str] = set()
    modules: list[TeachingModuleItem] = []

    for c in configs:
        if c.question_bank_id not in seen:
            seen.add(c.question_bank_id)
            modules.append(
                TeachingModuleItem(value=c.question_bank_id, label=c.title)
            )

    return TeachingModulesOut(modules=sorted(modules, key=lambda m: m.label))


class ValidateClinicalLeadIn(BaseModel):
    """Request body for clinical lead validation."""

    email: str = Field(max_length=MAX_EMAIL)
    bank_id: str

    model_config = {"extra": "forbid"}


@router.post(
    "/teaching/public/validate-clinical-lead",
    response_model=ValidateClinicalLeadOut,
)
@limiter.limit("10/minute")
def validate_clinical_lead(
    request: Request,
    payload: ValidateClinicalLeadIn,
    db: Session = DEP_GET_SESSION,
) -> ValidateClinicalLeadOut:
    """Validate that an email belongs to a clinical lead for a bank.

    Public endpoint used during registration. Checks whether the given
    email belongs to a user who is a clinical_lead at a site linked to
    an organisation that has the specified bank enabled for registration.

    Returns:
        dict with ``valid`` (bool) and ``site_name`` (str | None).
    """
    return clinical_lead_site(db, payload.email, payload.bank_id)

"""A route that exists only to rehearse the alert watcher.

The alert watcher on the home box investigates App production alerts and
opens a pull request for each fault in the code; see the watcher phase of
docs/docs/plans/2026-10-19-remote-dev-machine-plan.md. Its rehearsal needs
a real fault on `main` that nobody but an operator can reach, so that the
pull request's new test can fail on `main` as the skill requires. This
route is that fault's home. Remove it once the rehearsal is done.

Example:
    GET /api/operator/rehearsal/average?values=1,2,3
"""

from fastapi import APIRouter, Query

from app.deps import DEP_REQUIRE_OPERATOR
from app.models import User
from app.schemas.alert_rehearsal import AverageOut

router = APIRouter(prefix="/operator/rehearsal", tags=["operator-rehearsal"])


@router.get("/average", response_model=AverageOut)
def average(
    values: str = Query("", max_length=200, pattern=r"^[0-9.,\s-]*$"),
    _u: User = DEP_REQUIRE_OPERATOR,
) -> AverageOut:
    """Work out the mean of comma-separated numbers.

    Requires platform operator access.

    Args:
        values: Numbers separated by commas, such as ``1,2,3``.

    Returns:
        AverageOut: How many numbers there were, and their mean.

    Raises:
        HTTPException: 401 if not authenticated.
        HTTPException: 403 if the caller is not a platform operator.
    """
    numbers = [float(part) for part in values.split(",") if part.strip()]

    return AverageOut(count=len(numbers), mean=sum(numbers) / len(numbers))

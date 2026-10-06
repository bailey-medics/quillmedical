"""Serve a guide's screenshot to somebody who is signed in.

The guides at ``/guides`` show screenshots of the application. The
pictures of a guide anybody may read, such as how to join a course, are
in a public bucket that the load balancer serves. The rest show what an
admin's or an operator's screens look like, so they are kept in a
private bucket and handed out here, to a reader with a session. See
``docs/docs/plans/2026-10-05-in-app-guides-plan.md``.

Being signed in is the whole check. Which guides a reader is *shown* is
decided in the browser, for relevance; this route keeps the pictures
from the public, and does not try to keep one member of staff's guide
from another.
"""

import logging
import re

from fastapi import APIRouter, HTTPException, Response
from google.api_core.exceptions import GoogleAPIError, NotFound

from app.config import settings
from app.deps import DEP_CURRENT_USER
from app.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/guides", tags=["guides"])

#: A guide's slug and a picture's name, as the guides write them: lower
#: case words joined by hyphens. Nothing else is looked up, so a request
#: cannot name an object outside ``<guide>/<name>.png``.
_PART = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

_NOT_FOUND = "That picture is not here"


def read_guide_asset(bucket_name: str, key: str) -> bytes | None:
    """Read one picture from the private bucket.

    Args:
        bucket_name: The bucket the signed-in guides' pictures are in.
        key: The object's name, ``<guide>/<name>.png``.

    Returns:
        The picture's bytes, or None when the bucket holds no such
        object.

    Raises:
        GoogleAPIError: If the bucket could not be read at all.
    """
    from google.cloud import storage  # type: ignore[attr-defined]

    blob = storage.Client().bucket(bucket_name).blob(key)
    try:
        data: bytes = blob.download_as_bytes()
    except NotFound:
        return None
    return data


# api-schema-check: allow-opaque-permanent
@router.get("/assets/{guide}/{name}.png")
def guide_asset(
    guide: str,
    name: str,
    current_user: User = DEP_CURRENT_USER,
) -> Response:
    """Return one screenshot of a guide that is read signed in.

    Args:
        guide: The guide's slug.
        name: The picture's name, without its ``.png``.
        current_user: Whoever is signed in. Nobody else is answered.

    Returns:
        The picture.

    Raises:
        HTTPException: 404 if the address is not a picture's, if no
            bucket is configured, or if the bucket holds no such
            picture; 502 if the bucket could not be read.
    """
    if not _PART.fullmatch(guide) or not _PART.fullmatch(name):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)

    # No bucket in development or in the test stack: the guides show each
    # picture's description in its place, as they do for any that is
    # missing.
    bucket_name = settings.GUIDE_ASSETS_GCS_BUCKET
    if not bucket_name:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)

    try:
        data = read_guide_asset(bucket_name, f"{guide}/{name}.png")
    except GoogleAPIError as error:
        logger.error(
            "Guide picture %s/%s could not be read: %s",
            guide,
            name,
            type(error).__name__,
        )
        raise HTTPException(
            status_code=502, detail="That picture could not be loaded"
        ) from error

    if data is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)

    return Response(
        content=data,
        media_type="image/png",
        # Private, so no shared cache keeps a copy for somebody without a
        # session. Five minutes, as the public pictures are cached: a
        # retaken screenshot keeps its name.
        headers={"Cache-Control": "private, max-age=300"},
    )

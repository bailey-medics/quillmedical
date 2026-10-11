"""The routes that serve teaching media straight off disk, for local use.

Where there is a bucket, images and video are served from it through
signed addresses and none of this is mounted. Where there is only a
folder of teaching repositories, on a developer's machine and in the
end-to-end stack, these four routes stand in for the bucket so the
frontend runs the same code either way.

They are mounted by a function, not written at module level, so a test
can mount them on an app of its own over a folder it made. Written
straight into ``main.py`` behind a setting, they were out of reach of
every test: the setting is never on in the test container.
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from starlette.responses import FileResponse


def mount_local_media_routes(app: FastAPI, base_path: str) -> None:
    """Add the four local media routes to ``app``, reading ``base_path``.

    ``base_path`` is the folder holding the teaching repositories, one
    folder each. Every route refuses a path part holding ``..`` or a
    slash, and a file type not on its own short list, before it looks at
    the disk.
    """

    # api-schema-check: allow-opaque-permanent
    @app.get(
        "/api/teaching/images/modules/{bank_id}"
        "/assessment/{item_folder}/{filename}"
    )
    async def _serve_teaching_image(
        bank_id: str,
        item_folder: str,
        filename: str,
    ) -> FileResponse:
        """Serve question bank images from local teaching-repos."""
        from app.features.teaching.storage import (
            local_media_response,
            resolve_local_bank,
        )

        _ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

        # Validate path components
        for part in (bank_id, item_folder, filename):
            if ".." in part or "/" in part:
                raise HTTPException(400, "Invalid path")

                # Restrict to allowed image extensions
        ext = Path(filename).suffix.lower()

        if ext not in _ALLOWED_IMAGE_EXTENSIONS:
            raise HTTPException(400, "Invalid file type")

        bank_dir = resolve_local_bank(base_path, bank_id)

        if not bank_dir:
            raise HTTPException(404, "Bank not found")

        file_path = bank_dir / item_folder / filename

        if not file_path.is_file():
            raise HTTPException(404, "Image not found")

        return local_media_response(file_path)

    # api-schema-check: allow-opaque-permanent
    @app.get("/api/teaching/images/cover/{module_id}/{filename}")
    async def _serve_cover_image(
        module_id: str,
        filename: str,
    ) -> FileResponse:
        """Serve module cover images from local teaching-repos."""
        from app.features.teaching.storage import (
            local_media_response,
            resolve_module_dir,
        )

        _ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

        # Validate path components
        for part in (module_id, filename):
            if ".." in part or "/" in part:
                raise HTTPException(400, "Invalid path")

                # Restrict to allowed image extensions
        ext = Path(filename).suffix.lower()

        if ext not in _ALLOWED_IMAGE_EXTENSIONS:
            raise HTTPException(400, "Invalid file type")

        module_dir = resolve_module_dir(base_path, module_id)

        if not module_dir:
            raise HTTPException(404, "Module not found")

        file_path = module_dir / filename

        if not file_path.is_file():
            raise HTTPException(404, "Image not found")

        return local_media_response(file_path)

    # api-schema-check: allow-opaque-permanent
    @app.get("/api/teaching/images/learning/{module_id}/{filename}")
    async def _serve_learning_image(
        module_id: str,
        filename: str,
    ) -> FileResponse:
        """Serve learning content images from local teaching-repos."""
        from app.features.teaching.storage import (
            local_media_response,
            resolve_module_dir,
        )

        _ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

        # Validate path components
        for part in (module_id, filename):
            if ".." in part or "/" in part:
                raise HTTPException(400, "Invalid path")

                # Restrict to allowed image extensions
        ext = Path(filename).suffix.lower()

        if ext not in _ALLOWED_IMAGE_EXTENSIONS:
            raise HTTPException(400, "Invalid file type")

        module_dir = resolve_module_dir(base_path, module_id)

        if not module_dir:
            raise HTTPException(404, "Module not found")

        file_path = module_dir / "learning" / "images" / filename

        if not file_path.is_file():
            raise HTTPException(404, "Image not found")

        return local_media_response(file_path)

    # api-schema-check: allow-opaque-permanent
    @app.get("/api/teaching/videos/{module_id}/{filename}")
    async def _serve_learning_video(
        module_id: str,
        filename: str,
    ) -> FileResponse:
        """Serve learning video from local teaching-repos.

        The development counterpart to Cloud CDN. There is no bucket,
        no signature and no cookie here - the video access endpoint
        returns a base URL pointing at this route and sets no cookie,
        so the frontend runs the same code path in both environments.

        This proves the parser, the content model and the player. It
        proves nothing whatever about the authorisation gate, which
        only exists in front of the real CDN.

        Video sits directly in ``learning/``, one level above the
        ``images/`` subdirectory the route above reads, because that is
        where an author writes it alongside ``content.mdx``.

        Starlette's ``FileResponse`` honours ``Range``, so seeking works
        locally without anything further.
        """
        from app.features.teaching.storage import (
            local_media_response,
            resolve_module_dir,
        )

        # Deliberately separate from the image allow-list rather than a
        # widened copy of it: an image route that will serve .mp4 is a
        # route that will serve whatever the next edit forgets about.
        _ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".jpg", ".webp", ".vtt"}

        # Validate path components
        for part in (module_id, filename):
            if ".." in part or "/" in part:
                raise HTTPException(400, "Invalid path")

        ext = Path(filename).suffix.lower()

        if ext not in _ALLOWED_VIDEO_EXTENSIONS:
            raise HTTPException(400, "Invalid file type")

        module_dir = resolve_module_dir(base_path, module_id)

        if not module_dir:
            # A developer with no content repo cloned has no
            # teaching-repos directory at all, which is the normal
            # starting state - so this is a 404, not a crash.
            raise HTTPException(404, "Module not found")

        file_path = module_dir / "learning" / filename

        if not file_path.is_file():
            raise HTTPException(404, "Video not found")

        return local_media_response(file_path)

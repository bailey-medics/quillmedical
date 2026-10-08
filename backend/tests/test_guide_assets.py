"""A signed-in guide's pictures are served to somebody signed in, only.

The pictures of a guide that is read signed in show what an admin's
screens look like, so they are in a private bucket and reach a browser
through ``GET /api/guides/assets/{guide}/{name}.png``.
"""

import pytest
from fastapi.testclient import TestClient
from google.api_core.exceptions import ServiceUnavailable

from app.config import settings
from app.guides import router as guides

PNG = b"\x89PNG\r\n\x1a\n-not-really-a-picture"
URL = "/api/guides/assets/add-a-delegate-by-hand/users.png"


@pytest.fixture
def bucket(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    """A configured bucket holding one picture; records what is read."""
    reads: list[tuple[str, str]] = []

    def _read(bucket_name: str, key: str) -> bytes | None:
        reads.append((bucket_name, key))

        return PNG if key == "add-a-delegate-by-hand/users.png" else None

    monkeypatch.setattr(settings, "GUIDE_ASSETS_GCS_BUCKET", "the-bucket")
    monkeypatch.setattr(guides, "read_guide_asset", _read)

    return reads


class TestWhoIsAnswered:
    def test_somebody_not_signed_in_is_refused(
        self, test_client: TestClient, bucket: list[tuple[str, str]]
    ) -> None:
        response = test_client.get(URL)

        assert response.status_code == 401
        assert bucket == []

    def test_somebody_signed_in_is_given_the_picture(
        self, authenticated_client: TestClient, bucket: list[tuple[str, str]]
    ) -> None:
        response = authenticated_client.get(URL)

        assert response.status_code == 200
        assert response.content == PNG
        assert response.headers["content-type"] == "image/png"


class TestWhatIsRead:
    def test_the_picture_is_read_from_the_guides_own_folder(
        self, authenticated_client: TestClient, bucket: list[tuple[str, str]]
    ) -> None:
        authenticated_client.get(URL)

        assert bucket == [("the-bucket", "add-a-delegate-by-hand/users.png")]

    def test_no_shared_cache_may_keep_it(
        self, authenticated_client: TestClient, bucket: list[tuple[str, str]]
    ) -> None:
        response = authenticated_client.get(URL)

        assert response.headers["cache-control"] == "private, max-age=300"

    def test_a_picture_the_bucket_does_not_hold_is_a_404(
        self, authenticated_client: TestClient, bucket: list[tuple[str, str]]
    ) -> None:
        response = authenticated_client.get(
            "/api/guides/assets/add-a-delegate-by-hand/no-such.png"
        )

        assert response.status_code == 404

    @pytest.mark.parametrize(
        "path",
        [
            "/api/guides/assets/Add-A-Delegate/users.png",
            "/api/guides/assets/add-a-delegate/Users.png",
            "/api/guides/assets/add_a_delegate/users.png",
            "/api/guides/assets/add-a-delegate/users.name.png",
            "/api/guides/assets/..%2F/users.png",
            "/api/guides/assets/add-a-delegate/..%2F..%2F.png",
            "/api/guides/assets/-leading/users.png",
        ],
    )
    def test_an_address_that_is_not_a_pictures_reads_nothing(
        self,
        authenticated_client: TestClient,
        bucket: list[tuple[str, str]],
        path: str,
    ) -> None:
        response = authenticated_client.get(path)

        assert response.status_code == 404
        assert bucket == []


class TestWhenThereIsNothingToServe:
    def test_no_bucket_configured_is_a_404(
        self,
        authenticated_client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Development and the test stack have none; the guides then
        show the picture's description in its place."""
        monkeypatch.setattr(settings, "GUIDE_ASSETS_GCS_BUCKET", None)

        assert authenticated_client.get(URL).status_code == 404

    def test_a_bucket_that_cannot_be_read_is_a_502(
        self,
        authenticated_client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def _explode(_bucket: str, _key: str) -> bytes | None:
            raise ServiceUnavailable("storage is down")

        monkeypatch.setattr(settings, "GUIDE_ASSETS_GCS_BUCKET", "the-bucket")
        monkeypatch.setattr(guides, "read_guide_asset", _explode)

        response = authenticated_client.get(URL)

        assert response.status_code == 502
        assert "storage" not in response.text

"""Tests for the routes that serve teaching media off disk.

Each test mounts the routes on an app of its own, over a folder of
teaching repositories built for it, so they run everywhere. The routes
take no login: on a developer's machine and in the end-to-end stack
they stand where the bucket stands elsewhere. What keeps them safe is
that they serve only files of a few types from inside one module's
folder, so that is what is tested, with a real file on each side of
the line.
"""

from pathlib import Path
from urllib.parse import quote

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.features.teaching.local_media import mount_local_media_routes

SECRET = b"not for serving"


@pytest.fixture
def repos(tmp_path: Path) -> Path:
    """A folder of teaching repositories holding one module.

    Beside the files the routes may serve it holds ones they must not:
    a video above the folder of repositories, one in another folder of
    the same module, and files of types no route lists.
    """
    base = tmp_path / "teaching-repos"
    module = base / "content" / "modules" / "module-1"
    learning = module / "learning"
    item = module / "assessment" / "item-1"

    for folder in (learning / "images", item):
        folder.mkdir(parents=True)

    (module / "module.yaml").write_text("id: module-1\n")
    (module / "cover.png").write_bytes(b"cover")
    (module / "assessment" / "assessment.yaml").write_text("items: []\n")
    (item / "scan.png").write_bytes(b"scan")
    (item / "answer.yaml").write_bytes(SECRET)
    (learning / "lecture.mp4").write_bytes(b"lecture")
    (learning / "lecture.vtt").write_bytes(b"captions")
    (learning / "content.mdx").write_bytes(SECRET)
    (learning / "images" / "slide.png").write_bytes(b"slide")
    (tmp_path / "outside.mp4").write_bytes(SECRET)

    return base


@pytest.fixture
def client(repos: Path) -> TestClient:
    app = FastAPI()
    mount_local_media_routes(app, str(repos))

    return TestClient(app)


def _address(*parts: str) -> str:
    """An address under ``/api/teaching`` with every part quoted.

    Built from parts and quoted here, and not written as a literal with
    the escapes in it: an escaped path in source reads as nonsense words
    to the spelling check, and hides what is being attempted from
    anybody reading the test.
    """
    return "/api/teaching/" + "/".join(quote(part, safe="") for part in parts)


class TestMounting:
    def test_mounts_the_four_routes(self) -> None:
        """A floor, so a route dropped in a later edit is noticed."""
        app = FastAPI()
        before = len(app.routes)

        mount_local_media_routes(app, "/nowhere")

        assert len(app.routes) - before == 4


class TestVideoRoute:
    @pytest.mark.parametrize(
        "filename,body",
        [("lecture.mp4", b"lecture"), ("lecture.vtt", b"captions")],
    )
    def test_serves_a_file_from_the_learning_folder(
        self, client: TestClient, filename: str, body: bytes
    ) -> None:
        resp = client.get(_address("videos", "module-1", filename))

        assert resp.status_code == 200
        assert resp.content == body
        assert resp.headers["cache-control"] == "no-cache"

    @pytest.mark.parametrize(
        "filename",
        ["evil.sh", "script.py", "notes.txt", "archive.zip", "a.mp4.exe"],
    )
    def test_rejects_disallowed_extensions(
        self, client: TestClient, filename: str
    ) -> None:
        """The allow-list is deliberately separate from the image one.

        A route that will serve ``.mp4`` alongside images is a route
        that will serve whatever the next allow-list edit forgets.
        """
        resp = client.get(_address("videos", "module-1", filename))

        assert resp.status_code == 400

    def test_refuses_a_file_that_is_there_but_of_the_wrong_type(
        self, client: TestClient
    ) -> None:
        """``content.mdx`` sits beside the video and is not served."""
        resp = client.get(_address("videos", "module-1", "content.mdx"))

        assert resp.status_code == 400
        assert SECRET not in resp.content

    @pytest.mark.parametrize(
        "module_id,filename",
        [
            ("module-1", "../../etc/passwd"),
            ("../secret", "lecture.mp4"),
            ("module-1", "../lecture.mp4"),
            ("module-1", "../../../../outside.mp4"),
            ("..", "outside.mp4"),
        ],
    )
    def test_refuses_traversal(
        self, client: TestClient, module_id: str, filename: str
    ) -> None:
        resp = client.get(_address("videos", module_id, filename))

        assert resp.status_code in (400, 404)
        assert SECRET not in resp.content

    def test_two_dots_anywhere_in_a_part_are_refused(
        self, client: TestClient
    ) -> None:
        """Refused by the route's own check, not left to the router.

        A name holding two dots and no slash reaches the route as one
        part, so this is the route saying no and not a path that failed
        to match.
        """
        resp = client.get(_address("videos", "module-1", "..lecture.mp4"))

        assert resp.status_code == 400
        assert resp.json() == {"detail": "Invalid path"}

    def test_unknown_module_is_404(self, client: TestClient) -> None:
        resp = client.get(_address("videos", "no-such-module", "lecture.mp4"))

        assert resp.status_code == 404

    def test_no_folder_of_repositories_is_404(self) -> None:
        """A developer with no content repo cloned gets a 404.

        That is the normal starting state, so it must not be a crash.
        """
        app = FastAPI()
        mount_local_media_routes(app, "/no/such/folder")

        resp = TestClient(app).get(
            _address("videos", "module-1", "lecture.mp4")
        )

        assert resp.status_code == 404

    @pytest.mark.parametrize("ext", [".mp4", ".jpg", ".webp", ".vtt"])
    def test_allowed_extensions_reach_the_filesystem(
        self, client: TestClient, ext: str
    ) -> None:
        """Reaching a 404 proves the extension passed the allow-list.

        A 400 would mean the allow-list rejected it before ever looking
        for the file.
        """
        resp = client.get(_address("videos", "module-1", f"missing{ext}"))

        assert resp.status_code == 404


class TestImageRoutes:
    """The three image routes: a question's, a module's cover, a slide."""

    @pytest.mark.parametrize(
        "parts,body",
        [
            (
                (
                    "images",
                    "modules",
                    "module-1",
                    "assessment",
                    "item-1",
                    "scan.png",
                ),
                b"scan",
            ),
            (("images", "cover", "module-1", "cover.png"), b"cover"),
            (("images", "learning", "module-1", "slide.png"), b"slide"),
        ],
    )
    def test_serves_an_image(
        self, client: TestClient, parts: tuple[str, ...], body: bytes
    ) -> None:
        resp = client.get(_address(*parts))

        assert resp.status_code == 200
        assert resp.content == body

    @pytest.mark.parametrize(
        "parts",
        [
            # The answers to a question, beside its image.
            (
                "images",
                "modules",
                "module-1",
                "assessment",
                "item-1",
                "answer.yaml",
            ),
            # The module's own description, beside its cover.
            ("images", "cover", "module-1", "module.yaml"),
            # A video is not an image, whichever route is asked.
            ("images", "learning", "module-1", "lecture.mp4"),
            ("images", "cover", "module-1", "lecture.mp4"),
        ],
    )
    def test_refuses_a_file_that_is_not_an_image(
        self, client: TestClient, parts: tuple[str, ...]
    ) -> None:
        resp = client.get(_address(*parts))

        assert resp.status_code == 400
        assert SECRET not in resp.content

    @pytest.mark.parametrize(
        "parts",
        [
            ("images", "cover", "module-1", "..cover.png"),
            ("images", "cover", "..", "cover.png"),
            ("images", "learning", "module-1", "..slide.png"),
            (
                "images",
                "modules",
                "module-1",
                "assessment",
                "..",
                "cover.png",
            ),
            (
                "images",
                "modules",
                "..",
                "assessment",
                "item-1",
                "scan.png",
            ),
        ],
    )
    def test_two_dots_in_any_part_are_refused(
        self, client: TestClient, parts: tuple[str, ...]
    ) -> None:
        resp = client.get(_address(*parts))

        assert resp.status_code in (400, 404)
        assert resp.content not in (b"cover", b"scan", b"slide")

    @pytest.mark.parametrize(
        "parts",
        [
            ("images", "cover", "module-1", "../module-1/cover.png"),
            ("images", "learning", "module-1", "../../cover.png"),
        ],
    )
    def test_a_slash_in_a_part_is_refused(
        self, client: TestClient, parts: tuple[str, ...]
    ) -> None:
        resp = client.get(_address(*parts))

        assert resp.status_code in (400, 404)
        assert resp.content != b"cover"

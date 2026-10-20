"""Tests for the upload scan CLI script (Cloud Run Job).

ClamAV itself is never run here: it lives in its own image. What is
tested is everything around it: how each exit code becomes a verdict,
what the report carries, and that the job never fails silently.
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import google.cloud as _gc
import pytest

AUDIENCE = "https://quill-backend-test.run.app"

BASE_ENV = {
    "SCAN_BUCKET": "passports-bucket",
    "SCAN_OBJECT": "ab/cd/one/files/sha256/ab/cd/abcd1234",
}

VERSION_LINE = "ClamAV 1.0.7/27460/Tue Oct 14 08:00:00 2026"


def _patch_storage(storage_module: MagicMock):
    """Make ``from google.cloud import storage`` resolve to a mock.

    Both the ``sys.modules`` entry and the attribute on the parent
    package, as the caption tests do, because once ``google.cloud`` has
    been imported that import form reads the attribute.
    """
    return (
        patch.dict("sys.modules", {"google.cloud.storage": storage_module}),
        patch.object(_gc, "storage", storage_module, create=True),
    )


def _stub_urlopen(status: int = 200, side_effect=None):
    """Patch `urlopen` and expose the Request it was handed."""
    captured: dict[str, object] = {}

    def _fake(request, timeout=None):  # noqa: ANN001
        captured["url"] = request.full_url
        captured["headers"] = {k.lower(): v for k, v in request.header_items()}
        captured["json"] = json.loads(request.data.decode())

        if side_effect is not None:
            raise side_effect

        response = MagicMock()
        response.status = status
        response.__enter__ = lambda s: s
        response.__exit__ = lambda *a: False

        return response

    return patch("urllib.request.urlopen", side_effect=_fake), captured


def _clam(
    *,
    scan_code: int = 0,
    scan_stdout: str = "",
    scan_stderr: str = "",
):
    """A stand-in for `subprocess.run` that plays ClamAV's two commands.
    Anything else fails the test, `freshclam` included."""

    def _run(args, **kwargs):  # noqa: ANN001
        if args[0] == "clamscan" and "--version" in args:
            return MagicMock(returncode=0, stdout=VERSION_LINE + "\n")

        if args[0] == "clamscan":
            return MagicMock(
                returncode=scan_code, stdout=scan_stdout, stderr=scan_stderr
            )

        raise AssertionError(f"unexpected command {args}")

    return patch("subprocess.run", side_effect=_run)


class TestScanFile:
    """Each ClamAV exit code is one verdict."""

    def test_zero_is_clean(self) -> None:
        from scripts.scan_cli import scan_file

        with _clam(scan_code=0):
            assert scan_file(Path("upload")) == ("clean", None)

    def test_one_is_infected_and_names_the_signature(self) -> None:
        from scripts.scan_cli import scan_file

        with _clam(
            scan_code=1, scan_stdout="/tmp/x/upload: Eicar-Signature FOUND\n"
        ):
            assert scan_file(Path("upload")) == (
                "infected",
                "Eicar-Signature",
            )

    def test_anything_else_is_a_fault_with_the_reason(self) -> None:
        from scripts.scan_cli import scan_file

        with _clam(scan_code=2, scan_stderr="LibClamAV Error: cannot open"):
            verdict, detail = scan_file(Path("upload"))

        assert verdict == "failed"
        assert detail is not None
        assert "exited 2" in detail
        assert "cannot open" in detail

    def test_no_clamscan_is_a_fault(self) -> None:
        from scripts.scan_cli import scan_file

        with patch(
            "subprocess.run", side_effect=FileNotFoundError("clamscan")
        ):
            verdict, _ = scan_file(Path("upload"))

        assert verdict == "failed"

    def test_a_scan_past_its_ceiling_is_a_fault(self) -> None:
        from scripts.scan_cli import scan_file

        with patch(
            "subprocess.run",
            side_effect=subprocess.TimeoutExpired("clamscan", 600),
        ):
            verdict, _ = scan_file(Path("upload"))

        assert verdict == "failed"


class TestDefinitions:
    def test_the_version_line_is_recorded_whole(self) -> None:
        from scripts.scan_cli import definitions_version

        with _clam():
            assert definitions_version() == VERSION_LINE

    def test_no_clamscan_reads_as_unknown(self) -> None:
        from scripts.scan_cli import definitions_version

        with patch("subprocess.run", side_effect=FileNotFoundError):
            assert definitions_version() == "unknown"


class TestScanJob:
    """The whole run: download, scan, report, exit code."""

    def _run(
        self, *, exists: bool = True, scan_code: int = 0, stdout: str = ""
    ) -> tuple[int, MagicMock]:
        blob = MagicMock()
        blob.exists.return_value = exists
        client = MagicMock()
        client.bucket.return_value.blob.return_value = blob
        storage_module = MagicMock()
        storage_module.Client.return_value = client
        modules_patch, attr_patch = _patch_storage(storage_module)

        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.scan_cli import scan

            with (
                modules_patch,
                attr_patch,
                _clam(scan_code=scan_code, scan_stdout=stdout),
                patch("scripts.scan_cli.report") as report,
            ):
                return scan(), report

    def test_it_never_asks_clamav_for_new_definitions(self) -> None:
        """It runs on every upload from one address; ClamAV's servers
        refuse an address that asks too often. The image carries the
        day's definitions instead."""
        blob = MagicMock()
        blob.exists.return_value = True
        client = MagicMock()
        client.bucket.return_value.blob.return_value = blob
        storage_module = MagicMock()
        storage_module.Client.return_value = client
        modules_patch, attr_patch = _patch_storage(storage_module)

        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.scan_cli import scan

            with (
                modules_patch,
                attr_patch,
                _clam(scan_code=0) as run,
                patch("scripts.scan_cli.report"),
            ):
                scan()

        commands = [call.args[0][0] for call in run.call_args_list]
        assert "freshclam" not in commands
        assert "clamscan" in commands

    def test_a_clean_file_is_reported_and_exits_zero(self) -> None:
        code, report = self._run(scan_code=0)

        assert code == 0
        report.assert_called_once_with(
            "passports-bucket",
            BASE_ENV["SCAN_OBJECT"],
            "clean",
            None,
            VERSION_LINE,
        )

    def test_an_infected_file_is_reported_and_still_exits_zero(
        self, capsys
    ) -> None:
        """The job did its work: finding malware is a result, not a
        fault. The backend deletes the object, not this job."""
        code, report = self._run(
            scan_code=1, stdout="/tmp/x/upload: Eicar-Signature FOUND\n"
        )

        assert code == 0
        report.assert_called_once_with(
            "passports-bucket",
            BASE_ENV["SCAN_OBJECT"],
            "infected",
            "Eicar-Signature",
            VERSION_LINE,
        )
        assert "Malware found" in capsys.readouterr().err

    def test_a_scanner_fault_is_reported_and_exits_one(self) -> None:
        code, report = self._run(scan_code=2)

        assert code == 1
        args = report.call_args.args
        assert args[2] == "failed"
        assert args[3] is not None and "exited 2" in args[3]

    def test_a_missing_object_is_reported_as_failed(self) -> None:
        """Reported rather than left: an unanswered scan hides the
        upload for ever, and this names why."""
        code, report = self._run(exists=False)

        assert code == 1
        report.assert_called_once_with(
            "passports-bucket",
            BASE_ENV["SCAN_OBJECT"],
            "failed",
            "object not found",
            "",
        )

    def test_the_job_never_deletes(self) -> None:
        blob = MagicMock()
        blob.exists.return_value = True
        client = MagicMock()
        client.bucket.return_value.blob.return_value = blob
        storage_module = MagicMock()
        storage_module.Client.return_value = client
        modules_patch, attr_patch = _patch_storage(storage_module)

        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.scan_cli import scan

            with (
                modules_patch,
                attr_patch,
                _clam(scan_code=1, scan_stdout="upload: X FOUND\n"),
                patch("scripts.scan_cli.report"),
            ):
                scan()

        blob.delete.assert_not_called()

    def test_it_exits_on_a_missing_variable(self) -> None:
        env = {k: v for k, v in BASE_ENV.items() if k != "SCAN_OBJECT"}

        with patch.dict(os.environ, env, clear=True):
            from scripts.scan_cli import scan

            with pytest.raises(SystemExit) as exc:
                scan()
            assert exc.value.code == 1


class TestReport:
    """The callback that lets the backend act on the verdict."""

    def test_skips_when_unconfigured(self, capsys) -> None:
        from scripts.scan_cli import report

        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("SCAN_CALLBACK_URL", None)
            os.environ.pop("SCAN_CALLBACK_AUDIENCE", None)
            report("b", "k", "clean", None, VERSION_LINE)

        assert "not configured" in capsys.readouterr().err

    def test_posts_the_verdict_with_an_identity_token(self) -> None:
        from scripts.scan_cli import report

        env = {
            "SCAN_CALLBACK_URL": "https://api.test/api/ci/uploads/scan-complete",
            "SCAN_CALLBACK_AUDIENCE": AUDIENCE,
        }

        with patch.dict(os.environ, env, clear=False):
            stub, captured = _stub_urlopen()
            with (
                stub,
                patch(
                    "app.features.teaching.job_identity.mint_identity_token",
                    return_value="id-token",
                ),
            ):
                report("b", "k", "infected", "Eicar-Signature", VERSION_LINE)

        assert captured["url"] == (
            "https://api.test/api/ci/uploads/scan-complete"
        )
        assert captured["headers"]["authorization"] == "Bearer id-token"
        assert captured["json"] == {
            "bucket": "b",
            "object_key": "k",
            "verdict": "infected",
            "signature": "Eicar-Signature",
            "definitions": VERSION_LINE,
        }

    def test_no_token_means_no_report_and_no_raise(self, capsys) -> None:
        from scripts.scan_cli import report

        env = {
            "SCAN_CALLBACK_URL": "https://api.test/cb",
            "SCAN_CALLBACK_AUDIENCE": AUDIENCE,
        }

        with patch.dict(os.environ, env, clear=False):
            stub, captured = _stub_urlopen()
            with (
                stub,
                patch(
                    "app.features.teaching.job_identity.mint_identity_token",
                    return_value=None,
                ),
            ):
                report("b", "k", "clean", None, VERSION_LINE)

        assert "no identity token" in capsys.readouterr().err
        assert "url" not in captured

    def test_a_network_failure_does_not_raise(self, capsys) -> None:
        from scripts.scan_cli import report

        env = {
            "SCAN_CALLBACK_URL": "https://api.test/cb",
            "SCAN_CALLBACK_AUDIENCE": AUDIENCE,
        }

        with patch.dict(os.environ, env, clear=False):
            stub, _ = _stub_urlopen(side_effect=OSError("no route"))
            with (
                stub,
                patch(
                    "app.features.teaching.job_identity.mint_identity_token",
                    return_value="id-token",
                ),
            ):
                report("b", "k", "clean", None, VERSION_LINE)

        assert "callback failed" in capsys.readouterr().err


class TestLargeFiles:
    """A lecture is up to 3 GB. ClamAV's defaults skip anything over
    25 MB and call it clean, so the limits are set, and a file still too
    big to scan in full is a fault rather than clean or infected."""

    def test_the_size_limits_are_raised_and_reported_when_exceeded(
        self,
    ) -> None:
        from scripts.scan_cli import scan_file

        with _clam(scan_code=0) as run:
            scan_file(Path("upload"))

        args = run.call_args.args[0]
        assert "--max-filesize=4000M" in args
        assert "--max-scansize=4000M" in args
        assert "--alert-exceeds-max=yes" in args
        assert args[-1] == "upload"

    def test_a_file_too_big_to_scan_is_a_fault_not_an_infection(
        self,
    ) -> None:
        # "infected" would have the backend delete a lecture that has
        # not been shown to be harmful.
        from scripts.scan_cli import scan_file

        stdout = "upload: Heuristics.Limits.Exceeded.MaxFileSize FOUND\n"
        with _clam(scan_code=1, scan_stdout=stdout):
            verdict, detail = scan_file(Path("upload"))

        assert verdict == "failed"
        assert detail is not None and "too large to scan" in detail


class TestMountedBucket:
    """A lecture is scanned in place on the mounted video source bucket;
    anything from another bucket is downloaded as before."""

    KEY = "7/colonoscopy-basics/a1b2c3d4"

    def _run(self, env: dict[str, str]) -> tuple[int, MagicMock, MagicMock]:
        blob = MagicMock()
        blob.exists.return_value = True
        blob.download_to_filename.side_effect = lambda dest: Path(
            dest
        ).write_bytes(b"x")
        client = MagicMock()
        client.bucket.return_value.blob.return_value = blob
        storage_module = MagicMock()
        storage_module.Client.return_value = client
        modules_patch, attr_patch = _patch_storage(storage_module)

        with patch.dict(os.environ, env, clear=False):
            from scripts.scan_cli import scan

            with (
                modules_patch,
                attr_patch,
                _clam(scan_code=0) as run,
                patch("scripts.scan_cli.report"),
            ):
                return scan(), blob, run

    def _mounted(self, tmp_path: Path) -> Path:
        path = tmp_path / self.KEY
        path.parent.mkdir(parents=True)
        path.write_bytes(b"lecture")

        return path

    def test_scans_a_lecture_in_place(self, tmp_path: Path) -> None:
        mounted = self._mounted(tmp_path)
        env = {
            "SCAN_BUCKET": "video-source",
            "SCAN_OBJECT": self.KEY,
            "TEACHING_VIDEOS_SOURCE_BUCKET": "video-source",
            "TEACHING_VIDEOS_SOURCE_MOUNT": str(tmp_path),
        }

        code, blob, run = self._run(env)

        assert code == 0
        blob.download_to_filename.assert_not_called()
        assert run.call_args.args[0][-1] == str(mounted.resolve())

    def test_downloads_from_another_bucket(self, tmp_path: Path) -> None:
        # Passport evidence: not mounted, and small enough to download.
        self._mounted(tmp_path)
        env = {
            "SCAN_BUCKET": "passports-bucket",
            "SCAN_OBJECT": self.KEY,
            "TEACHING_VIDEOS_SOURCE_BUCKET": "video-source",
            "TEACHING_VIDEOS_SOURCE_MOUNT": str(tmp_path),
        }

        code, blob, _run = self._run(env)

        assert code == 0
        blob.download_to_filename.assert_called_once()

    def test_downloads_when_the_mount_does_not_hold_it(
        self, tmp_path: Path
    ) -> None:
        env = {
            "SCAN_BUCKET": "video-source",
            "SCAN_OBJECT": self.KEY,
            "TEACHING_VIDEOS_SOURCE_BUCKET": "video-source",
            "TEACHING_VIDEOS_SOURCE_MOUNT": str(tmp_path),
        }

        code, blob, _run = self._run(env)

        assert code == 0
        blob.download_to_filename.assert_called_once()

    def test_a_key_cannot_climb_out_of_the_mount(self, tmp_path: Path) -> None:
        mount = tmp_path / "mount"
        mount.mkdir()
        (tmp_path / "secret").write_bytes(b"not a lecture")
        env = {
            "SCAN_BUCKET": "video-source",
            "SCAN_OBJECT": "../secret",
            "TEACHING_VIDEOS_SOURCE_BUCKET": "video-source",
            "TEACHING_VIDEOS_SOURCE_MOUNT": str(mount),
        }

        _code, blob, run = self._run(env)

        # Not scanned in place: the download is what happens instead.
        blob.download_to_filename.assert_called_once()
        assert run.call_args.args[0][-1] != str(tmp_path / "secret")

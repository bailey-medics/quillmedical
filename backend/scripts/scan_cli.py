#!/usr/bin/env python3
"""Non-interactive malware scan CLI for Cloud Run Job execution.

Scans one uploaded object with ClamAV and reports the verdict, so that
nothing a person uploads is served to anyone until it has been looked
at. Passport evidence and teaching videos both come through here.

Environment variables only, with no arguments and no prompts, because a
Cloud Run Job has no terminal - the same shape as ``caption_cli.py``.

Environment Variables:
    SCAN_BUCKET:    Required.  The bucket holding the object.
    SCAN_OBJECT:    Required.  The object's key within it.
    SCAN_CALLBACK_URL:       Optional.  Where to report the verdict.
    SCAN_CALLBACK_AUDIENCE:  Optional.  The audience of the identity
                             token the report is sent with.

Both callback variables are optional together: unset means development,
where there is no backend to tell.

**The job never deletes anything.** It holds read access to the buckets
and nothing more, so a fault in the scanner cannot remove a file. The
backend acts on the verdict it is sent: an infected object is deleted
there, by the backend's own credentials, and its upload marked.

**A scanner fault is a verdict, not silence.** Where ClamAV cannot read
the file, or the object is not there, the report says ``failed``, so the
upload shows as needing attention rather than waiting for a clean that
never comes.

Usage (Cloud Run Job):
    gcloud run jobs execute quill-scan-app \\
      --region europe-west2 \\
      --update-env-vars \\
        SCAN_BUCKET=quill-passports,\\
        SCAN_OBJECT=ab/cd/.../files/sha256/ab/cd/... \\
      --wait
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path
from typing import Literal, NoReturn

proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)

Verdict = Literal["clean", "infected", "failed"]

#: How long a definitions refresh may take before the scan goes ahead
#: with the definitions the image was built with.
_REFRESH_CEILING = 60

#: How long one scan may take. A file is at most a few hundred megabytes
#: (the upload ceilings bound it), and ClamAV reads that in well under
#: this; past it something is wrong.
_SCAN_CEILING = 600


def refresh_definitions() -> bool:
    """Try to bring the definition database up to date. Best effort.

    The image carries a database from the day it was built; this fetches
    anything newer. A refresh that fails, or runs past its ceiling,
    leaves the baked definitions in place and the scan goes ahead with
    those, which is what the version in the report records.
    """
    # A fixed argument list and no shell.
    try:
        result = subprocess.run(  # noqa: S603  # nosec B607 B603
            ["freshclam", "--quiet"],  # noqa: S607
            capture_output=True,
            text=True,
            check=False,
            timeout=_REFRESH_CEILING,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(
            f"WARNING: definitions not refreshed ({exc}); scanning with "
            "the definitions the image was built with",
            file=sys.stderr,
        )
        return False

    if result.returncode != 0:
        print(
            f"WARNING: definitions not refreshed (freshclam exited "
            f"{result.returncode}); scanning with the definitions the "
            "image was built with",
            file=sys.stderr,
        )
        return False

    return True


def definitions_version() -> str:
    """What ClamAV says it is scanning with, for the record.

    ``clamscan --version`` prints ``ClamAV 1.0.7/27460/Tue Oct 14 ...``:
    the engine, the database version and the database date. The whole
    line is recorded, so a later reader can say exactly what a file was
    checked against.
    """
    try:
        result = subprocess.run(  # noqa: S603  # nosec B607 B603
            ["clamscan", "--version"],  # noqa: S607
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
        )
    except OSError, subprocess.TimeoutExpired:
        return "unknown"

    version = result.stdout.strip()

    return version or "unknown"


def scan_file(path: Path) -> tuple[Verdict, str | None]:
    """Run ClamAV over one file.

    ``clamscan`` exits 0 for a clean file, 1 for an infected one (naming
    the signature on stdout as ``<path>: <signature> FOUND``), and 2 for
    an error of its own. Anything but 0 or 1 is a scanner fault, and is
    reported as such rather than guessed either way.

    Returns:
        The verdict, and the signature name where one was found. For a
        fault, the second value is ClamAV's own reason, for the log.
    """
    try:
        result = subprocess.run(  # noqa: S603  # nosec B607 B603
            [  # noqa: S607
                "clamscan",
                "--no-summary",
                "--infected",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=_SCAN_CEILING,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return "failed", str(exc)

    if result.returncode == 0:
        return "clean", None

    if result.returncode == 1:
        return "infected", _signature_from(result.stdout)

    reason = (result.stderr or result.stdout).strip() or "no reason given"

    return "failed", f"clamscan exited {result.returncode}: {reason}"


def _signature_from(stdout: str) -> str:
    """The signature name from ``<path>: <signature> FOUND``."""
    for line in stdout.splitlines():
        line = line.strip()

        if line.endswith(" FOUND") and ": " in line:
            return line[: -len(" FOUND")].split(": ", 1)[1]

    return "unknown signature"


def report(
    bucket: str,
    object_key: str,
    verdict: Verdict,
    signature: str | None,
    definitions: str,
) -> None:
    """Tell the backend what the scan found.

    The backend is what gates serving on this verdict and what deletes
    an infected object, so a report that does not arrive leaves the
    upload waiting. It is sent with a Google identity token for the
    backend's own address, as the transcode and caption reports are;
    the job holds no secret.

    **Never raises.** The scan has been done; a report that cannot be
    delivered is logged loudly, and the upload shows as unanswered until
    someone runs the job again.
    """
    url = os.environ.get("SCAN_CALLBACK_URL", "").strip()
    audience = os.environ.get("SCAN_CALLBACK_AUDIENCE", "").strip()

    if not url or not audience:
        print(
            "Callback not configured; skipping scan report.",
            file=sys.stderr,
        )
        return

    from app.features.teaching.job_identity import mint_identity_token

    token = mint_identity_token(audience)

    if token is None:
        print(
            "ERROR: no identity token, so the scan report was not sent",
            file=sys.stderr,
        )
        return

    # `urllib`, not `httpx`, for the reason the caption job gives: this
    # image carries one pinned package, and the standard library cannot
    # go missing.
    payload = json.dumps(
        {
            "bucket": bucket,
            "object_key": object_key,
            "verdict": verdict,
            "signature": signature,
            "definitions": definitions,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        # The callback address is the job's own configuration, never a
        # user's.
        with urllib.request.urlopen(  # nosec B310
            request, timeout=30
        ) as response:
            if response.status >= 400:
                print(
                    f"ERROR: scan callback refused ({response.status})",
                    file=sys.stderr,
                )
                return
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: scan callback failed ({exc})", file=sys.stderr)
        return

    print(f"✓ Reported {verdict} for {object_key}")


def _require_env(*names: str) -> dict[str, str]:
    """Read required environment variables, exiting on any missing."""
    values: dict[str, str] = {}
    missing: list[str] = []

    for name in names:
        val = os.environ.get(name, "").strip()
        if not val:
            missing.append(name)
        else:
            values[name] = val
    if missing:
        print(
            f"ERROR: Missing required environment variable(s): "
            f"{', '.join(missing)}",
            file=sys.stderr,
        )
        sys.exit(1)

    return values


def scan() -> int:
    """Download one object, scan it, report the verdict.

    Exits 0 when a verdict was reached, clean or infected alike: the job
    did its work either way. Exits 1 for a scanner fault, after
    reporting it, so the execution shows red where someone will see it.
    """
    env = _require_env("SCAN_BUCKET", "SCAN_OBJECT")
    bucket_name = env["SCAN_BUCKET"]
    object_key = env["SCAN_OBJECT"]

    from google.cloud import storage  # type: ignore[attr-defined]

    client = storage.Client()
    blob = client.bucket(bucket_name).blob(object_key)

    if not blob.exists():
        print(f"ERROR: No object at {object_key}", file=sys.stderr)
        report(bucket_name, object_key, "failed", "object not found", "")

        return 1

    refresh_definitions()
    definitions = definitions_version()
    print(f"Scanning with {definitions}")

    # Downloaded under a fixed name, never the object's own: the key is
    # a bucket path and has no business becoming a local one.
    with tempfile.TemporaryDirectory() as tmp:
        local = Path(tmp) / "upload"
        print(f"Downloading {object_key}...")
        blob.download_to_filename(str(local))

        print("Scanning...")
        verdict, detail = scan_file(local)

    if verdict == "failed":
        print(f"✗ Scan failed: {detail}", file=sys.stderr)
        report(bucket_name, object_key, verdict, detail, definitions)

        return 1

    if verdict == "infected":
        # The signature and the key, nothing else: the key names an
        # upload, never a person.
        print(f"✗ Malware found in {object_key}: {detail}", file=sys.stderr)
    else:
        print(f"✓ Clean: {object_key}")

    report(bucket_name, object_key, verdict, detail, definitions)

    return 0


def main() -> NoReturn:
    """Run the scan and exit with its status."""
    sys.exit(scan())


if __name__ == "__main__":
    main()

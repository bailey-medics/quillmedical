"""Generate a preview certificate PDF with dummy data.

Run inside the backend Docker container:

    docker exec quill_backend python -m scripts.preview_certificate

Or with a specific bank background:

    docker exec quill_backend python -m scripts.preview_certificate \
        --bank colonoscopy-optical-diagnosis-test

The PDF is written to /tmp/certificate-preview.pdf - copy it to the
host to view:

    docker cp quill_backend:/tmp/certificate-preview.pdf .
    open certificate-preview.pdf
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml

from app.config import settings
from app.features.teaching.certificate import (
    generate_certificate_pdf,
    parse_certificate_style,
)
from app.features.teaching.storage import resolve_local_bank

# A preview for a person to open, on their own machine.
_OUTPUT_PATH = Path("/tmp/certificate-preview.pdf")  # noqa: S108  # nosec B108

# Dummy data for preview - tweak these to test different lengths
_EXAM_TITLE = "Optical Diagnosis of Diminutive Colorectal Polyps MCQ Online"
_CANDIDATE_NAME = "Dr Alexandra Hamilton-Fairfax"
# Not a password: "Pass" is the sample result.
_PASS_SUMMARY = (  # nosec B105
    "Pass\nHigh confidence rate: 78%\nAccuracy of high-confidence answers: 91%"
)
_COMPLETION_DATE = "31 March 2026"
_EXAM_REF = "eoeeta-1-42"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a preview certificate PDF"
    )
    parser.add_argument(
        "--bank",
        default="colonoscopy-optical-diagnosis-test",
        help="Module ID (folder name under a teaching repo's modules/)",
    )
    parser.add_argument(
        "--output",
        default=str(_OUTPUT_PATH),
        help="Output PDF path (default: %(default)s)",
    )
    args = parser.parse_args()

    base_path = settings.TEACHING_QUESTION_BANK_PATH

    if not base_path:
        print("TEACHING_QUESTION_BANK_PATH is not set", file=sys.stderr)
        sys.exit(1)

    # The folder holding the assessment: the same lookup the sync uses,
    # so a module is found wherever its teaching repo keeps it.
    bank_dir = resolve_local_bank(base_path, args.bank)

    if bank_dir is None:
        print(
            f"No module '{args.bank}' found under {base_path}",
            file=sys.stderr,
        )
        sys.exit(1)

    bg = bank_dir / "certificate-blank.png"

    if not bg.is_file():
        print(
            f"No certificate-blank.png found for '{args.bank}' in {bank_dir}",
            file=sys.stderr,
        )
        sys.exit(1)

    # The certificate style sits in assessment.yaml, or config.yaml in
    # the older layout.
    config: dict[str, Any] = {}

    for name in ("assessment.yaml", "config.yaml"):
        config_path = bank_dir / name

        if config_path.is_file():
            with open(config_path, encoding="utf-8") as f:
                config = yaml.safe_load(f) or {}

            break

    style = parse_certificate_style(config.get("certificate"))

    # Build preview exam ref from config prefix
    results = config.get("results", {})
    exam_ref_prefix = results.get("exam_ref_prefix", "")
    exam_ref = f"{exam_ref_prefix}42" if exam_ref_prefix else _EXAM_REF

    pdf_bytes = generate_certificate_pdf(
        background_path=bg,
        exam_title=_EXAM_TITLE,
        candidate_name=_CANDIDATE_NAME,
        pass_summary=_PASS_SUMMARY,
        completion_date=_COMPLETION_DATE,
        style=style,
        exam_ref=exam_ref,
    )

    out = Path(args.output)
    out.write_bytes(pdf_bytes)
    print(f"Certificate preview written to {out}")
    print(f"Copy to host: docker cp quill_backend:{out} .")


if __name__ == "__main__":
    main()

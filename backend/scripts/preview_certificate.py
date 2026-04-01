"""Generate a preview certificate PDF with dummy data.

Run inside the backend Docker container:

    docker exec quill_backend python -m scripts.preview_certificate

Or with a specific bank background:

    docker exec quill_backend python -m scripts.preview_certificate \
        --bank colonoscopy-optical-diagnosis-test

The PDF is written to /tmp/certificate-preview.pdf — copy it to the
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

from app.features.teaching.certificate import (
    find_certificate_background,
    generate_certificate_pdf,
    parse_certificate_style,
)

_DEFAULT_BANK_PATH = Path("/question-banks/questions")
_OUTPUT_PATH = Path("/tmp/certificate-preview.pdf")  # noqa: S108

# Dummy data for preview — tweak these to test different lengths
_EXAM_TITLE = "Optical Diagnosis of Diminutive Colorectal Polyps MCQ Online"
_CANDIDATE_NAME = "Dr Alexandra Hamilton-Fairfax"
_PASS_SUMMARY = (
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
        help="Question bank ID (folder name under question-bank/questions/)",
    )
    parser.add_argument(
        "--output",
        default=str(_OUTPUT_PATH),
        help="Output PDF path (default: %(default)s)",
    )
    args = parser.parse_args()

    bg = find_certificate_background(_DEFAULT_BANK_PATH, args.bank)
    if not bg:
        print(
            f"No certificate-blank.png found for bank '{args.bank}' "
            f"in {_DEFAULT_BANK_PATH}",
            file=sys.stderr,
        )
        sys.exit(1)

    # Load certificate style from config.yaml
    config_path = _DEFAULT_BANK_PATH / args.bank / "config.yaml"
    config: dict[str, Any] = {}
    if config_path.is_file():
        with open(config_path, encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
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

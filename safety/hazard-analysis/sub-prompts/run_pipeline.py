#!/usr/bin/env python3
"""
Clinical Safety Hazard Review Pipeline — Orchestrator

Prepares prompt files for use in VS Code + Copilot and handles the non-LLM
stages (file walking, batching, hazard log generation).

Workflow:
    1. prepare-stage-1   → Generates ready-to-paste prompt with codebase contents
    2. prepare-stage-2   → Generates batched prompts with Tier 1-3 file contents
    3. prepare-stage-3   → Generates dedup prompt with Stage 2 output
    4. generate-stage-4  → Reads LLM JSON output, calls HazardLogGenerator
    5. prepare-stage-5   → Generates mitigations prompt with Stage 3 + code

Usage:
    python run_pipeline.py prepare-stage-1 /path/to/codebase
    python run_pipeline.py prepare-stage-2
    python run_pipeline.py prepare-stage-3
    python run_pipeline.py generate-stage-4
    python run_pipeline.py prepare-stage-5

All output goes into a timestamped directory: hazard-review-YYYY-MM-DD/
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# File extensions to include in codebase analysis
CODE_EXTENSIONS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".html",
    ".css",
    ".scss",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".env",
    ".sql",
    ".graphql",
    ".md",  # Include markdown for config/doc files that may be relevant
}

# Directories to always skip
SKIP_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    ".next",
    "dist",
    "build",
    ".vscode",
    ".idea",
    "coverage",
    ".nyc_output",
    ".storybook",
    "storybook-static",
    ".turbo",
    ".cache",
}

# Files to always skip
SKIP_FILES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    ".DS_Store",
    "Thumbs.db",
}

# Approximate max characters per Stage 2 batch prompt.
# Copilot context window is limited — keep batches manageable.
# Adjust this based on your experience with Copilot's limits.
BATCH_MAX_CHARS = 80_000


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def get_output_dir() -> Path:
    """Get or create the output directory for this review run."""
    today = date.today().isoformat()
    d = Path(f"hazard-review-{today}")
    d.mkdir(exist_ok=True)
    return d


def get_tooling_dir() -> Path:
    """Find the clinical-safety-tooling directory (where this script lives)."""
    return Path(__file__).parent


def read_template(name: str) -> str:
    """Read a prompt template from the prompts/ directory."""
    path = get_tooling_dir() / "prompts" / name
    if not path.exists():
        print(f"ERROR: Template not found: {path}")
        sys.exit(1)
    return path.read_text()


def read_hazard_types() -> str:
    """Read the hazard types taxonomy."""
    path = get_tooling_dir() / "hazard-types.md"
    return path.read_text()


def read_epr_hazards() -> str:
    """Read the EPR hazards reference if it exists."""
    # Check common locations
    for candidate in [
        get_tooling_dir() / "epr-hazards.md",
        get_tooling_dir().parent / "epr-hazards.md",
        Path("epr-hazards.md"),
    ]:
        if candidate.exists():
            return candidate.read_text()
    return "(No EPR hazards reference file found. Proceeding without it.)"


def walk_codebase(root: Path) -> list[tuple[Path, str]]:
    """
    Walk the codebase and return a list of (relative_path, contents) tuples.
    Skips binary files, node_modules, etc.
    """
    files: list[tuple[Path, str]] = []
    root = root.resolve()

    for dirpath, dirnames, filenames in os.walk(root):
        # Filter out skipped directories (modifying in-place to prevent descent)
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        dirnames.sort()

        for filename in sorted(filenames):
            if filename in SKIP_FILES:
                continue

            filepath = Path(dirpath) / filename
            ext = filepath.suffix.lower()

            if ext not in CODE_EXTENSIONS:
                continue

            try:
                contents = filepath.read_text(errors="replace")
                rel_path = filepath.relative_to(root)
                files.append((rel_path, contents))
            except Exception as e:
                print(f"  WARN: Could not read {filepath}: {e}")

    return files


def format_file_block(rel_path: Path, contents: str) -> str:
    """Format a single file for inclusion in a prompt."""
    return f"### `{rel_path}`\n\n```\n{contents}\n```\n"


def write_prompt(output_dir: Path, filename: str, content: str) -> Path:
    """Write a prompt file and report its size."""
    path = output_dir / filename
    path.write_text(content)
    size_kb = len(content) / 1024
    print(f"  Written: {path} ({size_kb:.0f} KB, ~{len(content)} chars)")
    return path


# ---------------------------------------------------------------------------
# Stage 1: Prepare inventory prompt
# ---------------------------------------------------------------------------


def prepare_stage_1(codebase_root: Path):
    """Walk the codebase and produce a complete Stage 1 prompt."""
    output_dir = get_output_dir()
    print("\n=== Stage 1: Code Inventory ===")
    print(f"Codebase: {codebase_root}")
    print(f"Output:   {output_dir}")

    # Walk codebase — for Stage 1 we only need file LISTING, not full contents.
    # But including contents helps the LLM classify accurately.
    # We'll include a tree listing plus contents of key files.
    files = walk_codebase(codebase_root)
    print(f"Found {len(files)} files")

    # Build tree listing
    tree_lines = [f"Total files: {len(files)}\n"]
    for rel_path, _ in files:
        tree_lines.append(f"  {rel_path}")

    # Build file contents blocks
    content_blocks: list[str] = []
    for rel_path, contents in files:
        content_blocks.append(format_file_block(rel_path, contents))

    codebase_text = (
        "## File Tree\n\n"
        + "\n".join(tree_lines)
        + "\n\n## File Contents\n\n"
        + "\n".join(content_blocks)
    )

    # Check if this is too large for a single prompt
    template = read_template("stage-1-inventory.md")
    prompt = template.replace("{{CODEBASE_CONTENTS}}", codebase_text)

    if len(prompt) > 500_000:
        print(f"\n  WARNING: Prompt is {len(prompt)/1024:.0f} KB.")
        print("  This may exceed Copilot's context window.")
        print("  Consider splitting into multiple passes or using tree-only mode.")
        print("  To use tree-only mode, re-run with --tree-only flag.")

    write_prompt(output_dir, "stage-1-prompt.md", prompt)

    # Also save a tree-only version as fallback
    template_tree = template.replace("{{CODEBASE_CONTENTS}}", "\n".join(tree_lines))
    write_prompt(output_dir, "stage-1-prompt-tree-only.md", template_tree)

    # Save the raw file list for Stage 2 to use
    manifest = {
        "codebase_root": str(codebase_root.resolve()),
        "files": [str(p) for p, _ in files],
    }
    manifest_path = output_dir / "codebase-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"  Manifest: {manifest_path}")

    print("\n  NEXT STEPS:")
    print("  1. Open stage-1-prompt.md in VS Code")
    print("  2. Paste into Copilot chat (or use tree-only version if too large)")
    print(f"  3. Save Copilot's response as: {output_dir}/stage-1-inventory.md")
    print("  4. Run: python run_pipeline.py prepare-stage-2")


# ---------------------------------------------------------------------------
# Stage 2: Prepare discovery prompts (batched)
# ---------------------------------------------------------------------------


def parse_inventory_tiers(inventory_path: Path) -> dict[str, list[str]]:
    """
    Parse stage-1-inventory.md and extract file paths per tier.
    Returns dict: {"1": [paths], "2": [paths], "3": [paths], "4": [paths]}
    """
    text = inventory_path.read_text()
    tiers: dict[str, list[str]] = {"1": [], "2": [], "3": [], "4": []}
    current_tier = None

    for line in text.splitlines():
        # Detect tier headers
        if "Tier 1" in line and "#" in line:
            current_tier = "1"
        elif "Tier 2" in line and "#" in line:
            current_tier = "2"
        elif "Tier 3" in line and "#" in line:
            current_tier = "3"
        elif "Tier 4" in line and "#" in line:
            current_tier = "4"
        elif line.startswith("#"):
            # Any other header resets
            if current_tier and "Tier" not in line:
                pass  # Stay in current tier for sub-content

        # Extract file paths from table rows
        if current_tier and "|" in line:
            # Look for backtick-wrapped file paths
            match = re.search(r"`([^`]+\.\w+(?::\d+)?)`", line)
            if match:
                filepath = match.group(1)
                # Strip line numbers if present
                filepath = filepath.split(":")[0]
                tiers[current_tier].append(filepath)

    return tiers


def prepare_stage_2():
    """Read Stage 1 inventory, batch Tier 1–3 files, produce discovery prompts."""
    output_dir = get_output_dir()
    print("\n=== Stage 2: Hazard Discovery ===")

    # Load inventory
    inventory_path = output_dir / "stage-1-inventory.md"
    if not inventory_path.exists():
        print(f"ERROR: {inventory_path} not found.")
        print("Run Stage 1 first, then save the LLM output as stage-1-inventory.md")
        sys.exit(1)

    # Load manifest for codebase root
    manifest_path = output_dir / "codebase-manifest.json"
    if not manifest_path.exists():
        print(f"ERROR: {manifest_path} not found. Re-run prepare-stage-1.")
        sys.exit(1)

    manifest = json.loads(manifest_path.read_text())
    codebase_root = Path(manifest["codebase_root"])

    # Parse tiers
    tiers = parse_inventory_tiers(inventory_path)
    tier1_count = len(tiers["1"])
    tier2_count = len(tiers["2"])
    tier3_count = len(tiers["3"])
    total = tier1_count + tier2_count + tier3_count

    print(f"  Tier 1 files: {tier1_count}")
    print(f"  Tier 2 files: {tier2_count}")
    print(f"  Tier 3 files: {tier3_count}")
    print(f"  Total for analysis: {total}")

    # Collect file contents for Tiers 1-3
    analysis_files: list[tuple[str, str]] = []
    for tier in ["1", "2", "3"]:
        for filepath in tiers[tier]:
            full_path = codebase_root / filepath
            if full_path.exists():
                try:
                    contents = full_path.read_text(errors="replace")
                    analysis_files.append((filepath, contents))
                except Exception as e:
                    print(f"  WARN: Could not read {full_path}: {e}")
            else:
                print(f"  WARN: File not found: {full_path}")

    # Batch files into manageable chunks
    batches: list[list[tuple[str, str]]] = []
    current_batch: list[tuple[str, str]] = []
    current_size = 0

    for filepath, contents in analysis_files:
        block = format_file_block(Path(filepath), contents)
        block_size = len(block)

        if current_size + block_size > BATCH_MAX_CHARS and current_batch:
            batches.append(current_batch)
            current_batch = []
            current_size = 0

        current_batch.append((filepath, contents))
        current_size += block_size

    if current_batch:
        batches.append(current_batch)

    print(f"  Batches: {len(batches)}")

    # Load reference materials
    template = read_template("stage-2-discovery.md")
    hazard_types = read_hazard_types()
    epr_hazards = read_epr_hazards()

    # Generate one prompt per batch
    for i, batch in enumerate(batches, 1):
        source_blocks = []
        for filepath, contents in batch:
            source_blocks.append(format_file_block(Path(filepath), contents))

        prompt = template
        prompt = prompt.replace("{{HAZARD_TYPES}}", hazard_types)
        prompt = prompt.replace("{{EPR_HAZARDS}}", epr_hazards)
        prompt = prompt.replace("{{BATCH_NUMBER}}", str(i))
        prompt = prompt.replace("{{TOTAL_BATCHES}}", str(len(batches)))
        prompt = prompt.replace("{{SOURCE_CODE}}", "\n".join(source_blocks))

        write_prompt(output_dir, f"stage-2-prompt-batch-{i:02d}.md", prompt)

    print("\n  NEXT STEPS:")
    print("  1. For each stage-2-prompt-batch-NN.md:")
    print("     a. Open in VS Code")
    print("     b. Paste into Copilot chat")
    print(f"     c. Save response as: {output_dir}/stage-2-response-batch-NN.md")
    print("  2. Run: python run_pipeline.py prepare-stage-3")


# ---------------------------------------------------------------------------
# Stage 3: Prepare deduplication prompt
# ---------------------------------------------------------------------------


def prepare_stage_3():
    """Combine Stage 2 batch responses and produce dedup prompt."""
    output_dir = get_output_dir()
    print("\n=== Stage 3: Deduplication ===")

    # Collect all Stage 2 response files
    responses: list[str] = []
    batch_files = sorted(output_dir.glob("stage-2-response-batch-*.md"))

    if not batch_files:
        print(f"ERROR: No stage-2-response-batch-*.md files found in {output_dir}")
        print("Run Stage 2 first, then save each LLM response.")
        sys.exit(1)

    for bf in batch_files:
        print(f"  Reading: {bf.name}")
        responses.append(f"## {bf.name}\n\n{bf.read_text()}")

    combined = "\n\n---\n\n".join(responses)
    print(f"  Combined Stage 2 output: {len(combined)/1024:.0f} KB")

    # Check for existing hazard log
    existing_log = ""
    hazard_drafts_dir = output_dir / "stage-4-hazard-drafts"
    if hazard_drafts_dir.exists():
        hazard_files = sorted(hazard_drafts_dir.glob("HAZ-*.md"))
        if hazard_files:
            log_parts = []
            for hf in hazard_files:
                log_parts.append(f"### {hf.stem}\n\n{hf.read_text()}")
            existing_log = "\n\n".join(log_parts)
            print(f"  Existing hazard log: {len(hazard_files)} entries")

    if not existing_log:
        existing_log = (
            "(No existing hazard log found. All hazards will be marked as NEW.)"
        )

    # Build prompt
    template = read_template("stage-3-deduplicate.md")
    prompt = template
    prompt = prompt.replace("{{EXISTING_HAZARD_LOG}}", existing_log)
    prompt = prompt.replace("{{STAGE_2_OUTPUT}}", combined)

    write_prompt(output_dir, "stage-3-prompt.md", prompt)

    print("\n  NEXT STEPS:")
    print("  1. Open stage-3-prompt.md in VS Code")
    print("  2. Paste into Copilot chat")
    print(f"  3. Save response as: {output_dir}/stage-3-deduplicated.md")
    print("  4. Run: python run_pipeline.py generate-stage-4")


# ---------------------------------------------------------------------------
# Stage 4: Generate hazard log files from LLM JSON
# ---------------------------------------------------------------------------


def generate_stage_4():
    """
    Two-step stage:
    1. If stage-4-structured.json doesn't exist, prepare the prompt for the LLM
       to convert Stage 3 into structured JSON.
    2. If it does exist, read it and call HazardLogGenerator for each hazard.
    """
    output_dir = get_output_dir()
    print("\n=== Stage 4: Hazard Log Generation ===")

    json_path = output_dir / "stage-4-structured.json"
    dedup_path = output_dir / "stage-3-deduplicated.md"

    if not json_path.exists():
        # Step 1: Prepare the prompt for the LLM to produce JSON
        if not dedup_path.exists():
            print(f"ERROR: {dedup_path} not found. Run Stage 3 first.")
            sys.exit(1)

        template = read_template("stage-4-structured.md")
        hazard_types = read_hazard_types()
        stage_3_output = dedup_path.read_text()

        prompt = template
        prompt = prompt.replace("{{HAZARD_TYPES}}", hazard_types)
        prompt = prompt.replace("{{STAGE_3_OUTPUT}}", stage_3_output)

        write_prompt(output_dir, "stage-4-prompt.md", prompt)

        print("\n  NEXT STEPS:")
        print("  1. Open stage-4-prompt.md in VS Code")
        print("  2. Paste into Copilot chat")
        print("  3. Copy the JSON array from the response")
        print(f"  4. Save it as: {output_dir}/stage-4-structured.json")
        print("  5. Re-run: python run_pipeline.py generate-stage-4")
        return

    # Step 2: Read JSON and generate hazard log files
    print(f"  Reading: {json_path}")
    raw = json_path.read_text()

    # Strip markdown code fences if present
    raw = re.sub(r"^```json\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw.strip())

    try:
        hazards = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON in {json_path}: {e}")
        print("Check the file and fix any JSON syntax errors, then re-run.")
        sys.exit(1)

    if not isinstance(hazards, list):
        print(f"ERROR: Expected a JSON array, got {type(hazards).__name__}")
        sys.exit(1)

    # Import the generator
    sys.path.insert(0, str(get_tooling_dir()))
    from hazard_log_generator import HazardLogGenerator

    gen = HazardLogGenerator(
        template_path=get_tooling_dir() / "hazard-log-template.md",
        hazard_types_path=get_tooling_dir() / "hazard-types.md",
    )

    drafts_dir = output_dir / "stage-4-hazard-drafts"
    drafts_dir.mkdir(exist_ok=True)

    for i, hazard in enumerate(hazards):
        hazard_id = hazard.get("hazard_id", f"HAZ-{i+1:03d}")
        values = hazard.get("values", {})

        output_path = drafts_dir / f"{hazard_id}.md"
        gen.generate(
            output_path=output_path,
            hazard_id=hazard_id,
            values=values,
        )
        print(f"  Generated: {output_path}")

    print(f"\n  Generated {len(hazards)} hazard log entries in {drafts_dir}/")
    print("\n  NEXT STEPS:")
    print("  1. Review each HAZ-NNN.md file")
    print("  2. Accept, modify, or reject each hazard")
    print("  3. Score accepted hazards (edit Likelihood/Severity fields)")
    print("  4. Run: python run_pipeline.py prepare-stage-5")


# ---------------------------------------------------------------------------
# Stage 5: Prepare mitigations prompt
# ---------------------------------------------------------------------------


def prepare_stage_5():
    """Produce mitigations prompt from Stage 3 + relevant code."""
    output_dir = get_output_dir()
    print("\n=== Stage 5: Mitigation Suggestions ===")

    dedup_path = output_dir / "stage-3-deduplicated.md"
    if not dedup_path.exists():
        print(f"ERROR: {dedup_path} not found. Run Stage 3 first.")
        sys.exit(1)

    stage_3_output = dedup_path.read_text()

    # Load manifest for codebase root
    manifest_path = output_dir / "codebase-manifest.json"
    if not manifest_path.exists():
        print(
            "WARN: No codebase manifest. Mitigations prompt will not include source code."
        )
        relevant_code = "(Codebase not available. Suggest mitigations based on hazard descriptions only.)"
    else:
        manifest = json.loads(manifest_path.read_text())
        codebase_root = Path(manifest["codebase_root"])

        # Extract code locations from Stage 3 and include those files
        code_refs: set[str] = set()
        for match in re.finditer(r"`([^`]+\.\w{2,4})(?::\d+)?`", stage_3_output):
            code_refs.add(match.group(1).split(":")[0])

        code_blocks: list[str] = []
        total_size = 0
        for ref in sorted(code_refs):
            full_path = codebase_root / ref
            if full_path.exists() and total_size < BATCH_MAX_CHARS:
                try:
                    contents = full_path.read_text(errors="replace")
                    block = format_file_block(Path(ref), contents)
                    code_blocks.append(block)
                    total_size += len(block)
                except Exception:
                    pass

        if code_blocks:
            relevant_code = "\n".join(code_blocks)
            print(f"  Included {len(code_blocks)} source files referenced in hazards")
        else:
            relevant_code = "(No source files could be loaded from hazard references.)"

    template = read_template("stage-5-mitigations.md")
    prompt = template
    prompt = prompt.replace("{{STAGE_3_OUTPUT}}", stage_3_output)
    prompt = prompt.replace("{{RELEVANT_SOURCE_CODE}}", relevant_code)

    write_prompt(output_dir, "stage-5-prompt.md", prompt)

    print("\n  NEXT STEPS:")
    print("  1. Open stage-5-prompt.md in VS Code")
    print("  2. Paste into Copilot chat")
    print(f"  3. Save response as: {output_dir}/stage-5-mitigations.md")
    print("  4. Review mitigations and decide which to implement")


# ---------------------------------------------------------------------------
# Status command
# ---------------------------------------------------------------------------


def show_status():
    """Show the current state of the pipeline."""
    output_dir = get_output_dir()
    print(f"\n=== Pipeline Status: {output_dir} ===\n")

    checks = [
        ("Stage 1 prompt", output_dir / "stage-1-prompt.md"),
        (
            "Stage 1 inventory (LLM output)",
            output_dir / "stage-1-inventory.md",
        ),
        ("Codebase manifest", output_dir / "codebase-manifest.json"),
    ]

    # Check for Stage 2 batches
    batch_prompts = sorted(output_dir.glob("stage-2-prompt-batch-*.md"))
    batch_responses = sorted(output_dir.glob("stage-2-response-batch-*.md"))
    if batch_prompts:
        checks.append(
            (
                f"Stage 2 prompts ({len(batch_prompts)} batches)",
                batch_prompts[0],
            )
        )
    if batch_responses:
        checks.append(
            (
                f"Stage 2 responses ({len(batch_responses)}/{len(batch_prompts)})",
                batch_responses[0],
            )
        )

    checks.extend(
        [
            ("Stage 3 prompt", output_dir / "stage-3-prompt.md"),
            (
                "Stage 3 deduplicated (LLM output)",
                output_dir / "stage-3-deduplicated.md",
            ),
            ("Stage 4 prompt", output_dir / "stage-4-prompt.md"),
            (
                "Stage 4 structured JSON (LLM output)",
                output_dir / "stage-4-structured.json",
            ),
        ]
    )

    drafts_dir = output_dir / "stage-4-hazard-drafts"
    if drafts_dir.exists():
        draft_count = len(list(drafts_dir.glob("HAZ-*.md")))
        if draft_count:
            checks.append(
                (
                    f"Stage 4 hazard drafts ({draft_count} files)",
                    drafts_dir / "HAZ-001.md",
                )
            )

    checks.extend(
        [
            ("Stage 5 prompt", output_dir / "stage-5-prompt.md"),
            (
                "Stage 5 mitigations (LLM output)",
                output_dir / "stage-5-mitigations.md",
            ),
        ]
    )

    for label, path in checks:
        if isinstance(path, Path) and path.exists():
            size = path.stat().st_size / 1024
            print(f"  ✅ {label} ({size:.0f} KB)")
        else:
            print(f"  ⬜ {label}")

    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Clinical Safety Hazard Review Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Stages:
  prepare-stage-1 PATH   Walk codebase, generate inventory prompt
  prepare-stage-2        Batch Tier 1-3 files, generate discovery prompts
  prepare-stage-3        Combine Stage 2 responses, generate dedup prompt
  generate-stage-4       Generate hazard log files from LLM JSON (or prepare prompt)
  prepare-stage-5        Generate mitigations prompt
  status                 Show pipeline progress
        """,
    )
    parser.add_argument(
        "command",
        choices=[
            "prepare-stage-1",
            "prepare-stage-2",
            "prepare-stage-3",
            "generate-stage-4",
            "prepare-stage-5",
            "status",
        ],
    )
    parser.add_argument(
        "codebase_root",
        nargs="?",
        help="Path to codebase root (required for prepare-stage-1)",
    )
    parser.add_argument(
        "--tree-only",
        action="store_true",
        help="For Stage 1: include only file tree, not contents",
    )

    args = parser.parse_args()

    if args.command == "prepare-stage-1":
        if not args.codebase_root:
            print("ERROR: codebase_root is required for prepare-stage-1")
            print("Usage: python run_pipeline.py prepare-stage-1 /path/to/codebase")
            sys.exit(1)
        prepare_stage_1(Path(args.codebase_root))

    elif args.command == "prepare-stage-2":
        prepare_stage_2()

    elif args.command == "prepare-stage-3":
        prepare_stage_3()

    elif args.command == "generate-stage-4":
        generate_stage_4()

    elif args.command == "prepare-stage-5":
        prepare_stage_5()

    elif args.command == "status":
        show_status()


if __name__ == "__main__":
    main()

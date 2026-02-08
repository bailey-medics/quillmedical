#!/usr/bin/env python3
"""
Stage 6: Hazard Log Draft Generator

Reads all stage-5-mitigations hazard files and generates DCB 0129/0160
compliant hazard log drafts in structured markdown format.
"""

from pathlib import Path
from typing import TypedDict


class HazardData(TypedDict):
    """Type definition for parsed hazard data."""

    hazard_id: str
    hazard_name: str
    description: str
    causes: list[str]
    effect: str
    hazard: str
    harm: str
    code: list[str]
    design_controls: list[str]
    testing_controls: list[str]
    training_controls: list[str]
    business_controls: list[str]


def parse_hazard_file(content: str) -> HazardData:
    """Parse stage-5 hazard markdown file into structured data."""
    lines = content.split("\n")

    data: HazardData = {
        "hazard_id": "",
        "hazard_name": "",
        "description": "",
        "causes": [],
        "effect": "",
        "hazard": "",
        "harm": "",
        "code": [],
        "design_controls": [],
        "testing_controls": [],
        "training_controls": [],
        "business_controls": [],
    }

    current_section = None
    current_subsection = None

    for line in lines:
        # Extract hazard ID
        if line.startswith("**Hazard id:**"):
            data["hazard_id"] = line.split("**Hazard id:**")[1].strip()

        # Extract hazard name
        elif line.startswith("**Hazard name:**"):
            data["hazard_name"] = line.split("**Hazard name:**")[1].strip()

        # Extract description
        elif line.startswith("**Description:**"):
            data["description"] = line.split("**Description:**")[1].strip()

        # Section headers
        elif line.startswith("**Causes:**"):
            current_section = "causes"
            continue
        elif line.startswith("**Effect:**"):
            current_section = "effect"
            continue
        elif line.startswith("**Hazard:**"):
            current_section = "hazard"
            continue
        elif line.startswith("**Harm:**"):
            current_section = "harm"
            continue
        elif line.startswith("**Code associated with hazard:**"):
            current_section = "code"
            continue
        elif line.startswith("**Hazard controls:**"):
            current_section = "controls"
            continue

        # Control subsections
        elif line.startswith("### Design controls"):
            current_subsection = "design"
            continue
        elif line.startswith("### Testing controls"):
            current_subsection = "testing"
            continue
        elif line.startswith("### Training controls"):
            current_subsection = "training"
            continue
        elif line.startswith("### Business process controls"):
            current_subsection = "business"
            continue

        # Process content based on current section
        elif current_section == "causes" and line.startswith("- "):
            data["causes"].append(line[2:].strip())

        elif current_section == "effect" and line.strip() and not line.startswith("**"):
            data["effect"] = line.strip()

        elif current_section == "hazard" and line.strip() and not line.startswith("**"):
            data["hazard"] = line.strip()

        elif current_section == "harm" and line.strip() and not line.startswith("**"):
            data["harm"] = line.strip()

        elif current_section == "code" and line.startswith("- "):
            code_ref = line[2:].strip().replace("`", "")
            data["code"].append(code_ref)

        elif current_section == "controls" and line.startswith("- "):
            control_text = line[2:].strip()
            if current_subsection == "design":
                data["design_controls"].append(control_text)
            elif current_subsection == "testing":
                data["testing_controls"].append(control_text)
            elif current_subsection == "training":
                data["training_controls"].append(control_text)
            elif current_subsection == "business":
                data["business_controls"].append(control_text)

    return data


def infer_hazard_type(hazard_name: str, description: str, hazard: str) -> list:
    """Infer hazard type from content."""
    text = f"{hazard_name} {description} {hazard}".lower()

    types = []

    if (
        "wrong patient" in text
        or "patient identity" in text
        or "patient confusion" in text
    ):
        types.append("WrongPatient")

    if "wrong patient context" in text or "stale" in text or "outdated" in text:
        types.append("WrongPatientContext")

    if "unavailable" in text or "not available" in text or "downtime" in text:
        types.append("Unavailable")

    if "delayed" in text or "slow" in text or "performance" in text:
        types.append("Delayed")

    if "unauthorized" in text or "security" in text or "authentication" in text:
        types.append("UnauthorizedAccess")

    if "data loss" in text or "lost" in text or "missing data" in text:
        types.append("DataLoss")

    if "incorrect" in text or "wrong" in text or "calculation" in text:
        types.append("IncorrectResult")

    # Default if nothing matched
    if not types:
        types.append("WrongPatientContext")

    return types


def generate_hazard_log(data: dict) -> str:
    """Generate DCB 0129/0160 compliant hazard log markdown."""

    # Infer hazard types
    hazard_types = infer_hazard_type(
        data["hazard_name"], data["description"], data["hazard"]
    )

    # Format causes as numbered list
    causes_text = "\n".join(f"{i+1}. {cause}" for i, cause in enumerate(data["causes"]))

    # Format hazard types as bullet list
    hazard_types_text = "\n".join(f"- {ht}" for ht in hazard_types)

    # Format code references with proper paths
    code_refs_text = "\n".join(f"- {code}" for code in data["code"])

    # Build hazard controls section
    controls = []

    if data["design_controls"]:
        controls.append("### Design controls (manufacturer)\n")
        controls.extend(f"- {ctrl}" for ctrl in data["design_controls"])
        controls.append("")

    if data["testing_controls"]:
        controls.append("### Testing controls (manufacturer)\n")
        controls.extend(f"- {ctrl}" for ctrl in data["testing_controls"])
        controls.append("")

    if data["training_controls"]:
        controls.append("### Training controls (deployment)\n")
        controls.extend(f"- {ctrl}" for ctrl in data["training_controls"])
        controls.append("")

    if data["business_controls"]:
        controls.append("### Business process controls (deployment)\n")
        controls.extend(f"- {ctrl}" for ctrl in data["business_controls"])

    controls_text = "\n".join(controls)

    # Generate the complete hazard log
    output = f"""# Hazard

> **DO NOT EDIT BELOW THIS LINE UNLESS YOU KNOW WHAT YOU ARE DOING**

---

## Hazard name

{data['hazard_name']}

---

## General utility label

[2]

---

## Likelihood scoring

TBC

---

## Severity scoring

TBC

---

## Description

{data['description']}

---

## Causes

{causes_text}

---

## Effect

{data['effect']}

---

## Hazard

{data['hazard']}

---

## Hazard type

{hazard_types_text}

---

## Harm

{data['harm']}

---

## Existing controls

None identified during initial analysis.

---

## Assignment

Clinical Safety Officer

---

## Labelling

TBC (awaiting scoring)

---

## Project

Clinical Risk Management

---

## Hazard controls

{controls_text}

---

## Residual hazard risk assessment

TBC — awaiting initial controls implementation.

---

## Hazard status

Draft from LLM

---

## Code associated with hazard

{code_refs_text}
"""

    return output


def process_all_hazards():
    """Process all hazard files from stage-5 and generate stage-6 outputs."""

    input_dir = Path(
        "/Users/markbailey/github/quillmedical/safety/hazard-analysis/outputs/stage-5-mitigations"
    )
    output_dir = Path(
        "/Users/markbailey/github/quillmedical/safety/hazard-analysis/outputs/stage-6-hazard-drafts"
    )

    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)

    # Find all hazard files
    hazard_files = sorted(input_dir.glob("hazard-*.md"))

    print(f"Found {len(hazard_files)} hazard files to process")

    processed = 0
    errors = []

    for hazard_file in hazard_files:
        try:
            # Read source file
            content = hazard_file.read_text()

            # Parse hazard data
            data = parse_hazard_file(content)

            # Extract hazard number
            hazard_num = data["hazard_id"].split("-")[1]

            # Generate output
            output_content = generate_hazard_log(data)

            # Write to stage-6 directory
            output_file = output_dir / f"Hazard-{hazard_num}.md"
            output_file.write_text(output_content)

            processed += 1
            print(f"✓ Processed {data['hazard_id']}: {data['hazard_name']}")

        except Exception as e:
            errors.append(f"{hazard_file.name}: {str(e)}")
            print(f"✗ Error processing {hazard_file.name}: {e}")

    print(f"\n{'='*60}")
    print("Stage 6 Complete:")
    print(f"  Processed: {processed} hazard log drafts")
    print(f"  Errors: {len(errors)}")

    if errors:
        print("\nErrors encountered:")
        for error in errors:
            print(f"  - {error}")
    else:
        print(
            "\n✓ All hazard files properly formatted and ready for DCB 0129/0160 compliance review"
        )

    return processed, errors


if __name__ == "__main__":
    process_all_hazards()

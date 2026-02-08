"""
Hazard Log Generator

Parses the hazard-log-template.md and hazard-types.md files, accepts field
values, and outputs a filled hazard log markdown file.

Template DSL:
    <!-- [icon] -->          Icon images placed at top, one per General utility label
    ### Header               Field name / label
    [multiselect]            Multi-select field; items on subsequent lines are options
    [select]                 Single-select field; items on subsequent lines are options
    [select] [L]             Single-select with a label [L] for cross-referencing
    [calculate] [L] [S]      Computed field using labelled fields; options have [L1-S2] matchers
    [hazard-types]           Pulls options from hazard-types.md
    [code]                   Code reference field; each line is a code link
    ---                      Section separator (rendered as-is)
    Plain text               Placeholder / description (replaced by provided value)

Usage:
    from hazard_log_generator import HazardLogGenerator

    gen = HazardLogGenerator(
        template_path="hazard-log-template.md",
        hazard_types_path="hazard-types.md",
    )

    # See gen.fields for available field names and their types/options

    gen.generate(
        output_path="hazards/HAZ-001.md",
        values={
            "Hazard name": "Wrong patient record displayed after tab switch",
            "General utility label": [2],  # New hazard for triage
            "Likelihood scoring": None,    # TBC - not scored yet
            "Severity scoring": None,      # TBC - not scored yet
            "Description": "When a clinician switches browser tabs...",
            "Cause(s)": "1. Browser tab caches previous patient context\\n2. ...",
            "Effect": "Clinician views clinical data for Patient A...",
            "Hazard": "Potential for clinical decisions to be made...",
            "Hazard type": ["WrongPatient", "WrongPatientContext"],
            "Harm": "Patient receives wrong treatment...",
            "Existing controls": "- Patient banner displayed on all screens\\n- ...",
            "Assignment": "Clinical Safety Officer",
            "Hazard status": "open",
            "Code associated with hazard": [
                "src/contexts/PatientContext.tsx:42",
                "src/components/PatientBanner.tsx:15",
            ],
        },
    )
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional


class FieldType(Enum):
    TEXT = "text"
    SELECT = "select"
    MULTISELECT = "multiselect"
    CALCULATE = "calculate"
    CODE = "code"
    ICON = "icon"
    SEPARATOR = "separator"
    PROSE = "prose"  # Non-field prose blocks (instructions, etc.)


@dataclass
class FieldOption:
    """A single option in a select/multiselect/calculate field."""

    key: str  # e.g. "1", "2", "TBC"
    label: str  # e.g. "Very low"
    description: str  # e.g. "Negligible or nearly negligible possibility of occurring"
    matchers: list[str] = field(
        default_factory=list
    )  # e.g. ["L1-S1", "L1-S2"] for calculate fields
    raw_line: str = ""  # The original line from the template


@dataclass
class TemplateField:
    """A parsed field from the template."""

    name: str
    field_type: FieldType
    labels: list[str] = field(default_factory=list)  # e.g. ["L"], ["S"], ["L", "S"]
    options: list[FieldOption] = field(default_factory=list)
    placeholder_text: str = ""  # The placeholder/description text
    uses_hazard_types: bool = False
    prose_lines: list[str] = field(default_factory=list)  # For PROSE type fields


# ---------------------------------------------------------------------------
# Hazard types parser
# ---------------------------------------------------------------------------


def parse_hazard_types(path: str | Path) -> list[str]:
    """
    Parse hazard-types.md and return a flat list of hazard type names.

    Expects lines like:
        ## Category heading
        - HazardTypeName
    """
    path = Path(path)
    types: list[str] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line.startswith("- "):
            types.append(line[2:].strip())
    return types


# ---------------------------------------------------------------------------
# Template parser
# ---------------------------------------------------------------------------


def parse_template(path: str | Path) -> list[TemplateField]:
    """
    Parse the hazard log template into a list of TemplateField objects.
    """
    path = Path(path)
    lines = path.read_text().splitlines()

    fields: list[TemplateField] = []
    current_field: Optional[TemplateField] = None
    in_field_type_options = False  # True after we've seen a [type] marker

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # --- Icon line ---
        if stripped.startswith("<!-- [icon] -->"):
            current_field = TemplateField(name="__icon__", field_type=FieldType.ICON)
            fields.append(current_field)
            current_field = None
            in_field_type_options = False
            i += 1
            continue

        # --- Section separator ---
        if stripped == "---":
            fields.append(
                TemplateField(name="__separator__", field_type=FieldType.SEPARATOR)
            )
            current_field = None
            in_field_type_options = False
            i += 1
            continue

        # --- Header line (new field) ---
        if stripped.startswith("### "):
            # Save any pending field
            field_name = stripped[4:].strip()
            current_field = TemplateField(name=field_name, field_type=FieldType.TEXT)
            fields.append(current_field)
            in_field_type_options = False
            i += 1
            continue

        # --- Empty line ---
        if not stripped:
            i += 1
            continue

        # --- Inside a field ---
        if current_field is not None:
            # Check for field type markers: [multiselect], [select], [calculate], [code]
            type_match = re.match(
                r"^\[(multiselect|select|calculate|code)\](.*)$", stripped
            )
            if type_match:
                type_str = type_match.group(1)
                remainder = type_match.group(2).strip()

                current_field.field_type = FieldType(type_str)

                # Parse labels like [L], [S] from remainder
                label_matches = re.findall(r"\[([A-Z])\]", remainder)
                current_field.labels = label_matches

                in_field_type_options = True
                i += 1
                continue

            # Check for [hazard-types] marker
            if stripped == "[hazard-types]":
                current_field.uses_hazard_types = True
                i += 1
                continue

            # If we're in a field that has a type and collecting options
            if in_field_type_options:
                # Parse option lines like "1 - Very low: Description [L1-S1, L2-S3]"
                # or "TBC"
                option_match = re.match(
                    r"^(\w+)\s*-\s*([^:\[]+?)(?::\s*(.+?))?(?:\s*\[([^\]]+)\])?\s*$",
                    stripped,
                )
                if option_match:
                    key = option_match.group(1)
                    label = option_match.group(2).strip()
                    description = (option_match.group(3) or "").strip()
                    matchers_str = option_match.group(4) or ""
                    matchers = [m.strip() for m in matchers_str.split(",") if m.strip()]
                    current_field.options.append(
                        FieldOption(
                            key=key,
                            label=label,
                            description=description,
                            matchers=matchers,
                            raw_line=stripped,
                        )
                    )
                    i += 1
                    continue
                elif stripped == "TBC":
                    current_field.options.append(
                        FieldOption(
                            key="TBC",
                            label="TBC",
                            description="To be confirmed",
                            raw_line=stripped,
                        )
                    )
                    i += 1
                    continue

            # Otherwise it's placeholder text or prose
            if current_field.field_type == FieldType.TEXT and not in_field_type_options:
                if current_field.placeholder_text:
                    current_field.placeholder_text += "\n" + stripped
                else:
                    current_field.placeholder_text = stripped
            else:
                # Prose within a typed field (e.g. instructions after options)
                # This can happen for prose blocks between separators
                current_field.prose_lines.append(stripped)

            i += 1
            continue

        # --- Prose outside any field (after a separator, before next header) ---
        # Create or append to a prose field
        if fields and fields[-1].field_type == FieldType.PROSE:
            fields[-1].prose_lines.append(stripped)
        elif fields and fields[-1].field_type == FieldType.SEPARATOR:
            prose_field = TemplateField(
                name="__prose__",
                field_type=FieldType.PROSE,
                prose_lines=[stripped],
            )
            fields.append(prose_field)
        else:
            # Orphan prose
            prose_field = TemplateField(
                name="__prose__",
                field_type=FieldType.PROSE,
                prose_lines=[stripped],
            )
            fields.append(prose_field)

        i += 1

    return fields


# ---------------------------------------------------------------------------
# Risk score calculator
# ---------------------------------------------------------------------------


def calculate_risk_score(
    likelihood_key: Optional[str],
    severity_key: Optional[str],
    calculate_field: TemplateField,
) -> Optional[FieldOption]:
    """
    Given likelihood and severity keys (e.g. "2", "3"), find the matching
    calculate option by looking up matchers like "L2-S3".
    Returns the matching FieldOption or None if inputs are TBC/None.
    """
    if not likelihood_key or not severity_key:
        return None
    if likelihood_key == "TBC" or severity_key == "TBC":
        return None

    target = f"L{likelihood_key}-S{severity_key}"
    for option in calculate_field.options:
        if target in option.matchers:
            return option
    return None


# ---------------------------------------------------------------------------
# Icon mapping
# ---------------------------------------------------------------------------

UTILITY_LABEL_ICONS = {
    1: "⚠️",  # Hazard (logged)
    2: "🆕",  # New hazard for triage
    3: "🚫",  # Deprecated hazard
}


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------


class HazardLogGenerator:
    """
    Reads the hazard log template and hazard types, and generates filled
    hazard log markdown files.
    """

    def __init__(
        self,
        template_path: str | Path,
        hazard_types_path: str | Path,
    ):
        self.template_path = Path(template_path)
        self.hazard_types_path = Path(hazard_types_path)
        self.hazard_types = parse_hazard_types(self.hazard_types_path)
        self.fields = parse_template(self.template_path)

        # Inject hazard types into any field that uses them
        for f in self.fields:
            if f.uses_hazard_types:
                f.options = [
                    FieldOption(key=ht, label=ht, description="", raw_line=f"- {ht}")
                    for ht in self.hazard_types
                ]

        # Build lookup by field name
        self._field_map: dict[str, TemplateField] = {}
        for f in self.fields:
            if not f.name.startswith("__"):
                self._field_map[f.name] = f

    @property
    def field_names(self) -> list[str]:
        """Return all user-facing field names."""
        return [f.name for f in self.fields if not f.name.startswith("__")]

    def get_field(self, name: str) -> Optional[TemplateField]:
        """Look up a field by name."""
        return self._field_map.get(name)

    def _format_select_value(
        self, field_def: TemplateField, value: Optional[int | str]
    ) -> str:
        """Format a select field value. Returns the full option line or TBC."""
        if value is None:
            return "TBC"
        key_str = str(value)
        for opt in field_def.options:
            if opt.key == key_str:
                return opt.raw_line or f"{opt.key} - {opt.label}: {opt.description}"
        return f"{value} (unrecognised option)"

    def _format_multiselect_value(
        self, field_def: TemplateField, values: Optional[list[int | str]]
    ) -> str:
        """Format a multiselect field value. Returns matched option lines."""
        if not values:
            return "None selected"
        lines = []
        for v in values:
            key_str = str(v)
            matched = False
            for opt in field_def.options:
                if opt.key == key_str:
                    lines.append(
                        opt.raw_line or f"{opt.key} - {opt.label}: {opt.description}"
                    )
                    matched = True
                    break
            if not matched:
                lines.append(f"- {v}")
        return "\n".join(lines)

    def _format_calculate_value(self, field_def: TemplateField, values: dict) -> str:
        """
        Compute a calculate field by looking up the labelled dependency fields
        in the provided values dict.
        """
        if len(field_def.labels) < 2:
            return "Cannot compute: insufficient labels defined"

        # Find the source fields referenced by labels (skip calculate fields
        # themselves — their labels are references, not declarations)
        label_to_field: dict[str, TemplateField] = {}
        for f in self.fields:
            if f.field_type == FieldType.CALCULATE:
                continue
            for lbl in f.labels:
                label_to_field[lbl] = f

        # Get the selected key for each labelled field
        label_values: dict[str, Optional[str]] = {}
        for lbl in field_def.labels:
            ref_field = label_to_field.get(lbl)
            if ref_field:
                val = values.get(ref_field.name)
                if val is not None:
                    label_values[lbl] = str(val)
                else:
                    label_values[lbl] = None
            else:
                label_values[lbl] = None

        # Check if any are TBC/None
        if any(v is None for v in label_values.values()):
            return "TBC (awaiting scoring of dependencies)"

        # Build the matcher key, e.g. "L2-S3"
        parts = []
        for lbl in field_def.labels:
            parts.append(f"{lbl}{label_values[lbl]}")
        target = "-".join(parts)

        for opt in field_def.options:
            if target in opt.matchers:
                return opt.raw_line or f"{opt.key} - {opt.label}: {opt.description}"

        return f"No matching risk level for {target}"

    def generate(
        self,
        output_path: str | Path,
        values: dict,
        hazard_id: Optional[str] = None,
    ) -> Path:
        """
        Generate a filled hazard log markdown file.

        Args:
            output_path: Path to write the output markdown file.
            values: Dict mapping field names to values.
                - TEXT fields: str
                - SELECT fields: int or str (the option key) or None for TBC
                - MULTISELECT fields: list of int/str (option keys)
                - CALCULATE fields: auto-computed, do not provide
                - CODE fields: list of str (code references)
            hazard_id: Optional hazard ID (e.g. "HAZ-001") to include in header.

        Returns:
            Path to the generated file.
        """
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        lines: list[str] = []

        # Optional hazard ID header
        if hazard_id:
            lines.append(f"# {hazard_id}")
            lines.append("")

        for field_def in self.fields:

            # --- Icon ---
            if field_def.field_type == FieldType.ICON:
                utility_values = values.get("General utility label", [])
                if isinstance(utility_values, list) and utility_values:
                    icons = " ".join(
                        UTILITY_LABEL_ICONS.get(v, "❓") for v in utility_values
                    )
                    lines.append(f"<!-- {icons} -->")
                else:
                    lines.append("<!-- ⚠️ -->")
                lines.append("")
                continue

            # --- Separator ---
            if field_def.field_type == FieldType.SEPARATOR:
                lines.append("---")
                lines.append("")
                continue

            # --- Prose ---
            if field_def.field_type == FieldType.PROSE:
                for prose_line in field_def.prose_lines:
                    lines.append(prose_line)
                lines.append("")
                continue

            # --- Named fields ---
            name = field_def.name
            value = values.get(name)

            lines.append(f"### {name}")
            lines.append("")

            if field_def.field_type == FieldType.TEXT:
                if value is not None:
                    lines.append(str(value))
                else:
                    lines.append(field_def.placeholder_text or "")
                lines.append("")

            elif field_def.field_type == FieldType.SELECT:
                lines.append(self._format_select_value(field_def, value))
                lines.append("")

            elif field_def.field_type == FieldType.MULTISELECT:
                if isinstance(value, list):
                    lines.append(self._format_multiselect_value(field_def, value))
                elif value is not None:
                    lines.append(self._format_multiselect_value(field_def, [value]))
                else:
                    lines.append("None selected")
                lines.append("")

            elif field_def.field_type == FieldType.CALCULATE:
                lines.append(self._format_calculate_value(field_def, values))
                lines.append("")

            elif field_def.field_type == FieldType.CODE:
                if isinstance(value, list) and value:
                    for code_ref in value:
                        lines.append(f"- `{code_ref}`")
                elif isinstance(value, str) and value:
                    lines.append(f"- `{value}`")
                else:
                    lines.append("No code references yet.")
                lines.append("")

            # Append any prose lines attached to this field
            if field_def.prose_lines:
                for prose_line in field_def.prose_lines:
                    lines.append(prose_line)
                lines.append("")

        content = "\n".join(lines)
        output_path.write_text(content)
        return output_path


# ---------------------------------------------------------------------------
# CLI / convenience
# ---------------------------------------------------------------------------


def main():
    """Quick demonstration of the generator."""
    gen = HazardLogGenerator(
        template_path=Path(__file__).parent / "hazard-log-template.md",
        hazard_types_path=Path(__file__).parent / "hazard-types.md",
    )

    print("Available fields:")
    for name in gen.field_names:
        f = gen.get_field(name)
        print(f"  {name} ({f.field_type.value})")
        if f.options:
            for opt in f.options[:3]:
                print(f"    {opt.key} - {opt.label}")
            if len(f.options) > 3:
                print(f"    ... and {len(f.options) - 3} more")

    # Generate an example hazard
    output = gen.generate(
        output_path=Path(__file__).parent / "example-output" / "HAZ-001.md",
        hazard_id="HAZ-001",
        values={
            "Hazard name": "Wrong patient record displayed after browser tab switch",
            "General utility label": [2],
            "Likelihood scoring": None,  # TBC
            "Severity scoring": None,  # TBC
            "Description": (
                "When a clinician has multiple browser tabs open with different "
                "patient records, switching between tabs may display cached data "
                "from a previous patient context, leading to clinical data being "
                "viewed or entered against the wrong patient."
            ),
            "Cause(s)": (
                "1. Browser tab caches previous patient context in local state\n"
                "2. React component does not re-fetch patient context on tab focus\n"
                "3. Service worker serves stale cached response"
            ),
            "Effect": (
                "Clinician views clinical data belonging to Patient A while "
                "believing they are viewing Patient B's record. Clinical decisions "
                "may be made based on incorrect data."
            ),
            "Hazard": (
                "Potential for clinical decisions to be made based on another "
                "patient's data, including treatment decisions, prescribing, "
                "and documentation."
            ),
            "Hazard type": ["WrongPatient", "WrongPatientContext"],
            "Harm": (
                "Patient receives wrong treatment, wrong medication, or has "
                "incorrect clinical information recorded in their record. "
                "Severity and likelihood TBC."
            ),
            "Existing controls": (
                "- Patient banner displayed on all clinical screens showing "
                "name, NHS number, DOB, and gender\n"
                "- UUID-based patient identifiers (not sequential)\n"
                "- Patient context provider in React application"
            ),
            "Assignment": "Clinical Safety Officer",
            "Labelling": "TBC (awaiting scoring)",
            "Project": "Clinical Risk Management",
            "New hazard controls": "TBC — awaiting CSO triage and assessment.",
            "Residual hazard risk assessment": "TBC — awaiting initial controls.",
            "Hazard status": "open",
            "Code associated with hazard": [
                "src/contexts/PatientContext.tsx",
                "src/components/PatientBanner/PatientBanner.tsx",
                "src/hooks/usePatientContext.ts",
            ],
        },
    )
    print(f"\nGenerated: {output}")
    print("\n--- Output ---\n")
    print(output.read_text())


if __name__ == "__main__":
    main()

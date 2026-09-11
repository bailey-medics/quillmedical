"""Turning records into the files a passport actually holds.

Every passport file is written here and read back here, so the YAML a
holder opens in a text editor is the responsibility of one module rather
than of whichever writer got there first.

Three things this module is careful about:

**Files are for people.** A passport is meant to be readable years later
with nothing but a text editor, so the output is block-style YAML with a
comment at the top saying what the file is. Keys keep the order the
model declares rather than being sorted alphabetically, because the
model's order is the order a person would read them in — what this
record is about, then when, then who. That is the opposite of the
canonical form used for hashing, and deliberately so: one is for
fingerprinting, the other is for reading.

**Nothing is dropped in a round trip.** Reading validates against the
same model that wrote it, so a hand-edited file that no longer fits is
refused rather than half-parsed. ``extra="forbid"`` means a field this
version does not know about is an error, not a silent deletion.

**A reflection is prose with structure attached, not the reverse.** It
is the one record whose substance is the writing, so its fields live in
frontmatter above the text rather than in a separate file. The split has
to survive a body that itself contains ``---``, which is why the parser
counts the opening delimiter rather than splitting on every occurrence.
"""

from __future__ import annotations

from typing import Any, TypeVar

import yaml
from pydantic import BaseModel, ValidationError

from .schemas import PassportModel, Reflection

# A TypeVar rather than PEP 695 type parameters: mypy in this repo does
# not yet parse the newer syntax, and a module the whole passport depends
# on is the wrong place to be first.
Model = TypeVar("Model", bound=PassportModel)

#: What separates a reflection's frontmatter from its prose.
FRONTMATTER_DELIMITER = "---"


class RecordFormatError(ValueError):
    """A passport file could not be read as the record it should be.

    Its own type so a caller can tell "this file is malformed" from "this
    file is missing". A passport that has been hand-edited into an
    invalid state should say so clearly rather than surfacing a parser's
    internal complaint.
    """


class _BlockDumper(yaml.SafeDumper):
    """A dumper that indents lists under their key.

    PyYAML's default puts a list's dashes at the same indentation as the
    key, which is valid YAML and reads badly:

    .. code-block:: yaml

        attachments:
        - hash: sha256:…

    A passport is meant to be read by people, so lists are indented.
    """

    def increase_indent(  # noqa: FBT001, FBT002 - PyYAML's own signature
        self,
        flow: bool = False,
        indentless: bool = False,  # cspell:ignore indentless
    ) -> None:
        """Always indent, even for a block sequence."""
        super().increase_indent(flow=flow, indentless=False)


def _represent_str(dumper: yaml.SafeDumper, data: str) -> yaml.ScalarNode:
    """Write multi-line strings as readable blocks.

    A clinical note with paragraphs in it would otherwise become one
    long line with ``\\n`` escapes, which is unreadable in the file that
    is supposed to be the durable record.
    """
    if "\n" in data:
        return dumper.represent_scalar(
            "tag:yaml.org,2002:str", data, style="|"
        )
    return dumper.represent_scalar("tag:yaml.org,2002:str", data)


_BlockDumper.add_representer(str, _represent_str)


def _plain(model: BaseModel) -> dict[str, Any]:
    """A model as plain data, ready for YAML.

    Args:
        model: Any passport record.

    Returns:
        Its fields, with unset optionals dropped so a file carries what
        it says rather than a column of ``null``s. Dates and enums become
        strings, since a passport must not need Python to be read.
    """
    return model.model_dump(mode="json", exclude_none=True)


def to_yaml(model: BaseModel, *, comment: str | None = None) -> str:
    """Render a record as the YAML that will be committed.

    Args:
        model: The record.
        comment: A one-line description written at the top, so somebody
            opening the file knows what they are holding before reading
            a single field.

    Returns:
        The file's contents, ending in a newline.
    """
    body = yaml.dump(
        _plain(model),
        Dumper=_BlockDumper,
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
        width=72,
    )

    if comment is None:
        return body

    return f"# {comment}\n{body}"


def from_yaml(  # noqa: UP047 - see the TypeVar note above
    model_type: type[Model], content: str | bytes
) -> Model:
    """Read a record back, validating it against its model.

    Args:
        model_type: The model the file should hold.
        content: The file's contents.

    Returns:
        The validated record.

    Raises:
        RecordFormatError: If the file is not YAML, does not hold a
            mapping, or does not fit the model. All three mean the same
            thing to a caller — this file cannot be trusted as this kind
            of record — so they are one error type carrying the detail.
    """
    text = content.decode() if isinstance(content, bytes) else content

    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as error:
        raise RecordFormatError(f"Not valid YAML: {error}") from error

    if not isinstance(data, dict):
        raise RecordFormatError(
            f"Expected a {model_type.__name__} mapping, found "
            f"{type(data).__name__}."
        )

    try:
        return model_type.model_validate(data)
    except ValidationError as error:
        raise RecordFormatError(
            f"Not a valid {model_type.__name__}: {error}"
        ) from error


def reflection_to_markdown(reflection: Reflection, body: str) -> str:
    """Render a reflection: frontmatter, then the writing.

    Args:
        reflection: Its structured fields.
        body: The prose, which is the substance of the record.

    Returns:
        The file's contents. The body is written verbatim — including
        any ``---`` it contains, which the reader handles — because
        reformatting somebody's reflection would change what they wrote.
    """
    frontmatter = yaml.dump(
        _plain(reflection),
        Dumper=_BlockDumper,
        default_flow_style=False,
        sort_keys=False,
        allow_unicode=True,
        width=72,
    )

    text = body if body.endswith("\n") else f"{body}\n"

    return (
        f"{FRONTMATTER_DELIMITER}\n"
        f"{frontmatter}"
        f"{FRONTMATTER_DELIMITER}\n\n"
        f"{text}"
    )


def reflection_from_markdown(content: str | bytes) -> tuple[Reflection, str]:
    """Read a reflection back: its fields and its prose.

    Args:
        content: The file's contents.

    Returns:
        The validated frontmatter and the body.

    Raises:
        RecordFormatError: If there is no frontmatter block, or it does
            not fit the model. A reflection without frontmatter has no
            date and no title, so it cannot be placed in a passport even
            though the prose is intact.
    """
    text = content.decode() if isinstance(content, bytes) else content

    if not text.startswith(f"{FRONTMATTER_DELIMITER}\n"):
        raise RecordFormatError(
            "A reflection must begin with a '---' frontmatter block "
            "carrying at least its title and date."
        )

    # Split on the *closing* delimiter only — the first one that starts a
    # line after the opening. A reflection's prose may legitimately
    # contain '---' as a horizontal rule, and splitting on every
    # occurrence would truncate somebody's writing at the first one.
    remainder = text[len(FRONTMATTER_DELIMITER) + 1 :]
    closing = remainder.find(f"\n{FRONTMATTER_DELIMITER}\n")

    if closing == -1:
        raise RecordFormatError(
            "A reflection's frontmatter block is not closed by a second "
            "'---' on its own line."
        )

    frontmatter = remainder[: closing + 1]
    body = remainder[closing + len(FRONTMATTER_DELIMITER) + 2 :]

    return from_yaml(Reflection, frontmatter), body.lstrip("\n")

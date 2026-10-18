"""What an uploaded piece of evidence may contain, beyond its type.

``_looks_like`` in the router checks that a file begins the way its
declared type says it should. This module looks further in, for the one
type where the contents can do something rather than show something: a
PDF may carry JavaScript, an action that runs on opening, a launched
program or an embedded file, and an assessor's browser is what opens it.
"""

from __future__ import annotations

import re

#: The PDF name tokens that make a document act rather than display.
#:
#: ``JavaScript`` and ``JS`` are script; ``OpenAction`` and ``AA`` run an
#: action on opening or on an event; ``Launch`` starts a program;
#: ``EmbeddedFile`` and ``EmbeddedFiles`` attach another file;
#: ``RichMedia`` is Flash and video; ``XFA`` is a form language with its
#: own scripting. ``Encrypt`` is not active, but an encrypted PDF cannot
#: be rendered into the passport export, so it is refused here, at
#: upload, rather than failing the export later.
#:
#: A name ends at whitespace or a delimiter, which the lookahead
#: enforces: ``/AAPL:Keywords``, written by macOS, is not ``/AA``.
_ACTIVE_CONTENT = re.compile(
    rb"/(JavaScript|JS|OpenAction|AA|Launch|EmbeddedFiles?|RichMedia"
    rb"|XFA|Encrypt)(?=[\s()<>\[\]{}/%]|$)"
)


def pdf_active_content(data: bytes) -> str | None:
    """The first token in *data* that would make a PDF act, or None.

    A byte scan rather than a PDF parser, for the reason ``_looks_like``
    is a short table rather than a library: a parser is a supply-chain
    surface reading hostile input in the API process, for one allow-list.

    The scan's limit, stated plainly: a token inside a compressed object
    stream (``/ObjStm``) is invisible to it, so a PDF written to hide
    one passes. That is why the ``Content-Security-Policy: sandbox``
    header on the route that serves evidence is the control that holds,
    and this scan is what gives a holder a clear reason in the ordinary
    case.

    Returns the token with its leading slash, for the refusal to name.
    """
    match = _ACTIVE_CONTENT.search(data)

    if match is None:
        return None

    return match.group(0).decode("ascii")

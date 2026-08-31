"""Shared Pydantic annotations for content schemas.

Both the module and certificate schemas parse YAML authored outside this
repository, and both need the same guard against Python's ``bool``/``int``
relationship.  Defining it once here keeps the two in step.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import BeforeValidator


def reject_bool(value: object) -> object:
    """Reject booleans where a number is expected.

    ``bool`` subclasses ``int`` in Python, so without this a YAML
    ``size: yes`` or ``version: yes`` would silently validate as ``1``.
    """
    if isinstance(value, bool):
        raise ValueError("must be a number, not a boolean")
    return value


#: A float that will not silently accept a YAML boolean.
Number = Annotated[float, BeforeValidator(reject_bool)]

#: An int that will not silently accept a YAML boolean.
Whole = Annotated[int, BeforeValidator(reject_bool)]

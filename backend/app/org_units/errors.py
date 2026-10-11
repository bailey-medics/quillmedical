"""Why something asked of an org unit was refused.

The same shape as ``UserAdminError`` in :mod:`app.users.errors`. Each
refusal is a class that fixes its own words and status, so nothing can
reach a caller that somebody did not write for them to read.

All but three take no arguments. Those three name catalogue ids:

- :class:`NobodyPractisesHere` names an org unit type from
  ``shared/org-unit-types.yaml``. It is read from the org unit's row,
  where ``validate_org_unit_type`` checked it as it was written.
- :class:`CompetencyNotHeld` names one competency id from
  ``shared/competency-definitions/``, which the request model checked
  against the catalogue as the request was read.
- :class:`CompetenciesOutOfScope` lists competency ids. Where a
  competency is being granted or authorised, the request model checked
  each one the same way. **Withdrawing is the exception**: that route
  takes the id from its path and checks it against nothing, so that a
  row can always be taken away, and a caller acting through a scoped
  manager is handed back the id as they typed it.

Nothing else may be passed: no account id, no org unit id, no name, and
nothing read from a person's own text.

``app.main`` registers one handler for :class:`OrgUnitError`, which
answers with the class's status and ``{"detail": message}``. That is the
body an ``HTTPException`` gives, so a rule moved out of a route answers
exactly as it did inside it.
"""


class OrgUnitError(Exception):
    """Something asked of an org unit that may not, or cannot, be done.

    A subclass fixes ``message`` as a class attribute and is raised with
    no arguments. The three that name catalogue ids build their own
    words and hand them up.
    """

    status_code: int = 400
    message: str = "The request could not be completed"

    def __init__(self, message: str | None = None) -> None:
        if message is not None:
            self.message = message

        super().__init__(self.message)


class OrgUnitNotFound(OrgUnitError):
    """An org unit the caller named that is not theirs to see.

    The words are the same whether no org unit has that id or one does
    outside what the caller may see, so the answer never confirms that
    an org unit exists to somebody who may not see it.
    """

    status_code = 404
    message = "Place not found"


class MemberNotFound(OrgUnitError):
    """Somebody named who is not a member of the org unit.

    One refusal for two reasons, in the same words: nobody has that id,
    or somebody does and is not a member here. The answer does not say
    which.
    """

    status_code = 404
    message = "Member not found"


class UserNotFound(OrgUnitError):
    status_code = 404
    message = "User not found"


class CompetenciesOutOfScope(OrgUnitError):
    """Competencies the caller may not grant or remove, named by id.

    The same refusal, in the same words, as the one of this name in
    :mod:`app.users.errors`, which the people routes give.
    """

    status_code = 403

    def __init__(self, refused: list[str]) -> None:
        super().__init__(
            "You may not grant or remove: " + ", ".join(refused) + "."
        )


class NobodyPractisesHere(OrgUnitError):
    """An org unit whose type holds no competencies, named by its type."""

    status_code = 422

    def __init__(self, unit_type: str) -> None:
        super().__init__(f"Nobody practises anything at a {unit_type}.")


class CompetencyNotHeld(OrgUnitError):
    """A competency somebody does not hold, so cannot practise anywhere."""

    status_code = 422

    def __init__(self, competency: str) -> None:
        super().__init__(
            f"They do not hold {competency}, so it cannot be "
            "authorised here. Grant it to them first."
        )

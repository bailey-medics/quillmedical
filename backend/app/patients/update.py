"""What a change to a patient's demographics sends to FHIR.

The request names things as FHIR does, ``birth_date`` and ``gender``.
``update_fhir_patient`` in :mod:`app.fhir_client` takes them under the
names the demographics form uses, ``date_of_birth`` and ``sex``. This
is where one becomes the other.

Whether the patient exists, and whether the update took, are asked of
FHIR by the route.
"""


def changes_to_send(
    *,
    given_name: str | None,
    family_name: str | None,
    birth_date: str | None,
    gender: str | None,
) -> dict[str, str]:
    """The update dict in the format ``update_fhir_patient`` expects.

    Only these four can be changed. Anything else the request carried,
    an NHS number among them, is not sent.

    Args:
        given_name: The given name, or nothing to leave it alone.
        family_name: The family name, or nothing to leave it alone.
        birth_date: The date of birth, or nothing to leave it alone.
        gender: The gender, or nothing to leave it alone.

    Returns:
        The values to send, under FHIR client's names. A value that is
        None or empty is left out, so a field cannot be cleared this
        way, and the answer is empty where every value is.
    """
    updates: dict[str, str] = {}

    if given_name:
        updates["given_name"] = given_name
    if family_name:
        updates["family_name"] = family_name
    if birth_date:
        updates["date_of_birth"] = birth_date
    if gender:
        updates["sex"] = gender

    return updates

"""What a change to a patient's demographics sends to FHIR.

Every value here is made up.
"""

from app.patients.update import changes_to_send


def test_all_four_are_sent_under_the_names_the_fhir_client_takes() -> None:
    assert changes_to_send(
        given_name="Given",
        family_name="Family",
        birth_date="1900-01-01",
        gender="unknown",
    ) == {
        "given_name": "Given",
        "family_name": "Family",
        "date_of_birth": "1900-01-01",
        "sex": "unknown",
    }


def test_a_date_of_birth_and_gender_not_given_are_not_sent() -> None:
    assert changes_to_send(
        given_name="Given",
        family_name="Family",
        birth_date=None,
        gender=None,
    ) == {"given_name": "Given", "family_name": "Family"}


def test_a_date_of_birth_alone_is_sent_alone() -> None:
    assert changes_to_send(
        given_name=None,
        family_name=None,
        birth_date="1900-01-01",
        gender=None,
    ) == {"date_of_birth": "1900-01-01"}


def test_a_gender_alone_is_sent_alone() -> None:
    assert changes_to_send(
        given_name=None,
        family_name=None,
        birth_date=None,
        gender="other",
    ) == {"sex": "other"}


def test_an_empty_value_is_left_out_and_so_clears_nothing() -> None:
    assert changes_to_send(
        given_name="",
        family_name="Family",
        birth_date="",
        gender="",
    ) == {"family_name": "Family"}


def test_nothing_given_sends_nothing() -> None:
    assert (
        changes_to_send(
            given_name="",
            family_name="",
            birth_date=None,
            gender=None,
        )
        == {}
    )


def test_a_value_is_sent_as_given_and_not_checked() -> None:
    assert changes_to_send(
        given_name="  Given  ",
        family_name=None,
        birth_date="not a date",
        gender="NOT A GENDER",
    ) == {
        "given_name": "  Given  ",
        "date_of_birth": "not a date",
        "sex": "NOT A GENDER",
    }

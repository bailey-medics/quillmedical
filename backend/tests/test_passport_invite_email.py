"""The passport assessor invitation, rendered in the branded layout."""

from app.features.passport.email_templates import InviteEmail, render_invite


def _invite(
    competency: str | None = "Chest drain insertion",
) -> InviteEmail:
    rendered = render_invite(
        assessor_name="Dr James Okafor",
        holder_name="Dr Priya Shah",
        competency_name=competency,
        url="https://example.com/accept?token=t",
        expires_in_days=14,
    )
    return rendered


def test_names_the_competency_when_there_is_one() -> None:
    invite = _invite()

    assert invite["subject"] == (
        "Dr Priya Shah has asked you to assess a competency"
    )
    assert "<strong>Chest drain insertion</strong>" in invite["html_body"]


def test_asks_them_to_be_an_assessor_when_there_is_no_competency() -> None:
    invite = _invite(competency=None)

    assert invite["subject"] == "Dr Priya Shah has asked you to be an assessor"
    assert "act as an assessor" in invite["text_body"]


def test_says_the_link_lasts_until_accepted_not_one_use() -> None:
    # Only accept_assessor_invite is single use; the link can be opened
    # any number of times before that.
    invite = _invite()

    assert "can be used once" not in invite["html_body"]
    assert (
        "You can use this link until you accept the invitation. "
        "It expires in 14 days." in invite["text_body"]
    )


def test_escapes_names_the_holder_typed() -> None:
    rendered = render_invite(
        assessor_name="<img src=x onerror=alert(1)>",
        holder_name="Dr Priya Shah",
        competency_name=None,
        url="https://example.com/accept?token=t",
        expires_in_days=14,
    )

    assert "<img src=x" not in rendered["html_body"]
    assert "&lt;img src=x onerror=alert(1)&gt;" in rendered["html_body"]


def test_mentions_no_patient() -> None:
    invite = _invite()

    assert "patient" not in invite["html_body"].lower()

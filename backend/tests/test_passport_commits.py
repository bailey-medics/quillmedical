"""Tests for app/features/passport/commits.py.

A commit message is the part of the record git keeps, so the refusals
matter more than the rendering. The one that matters most is the newline:
a trailer value carrying one would let a caller forge a second trailer,
which is how a commit message comes to assert something nobody wrote.
"""

from __future__ import annotations

import pytest

from app.features.passport import commits
from app.features.passport.commits import Actor, CommitMessageError


def _actor(**overrides: object) -> Actor:
    fields: dict[str, object] = {
        "name": "Dr Amara Okonkwo",
        "role": "Consultant",
        "email": "amara@example.nhs.uk",
        "registrations": ("GMC 1234567",),
    }
    fields.update(overrides)
    return Actor(**fields)  # type: ignore[arg-type]


class TestSubject:
    def test_carries_the_action_and_summary(self) -> None:
        message = commits.build("sign-off", "bronchoscopy", _actor())

        assert message.subject == "passport:sign-off: bronchoscopy"

    def test_refuses_an_empty_summary(self) -> None:
        with pytest.raises(CommitMessageError, match="must not be empty"):
            commits.build("create", "", _actor())

    def test_refuses_a_subject_too_long_for_git(self) -> None:
        with pytest.raises(CommitMessageError, match="over the"):
            commits.build("sign-off", "x" * 100, _actor())

    def test_refuses_a_multi_line_summary(self) -> None:
        """A newline would put the rest of the summary in the body, where
        it would read as narrative the record does not hold."""
        with pytest.raises(CommitMessageError, match="single line"):
            commits.build("create", "first\nsecond", _actor())


class TestTrailers:
    def test_renders_the_actor(self) -> None:
        message = commits.build("create", "new passport", _actor())

        rendered = message.render()

        assert "Actor-Name: Dr Amara Okonkwo" in rendered
        assert "Actor-Role: Consultant" in rendered

    def test_one_trailer_per_registration(self) -> None:
        """A reader grepping for a GMC number should find it on a line of
        its own, not inside a joined list."""
        actor = _actor(registrations=("GMC 1234567", "NMC 98765"))

        rendered = commits.build("create", "new passport", actor).render()

        assert "Actor-Registration: GMC 1234567" in rendered
        assert "Actor-Registration: NMC 98765" in rendered

    def test_an_actor_with_no_registrations_renders_none(self) -> None:
        actor = _actor(registrations=())

        rendered = commits.build("create", "new passport", actor).render()

        assert "Actor-Registration" not in rendered

    def test_care_location_is_optional(self) -> None:
        with_location = commits.build(
            "create", "new passport", _actor(care_location="Bristol Royal")
        ).render()
        without = commits.build("create", "new passport", _actor()).render()

        assert "Care-Location: Bristol Royal" in with_location
        assert "Care-Location" not in without

    def test_competency_and_sign_off_are_rendered(self) -> None:
        rendered = commits.build(
            "sign-off",
            "bronchoscopy",
            _actor(),
            competency="perform_bronchoscopy",
            sign_off="2026-03-14-perform-bronchoscopy",
        ).render()

        assert "Competency: perform_bronchoscopy" in rendered
        assert "Sign-Off: 2026-03-14-perform-bronchoscopy" in rendered

    def test_there_is_no_body(self) -> None:
        """A passport commit carries structured facts, not narrative."""
        rendered = commits.build("create", "new passport", _actor()).render()

        subject, _, trailers = rendered.partition("\n\n")

        assert subject == "passport:create: new passport"
        for line in trailers.strip().splitlines():
            assert ": " in line


class TestInjectionRefusals:
    """The reason trailer values are validated rather than sanitised."""

    @pytest.mark.parametrize(
        "hostile",
        [
            "Dr X\nActor-Role: Consultant",
            "Dr X\rActor-Role: Consultant",
            "Dr X\n\nBody text",
        ],
    )
    def test_a_newline_in_a_name_is_refused(self, hostile: str) -> None:
        """Otherwise one trailer could forge another."""
        with pytest.raises(CommitMessageError, match="single line"):
            commits.build("create", "new passport", _actor(name=hostile))

    def test_a_newline_in_a_registration_is_refused(self) -> None:
        with pytest.raises(CommitMessageError, match="single line"):
            commits.build(
                "create",
                "new passport",
                _actor(registrations=("GMC 1\nActor-Role: Professor",)),
            )

    def test_a_newline_in_a_care_location_is_refused(self) -> None:
        with pytest.raises(CommitMessageError, match="single line"):
            commits.build(
                "create",
                "new passport",
                _actor(care_location="Ward 5\nCompetency: prescribe_sact"),
            )

    def test_surrounding_whitespace_is_refused_not_trimmed(self) -> None:
        """Stripping would change what the record says, and silently."""
        with pytest.raises(CommitMessageError, match="whitespace"):
            commits.build("create", "new passport", _actor(name="  Dr X  "))

    def test_an_empty_trailer_value_is_refused(self) -> None:
        with pytest.raises(CommitMessageError, match="must not be empty"):
            commits.build("create", "new passport", _actor(role=""))

    def test_a_path_shaped_competency_is_refused(self) -> None:
        with pytest.raises(CommitMessageError, match="flat slug"):
            commits.build(
                "sign-off",
                "a thing",
                _actor(),
                competency="prescribing/chemotherapy",
            )


class TestParseTrailers:
    def test_reads_back_what_was_written(self) -> None:
        message = commits.build(
            "sign-off",
            "bronchoscopy",
            _actor(registrations=("GMC 1234567", "NMC 98765")),
            competency="perform_bronchoscopy",
        )

        parsed = commits.parse_trailers(message.render())

        assert parsed[commits.ACTOR_NAME] == ["Dr Amara Okonkwo"]
        assert parsed[commits.ACTOR_REGISTRATION] == [
            "GMC 1234567",
            "NMC 98765",
        ]
        assert parsed[commits.COMPETENCY] == ["perform_bronchoscopy"]

    def test_ignores_a_key_this_module_does_not_render(self) -> None:
        """Anything else came from outside the application, and treating
        it as a trailer would give it standing it has not earned."""
        message = (
            "passport:create: a thing\n\n"
            "Actor-Name: Dr X\n"
            "Signed-Off-By: Somebody Else\n"
        )

        parsed = commits.parse_trailers(message)

        assert "Signed-Off-By" not in parsed
        assert parsed[commits.ACTOR_NAME] == ["Dr X"]

    def test_a_message_with_no_trailers_parses_empty(self) -> None:
        assert commits.parse_trailers("passport:create: a thing\n") == {}

"""The marketing choice at registration, and changing it in Settings."""

import pytest
from sqlalchemy import select

from app.marketing.preferences import MARKETING_WORDING_VERSION
from app.models import MarketingPreferenceChange, User
from app.security import create_password_reset_token

PREFERENCE_URL = "/api/marketing/preference"


def _register(test_client, name, **extra):
    return test_client.post(
        "/api/auth/register",
        json={
            "username": name,
            "email": f"{name}@example.com",
            "password": "SecurePassword123!",
            **extra,
        },
    )


def _user(db_session, name):
    return db_session.scalar(select(User).where(User.username == name))


def _changes(db_session, user):
    return list(
        db_session.execute(
            select(MarketingPreferenceChange)
            .where(MarketingPreferenceChange.user_id == user.id)
            .order_by(MarketingPreferenceChange.id)
        )
        .scalars()
        .all()
    )


@pytest.fixture
def signed_in(authenticated_client):
    """The signed-in client, sending its CSRF token as a browser would."""
    authenticated_client.headers["X-CSRF-Token"] = (
        authenticated_client.cookies.get("XSRF-TOKEN")
    )
    return authenticated_client


class TestRegistering:
    def test_leaving_the_box_unticked_means_news_is_sent(
        self, test_client, db_session
    ):
        response = _register(test_client, "keen", marketing_opt_out=False)

        assert response.status_code == 200, response.text
        user = _user(db_session, "keen")
        assert user.marketing_emails is True
        [row] = _changes(db_session, user)
        assert row.source == "registration"
        assert row.wants_marketing is True
        assert row.wording_version == MARKETING_WORDING_VERSION

    def test_ticking_the_box_means_it_is_not(self, test_client, db_session):
        response = _register(test_client, "private", marketing_opt_out=True)

        assert response.status_code == 200, response.text
        user = _user(db_session, "private")
        assert user.marketing_emails is False
        # Recorded although off is where an account starts: being shown
        # the question and refusing is not the same as never being asked.
        [row] = _changes(db_session, user)
        assert row.source == "registration"
        assert row.wants_marketing is False
        assert row.wording_version == MARKETING_WORDING_VERSION

    def test_a_form_that_never_showed_the_box_subscribes_nobody(
        self, test_client, db_session
    ):
        """A tab left open on the older form sends no answer at all."""
        response = _register(test_client, "old_tab")

        assert response.status_code == 200, response.text
        user = _user(db_session, "old_tab")
        assert user.marketing_emails is False
        assert _changes(db_session, user) == []


class TestAnAccountAnAdminMade:
    def test_is_not_subscribed(
        self, authenticated_superadmin_client, db_session
    ):
        response = authenticated_superadmin_client.post(
            "/api/users",
            json={
                "name": "Made By Admin",
                "email": "made@example.com",
                "username": "made",
                "password": "SecurePassword123!",
                "base_profession": "teaching_delegate",
                "additional_competencies": [],
                "removed_competencies": [],
                "platform_role": "standard",
                "org_unit_ids": [],
            },
        )

        assert response.status_code in (200, 201), response.text
        user = _user(db_session, "made")
        assert user.marketing_emails is False
        assert _changes(db_session, user) == []


class TestSettingAFirstPasswordFromAnInvite:
    """Somebody whose account was made for them is asked here instead."""

    URL = "/api/auth/reset-password"

    def _reset(self, test_client, user, **extra):
        return test_client.post(
            self.URL,
            json={
                "token": create_password_reset_token(user.email),
                "new_password": "ANewPassword123!",
                **extra,
            },
        )

    def test_leaving_the_box_unticked_means_news_is_sent(
        self, test_client, db_session, test_user
    ):
        test_user.email_verified = True
        db_session.commit()

        response = self._reset(test_client, test_user, marketing_opt_out=False)

        assert response.status_code == 200, response.text
        db_session.refresh(test_user)
        assert test_user.marketing_emails is True
        [row] = _changes(db_session, test_user)
        assert row.source == "invite"
        assert row.wants_marketing is True
        assert row.wording_version == MARKETING_WORDING_VERSION

    def test_ticking_the_box_is_recorded_as_a_refusal(
        self, test_client, db_session, test_user
    ):
        test_user.email_verified = True
        db_session.commit()

        response = self._reset(test_client, test_user, marketing_opt_out=True)

        assert response.status_code == 200, response.text
        db_session.refresh(test_user)
        assert test_user.marketing_emails is False
        [row] = _changes(db_session, test_user)
        assert row.source == "invite"
        assert row.wants_marketing is False

    def test_an_ordinary_reset_asks_nothing_and_changes_nothing(
        self, test_client, db_session, test_user
    ):
        test_user.marketing_emails = True
        test_user.email_verified = True
        db_session.commit()

        response = self._reset(test_client, test_user)

        assert response.status_code == 200, response.text
        db_session.refresh(test_user)
        assert test_user.marketing_emails is True
        assert _changes(db_session, test_user) == []

    def test_an_unverified_address_still_has_its_answer_recorded(
        self, test_client, db_session, test_user
    ):
        """Recorded now; the newsletter is only sent once it is verified."""
        test_user.email_verified = False
        db_session.commit()

        self._reset(test_client, test_user, marketing_opt_out=False)

        db_session.refresh(test_user)
        assert test_user.marketing_emails is True

    def test_a_bad_token_changes_nothing(
        self, test_client, db_session, test_user
    ):
        response = test_client.post(
            self.URL,
            json={
                "token": "forged",
                "new_password": "ANewPassword123!",
                "marketing_opt_out": False,
            },
        )

        assert response.status_code == 400
        db_session.refresh(test_user)
        assert test_user.marketing_emails is False
        assert _changes(db_session, test_user) == []


class TestTheInviteEmail:
    def test_its_link_says_it_is_an_invite(
        self, authenticated_superadmin_client, db_session, monkeypatch
    ):
        """That is what makes the page ask the marketing question."""
        from app import main

        sent: list[dict] = []
        monkeypatch.setattr(main, "send_email", lambda **kw: sent.append(kw))
        user = User(
            username="invited",
            email="invited@example.com",
            password_hash="x",
            email_verified=True,
        )
        db_session.add(user)
        db_session.commit()

        response = authenticated_superadmin_client.post(
            f"/api/users/{user.id}/send-invite"
        )

        assert response.status_code == 200, response.text
        [email] = sent
        assert "/reset-password?token=" in email["html_body"]
        assert "invite=1" in email["html_body"]


class TestMe:
    def test_says_whether_news_is_sent(
        self, authenticated_client, db_session, test_user
    ):
        assert (
            authenticated_client.get("/api/auth/me").json()["marketing_emails"]
            is False
        )

        test_user.marketing_emails = True
        db_session.commit()

        assert (
            authenticated_client.get("/api/auth/me").json()["marketing_emails"]
            is True
        )


class TestChangingItInSettings:
    def test_switching_on(self, signed_in, db_session, test_user):
        response = signed_in.put(
            PREFERENCE_URL, json={"wants_marketing": True}
        )

        assert response.status_code == 200, response.text
        assert response.json() == {"marketing_emails": True}
        db_session.refresh(test_user)
        assert test_user.marketing_emails is True
        [row] = _changes(db_session, test_user)
        assert row.source == "settings"

    def test_switching_off(self, signed_in, db_session, test_user):
        test_user.marketing_emails = True
        test_user.email_verified = True
        db_session.commit()

        response = signed_in.put(
            PREFERENCE_URL, json={"wants_marketing": False}
        )

        assert response.status_code == 200, response.text
        assert response.json() == {"marketing_emails": False}
        db_session.refresh(test_user)
        assert test_user.marketing_emails is False
        [row] = _changes(db_session, test_user)
        assert row.source == "settings"
        assert row.wants_marketing is False

    def test_an_unverified_address_can_still_choose(
        self, signed_in, db_session, test_user
    ):
        test_user.email_verified = False
        db_session.commit()

        response = signed_in.put(
            PREFERENCE_URL, json={"wants_marketing": True}
        )

        assert response.status_code == 200, response.text
        db_session.refresh(test_user)
        assert test_user.marketing_emails is True

    def test_saving_the_same_answer_does_nothing(
        self, signed_in, db_session, test_user
    ):
        test_user.email_verified = True
        db_session.commit()

        response = signed_in.put(
            PREFERENCE_URL, json={"wants_marketing": False}
        )

        assert response.status_code == 200
        assert _changes(db_session, test_user) == []

    def test_needs_a_session(self, test_client):
        response = test_client.put(
            PREFERENCE_URL, json={"wants_marketing": True}
        )

        assert response.status_code == 401

    def test_needs_a_csrf_token(self, authenticated_client):
        response = authenticated_client.put(
            PREFERENCE_URL, json={"wants_marketing": True}
        )

        assert response.status_code == 403

    def test_refuses_an_unexpected_field(self, signed_in):
        response = signed_in.put(
            PREFERENCE_URL,
            json={"wants_marketing": True, "source": "resend"},
        )

        assert response.status_code == 422

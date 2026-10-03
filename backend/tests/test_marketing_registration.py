"""The marketing choice at registration, and changing it in Settings."""

import pytest
from sqlalchemy import select

from app.marketing import router as marketing_router
from app.marketing.preferences import MARKETING_WORDING_VERSION
from app.marketing.resend_contacts import MarketingSyncError
from app.models import MarketingPreferenceChange, User

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
def resend(monkeypatch):
    """Resend's side of a Settings change, recorded, and able to fail."""
    state = {"synced": [], "error": False}

    def sync_contact(user):
        if state["error"]:
            raise MarketingSyncError("Resend refused: HTTP 500")
        state["synced"].append((user.id, user.marketing_emails))
        return True

    monkeypatch.setattr(marketing_router, "sync_contact", sync_contact)
    return state


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

    def test_nothing_is_sent_to_resend_before_the_address_is_verified(
        self, test_client, db_session
    ):
        _register(test_client, "keen", marketing_opt_out=False)

        assert _user(db_session, "keen").marketing_synced_at is None


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
    def test_switching_on(self, signed_in, db_session, test_user, resend):
        response = signed_in.put(
            PREFERENCE_URL, json={"wants_marketing": True}
        )

        assert response.status_code == 200, response.text
        assert response.json() == {"marketing_emails": True}
        db_session.refresh(test_user)
        assert test_user.marketing_emails is True
        [row] = _changes(db_session, test_user)
        assert row.source == "settings"

    def test_switching_off_tells_resend_at_once(
        self, signed_in, db_session, test_user, resend
    ):
        test_user.marketing_emails = True
        test_user.email_verified = True
        db_session.commit()

        response = signed_in.put(
            PREFERENCE_URL, json={"wants_marketing": False}
        )

        assert response.status_code == 200, response.text
        assert resend["synced"] == [(test_user.id, False)]

    def test_an_opt_out_resend_did_not_get_is_refused_and_undone(
        self, signed_in, db_session, test_user, resend
    ):
        """Resend sends the mail, so an opt-out it never heard stops nothing."""
        test_user.marketing_emails = True
        test_user.email_verified = True
        db_session.commit()
        resend["error"] = True

        response = signed_in.put(
            PREFERENCE_URL, json={"wants_marketing": False}
        )

        assert response.status_code == 502
        assert "try again" in response.json()["detail"]
        db_session.refresh(test_user)
        assert test_user.marketing_emails is True
        assert _changes(db_session, test_user) == []

    def test_an_opt_in_resend_did_not_get_still_saves(
        self, signed_in, db_session, test_user, resend
    ):
        """A late opt-in costs nothing; the retry sends it."""
        test_user.email_verified = True
        db_session.commit()
        resend["error"] = True

        response = signed_in.put(
            PREFERENCE_URL, json={"wants_marketing": True}
        )

        assert response.status_code == 200, response.text
        db_session.refresh(test_user)
        assert test_user.marketing_emails is True

    def test_an_unverified_address_is_not_sent_to_resend(
        self, signed_in, db_session, test_user, resend
    ):
        test_user.email_verified = False
        db_session.commit()

        signed_in.put(PREFERENCE_URL, json={"wants_marketing": True})

        assert resend["synced"] == []

    def test_saving_the_same_answer_does_nothing(
        self, signed_in, db_session, test_user, resend
    ):
        test_user.email_verified = True
        db_session.commit()

        response = signed_in.put(
            PREFERENCE_URL, json={"wants_marketing": False}
        )

        assert response.status_code == 200
        assert resend["synced"] == []
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

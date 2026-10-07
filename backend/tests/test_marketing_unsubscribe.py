"""The unsubscribe link in a newsletter Quill sends, and its two routes."""

import pytest
from sqlalchemy import select

from app.models import MarketingPreferenceChange, User
from app.security import (
    create_email_verify_token,
    create_marketing_unsubscribe_token,
    verify_marketing_unsubscribe_token,
)

URL = "/api/marketing/unsubscribe"
ONE_CLICK = {
    "content": "List-Unsubscribe=One-Click",
    "headers": {"content-type": "application/x-www-form-urlencoded"},
}


@pytest.fixture
def subscriber(db_session):
    user = User(
        username="ada",
        email="ada@example.com",
        password_hash="x",
        email_verified=True,
        marketing_emails=True,
    )
    db_session.add(user)
    db_session.commit()
    return user


def _link(user):
    return {"token": create_marketing_unsubscribe_token(user.id)}


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


class TestTheToken:
    def test_names_the_user_it_was_made_for(self):
        token = create_marketing_unsubscribe_token(42)

        assert verify_marketing_unsubscribe_token(token) == 42

    def test_does_not_hold_the_address(self, subscriber):
        """A link is forwarded and logged. It names an id, never who."""
        token = create_marketing_unsubscribe_token(subscriber.id)

        assert "ada" not in token
        assert "example" not in token

    def test_a_changed_token_is_refused(self):
        token = create_marketing_unsubscribe_token(42)
        tampered = token[:-1] + ("A" if token[-1] != "A" else "B")

        assert verify_marketing_unsubscribe_token(tampered) is None

    def test_another_kind_of_link_is_refused(self):
        """Signed with the same secret, but for a different purpose."""
        token = create_email_verify_token("ada@example.com")

        assert verify_marketing_unsubscribe_token(token) is None

    def test_nonsense_is_refused(self):
        assert verify_marketing_unsubscribe_token("not-a-token") is None
        assert verify_marketing_unsubscribe_token("") is None

    @pytest.mark.parametrize("bad", [0, -1, True, "7", 1.5, None])
    def test_only_a_real_user_id_can_be_signed(self, bad):
        with pytest.raises(ValueError):
            create_marketing_unsubscribe_token(bad)


class TestReadingTheLink:
    def test_needs_no_login(self, test_client, subscriber):
        response = test_client.get(URL, params=_link(subscriber))

        assert response.status_code == 200
        assert response.json() == {
            "email": "a***@e***.com",
            "marketing_emails": True,
        }

    def test_hides_most_of_the_address(self, test_client, subscriber):
        """Whoever holds a forwarded link must not learn the address."""
        response = test_client.get(URL, params=_link(subscriber))

        assert "ada@example.com" not in response.text

    def test_changes_nothing(self, test_client, db_session, subscriber):
        test_client.get(URL, params=_link(subscriber))

        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is True
        assert _changes(db_session, subscriber) == []

    def test_a_bad_link_is_not_found(self, test_client, subscriber):
        response = test_client.get(URL, params={"token": "not-a-token"})

        assert response.status_code == 404

    def test_a_link_for_nobody_reads_the_same_as_a_bad_one(
        self, test_client, subscriber
    ):
        """The reply must not say whether an account exists."""
        missing = test_client.get(
            URL, params={"token": create_marketing_unsubscribe_token(999999)}
        )
        bad = test_client.get(URL, params={"token": "not-a-token"})

        assert missing.status_code == bad.status_code == 404
        assert missing.json() == bad.json()

    def test_no_token_is_refused(self, test_client):
        assert test_client.get(URL).status_code == 422

    def test_an_enormous_token_is_refused(self, test_client):
        response = test_client.get(URL, params={"token": "a" * 600})

        assert response.status_code == 422


class TestOneClickFromAMailbox:
    def test_turns_news_off_and_records_where_from(
        self,
        test_client,
        db_session,
        subscriber,
    ):
        response = test_client.post(URL, params=_link(subscriber), **ONE_CLICK)

        assert response.status_code == 200
        assert response.json() == {
            "email": "a***@e***.com",
            "marketing_emails": False,
        }
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is False
        [row] = _changes(db_session, subscriber)
        assert row.wants_marketing is False
        assert row.source == "unsubscribe_link"

    def test_an_empty_body_also_means_off(
        self,
        test_client,
        db_session,
        subscriber,
    ):
        """Off is the safe way to be wrong about an unsubscribe."""
        response = test_client.post(URL, params=_link(subscriber))

        assert response.status_code == 200
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is False

    def test_pressed_twice_writes_one_row(
        self,
        test_client,
        db_session,
        subscriber,
    ):
        test_client.post(URL, params=_link(subscriber), **ONE_CLICK)
        again = test_client.post(URL, params=_link(subscriber), **ONE_CLICK)

        assert again.status_code == 200
        assert len(_changes(db_session, subscriber)) == 1

    def test_a_closed_account_can_still_unsubscribe(
        self,
        test_client,
        db_session,
        subscriber,
    ):
        subscriber.is_active = False
        db_session.commit()

        response = test_client.post(URL, params=_link(subscriber), **ONE_CLICK)

        assert response.status_code == 200
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is False

    def test_a_bad_link_changes_nobody(
        self,
        test_client,
        db_session,
        subscriber,
    ):
        response = test_client.post(
            URL, params={"token": "not-a-token"}, **ONE_CLICK
        )

        assert response.status_code == 404
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is True


class TestThePage:
    def test_can_turn_news_off(
        self,
        test_client,
        db_session,
        subscriber,
    ):
        response = test_client.post(
            URL, params=_link(subscriber), json={"wants_marketing": False}
        )

        assert response.status_code == 200
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is False

    def test_can_turn_news_back_on(
        self,
        test_client,
        db_session,
        subscriber,
    ):
        subscriber.marketing_emails = False
        db_session.commit()

        response = test_client.post(
            URL, params=_link(subscriber), json={"wants_marketing": True}
        )

        assert response.status_code == 200
        assert response.json()["marketing_emails"] is True
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is True
        [row] = _changes(db_session, subscriber)
        assert row.wants_marketing is True
        assert row.source == "unsubscribe_link"

    @pytest.mark.parametrize(
        "body",
        [
            {},
            {"wants_marketing": "perhaps"},
            {"wants_marketing": True, "email": "eve@example.com"},
        ],
    )
    def test_a_malformed_body_changes_nothing(
        self, test_client, db_session, subscriber, body
    ):
        """JSON that is not the page's is refused, not read as "off"."""
        response = test_client.post(URL, params=_link(subscriber), json=body)

        assert response.status_code == 422
        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is True
        assert _changes(db_session, subscriber) == []

"""The unsubscribe link in a newsletter Quill sends, and its two routes."""

import pytest
from sqlalchemy import select

from app.marketing.subscribers import set_subscribed
from app.models import (
    MarketingPreferenceChange,
    NewsletterSubscriber,
    User,
)
from app.security import (
    create_email_verify_token,
    create_marketing_unsubscribe_token,
    create_subscriber_unsubscribe_token,
    verify_marketing_unsubscribe_token,
    verify_subscriber_unsubscribe_token,
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


@pytest.fixture
def list_member(db_session):
    """Somebody on the mailing list who has no account."""
    member = NewsletterSubscriber(email="Grace@Example.com", name="Grace")
    db_session.add(member)
    db_session.commit()
    return member


def _member_link(member):
    return {"token": create_subscriber_unsubscribe_token(member.id)}


class TestASubscribersToken:
    def test_names_the_subscriber_it_was_made_for(self):
        token = create_subscriber_unsubscribe_token(7)

        assert verify_subscriber_unsubscribe_token(token) == 7

    def test_is_not_read_as_an_account_holders(self):
        """Subscriber 7 and user 7 are different people."""
        token = create_subscriber_unsubscribe_token(7)

        assert verify_marketing_unsubscribe_token(token) is None

    def test_an_account_holders_is_not_read_as_a_subscribers(self):
        token = create_marketing_unsubscribe_token(7)

        assert verify_subscriber_unsubscribe_token(token) is None

    @pytest.mark.parametrize("bad", [0, -1, True, "7", None, 1.5])
    def test_is_not_made_for_something_that_is_not_an_id(self, bad):
        with pytest.raises(ValueError):
            create_subscriber_unsubscribe_token(bad)


class TestASubscriber:
    def test_is_held_lower_case_and_subscribed(self, list_member):
        assert list_member.email == "grace@example.com"
        assert list_member.subscribed is True
        assert list_member.unsubscribed_at is None

    def test_two_cannot_share_an_address(self, db_session, list_member):
        from sqlalchemy.exc import IntegrityError

        db_session.add(NewsletterSubscriber(email="GRACE@example.com"))

        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_unsubscribing_records_when(self, list_member):
        assert set_subscribed(list_member, wants=False) is True

        assert list_member.subscribed is False
        assert list_member.unsubscribed_at is not None

    def test_coming_back_clears_when_they_left(self, list_member):
        set_subscribed(list_member, wants=False)

        assert set_subscribed(list_member, wants=True) is True
        assert list_member.subscribed is True
        assert list_member.unsubscribed_at is None

    def test_the_same_answer_changes_nothing(self, list_member):
        assert set_subscribed(list_member, wants=True) is False
        assert list_member.unsubscribed_at is None


class TestASubscribersLink:
    def test_reads_their_answer_with_the_address_hidden(
        self, test_client, list_member
    ):
        response = test_client.get(URL, params=_member_link(list_member))

        assert response.status_code == 200, response.text
        assert response.json() == {
            "email": "g***@e***.com",
            "marketing_emails": True,
        }

    def test_reading_changes_nothing(
        self, test_client, db_session, list_member
    ):
        test_client.get(URL, params=_member_link(list_member))

        db_session.refresh(list_member)
        assert list_member.subscribed is True

    def test_a_one_click_unsubscribes_them(
        self, test_client, db_session, list_member
    ):
        response = test_client.post(
            URL, params=_member_link(list_member), **ONE_CLICK
        )

        assert response.status_code == 200, response.text
        assert response.json()["marketing_emails"] is False
        db_session.refresh(list_member)
        assert list_member.subscribed is False
        assert list_member.unsubscribed_at is not None

    def test_the_page_can_turn_news_off_and_back_on(
        self, test_client, db_session, list_member
    ):
        for wants in (False, True):
            response = test_client.post(
                URL,
                params=_member_link(list_member),
                json={"wants_marketing": wants},
            )

            assert response.status_code == 200, response.text
            assert response.json()["marketing_emails"] is wants
            db_session.refresh(list_member)
            assert list_member.subscribed is wants

    def test_writes_no_account_history(
        self, test_client, db_session, list_member
    ):
        """There is no account for a history row to belong to."""
        test_client.post(URL, params=_member_link(list_member), **ONE_CLICK)

        assert (
            db_session.execute(select(MarketingPreferenceChange)).all() == []
        )

    def test_does_not_touch_the_user_with_the_same_id(
        self, test_client, db_session, list_member, subscriber
    ):
        """Row 1 in one table is not row 1 in the other."""
        assert list_member.id == subscriber.id

        test_client.post(URL, params=_member_link(list_member), **ONE_CLICK)

        db_session.refresh(subscriber)
        assert subscriber.marketing_emails is True

    def test_a_link_for_a_subscriber_who_is_gone_is_not_found(
        self, test_client
    ):
        response = test_client.get(
            URL, params={"token": create_subscriber_unsubscribe_token(999999)}
        )

        assert response.status_code == 404
        assert response.json() == {"detail": "Not found."}

"""One record of somebody who is on the mailing list and has an account."""

import pytest
from sqlalchemy import select

from app.marketing.preferences import set_marketing_preference
from app.marketing.subscribers import (
    fold_all,
    fold_into_account,
    move_to_list,
)
from app.models import (
    MarketingPreferenceChange,
    NewsletterSend,
    NewsletterSubscriber,
    OrgUnit,
    User,
)
from app.organisations import add_org_unit_member
from app.security import create_email_verify_token


def _user(db_session, name, *, verified=True, wants=False, answered=None):
    user = User(
        username=name,
        email=f"{name}@example.com",
        password_hash="x",
        email_verified=verified,
    )
    db_session.add(user)
    db_session.commit()
    if answered is not None:
        set_marketing_preference(
            db_session,
            user,
            wants=answered,
            source="registration",
            first_answer=True,
        )
    elif wants:
        user.marketing_emails = True
    db_session.commit()

    return user


def _member(db_session, name, *, subscribed=True):
    member = NewsletterSubscriber(
        email=f"{name}@example.com", subscribed=subscribed
    )
    db_session.add(member)
    db_session.commit()

    return member


def _members(db_session):
    return list(db_session.scalars(select(NewsletterSubscriber)).all())


def _changes(db_session, user):
    return [
        (row.wants_marketing, row.source)
        for row in db_session.scalars(
            select(MarketingPreferenceChange)
            .where(MarketingPreferenceChange.user_id == user.id)
            .order_by(MarketingPreferenceChange.id)
        )
    ]


class TestANoFromTheMailingList:
    def test_survives_a_yes_given_when_registering(self, db_session):
        """They had refused, then registered without noticing the box."""
        _member(db_session, "ada", subscribed=False)
        user = _user(db_session, "ada", answered=True)

        assert fold_into_account(db_session, user) is True
        db_session.commit()

        assert user.marketing_emails is False
        assert _changes(db_session, user) == [
            (True, "registration"),
            (False, "mailing_list"),
        ]
        assert _members(db_session) == []

    def test_changes_nothing_on_an_account_that_already_says_no(
        self, db_session
    ):
        _member(db_session, "ada", subscribed=False)
        user = _user(db_session, "ada", answered=False)

        fold_into_account(db_session, user)
        db_session.commit()

        assert user.marketing_emails is False
        assert _changes(db_session, user) == [(False, "registration")]
        assert _members(db_session) == []


class TestAYesFromTheMailingList:
    @pytest.mark.parametrize("answered", [True, False])
    def test_gives_way_to_the_answer_given_when_registering(
        self, db_session, answered
    ):
        """The registration answer is the more recent choice."""
        _member(db_session, "ada")
        user = _user(db_session, "ada", answered=answered)

        fold_into_account(db_session, user)
        db_session.commit()

        assert user.marketing_emails is answered
        assert _changes(db_session, user) == [(answered, "registration")]
        assert _members(db_session) == []

    def test_is_carried_across_to_an_account_never_asked(self, db_session):
        """Somebody else made the account: there is no answer to stand."""
        _member(db_session, "ada")
        user = _user(db_session, "ada")

        fold_into_account(db_session, user)
        db_session.commit()

        assert user.marketing_emails is True
        assert _changes(db_session, user) == [(True, "mailing_list")]
        assert _members(db_session) == []


class TestWhenNothingIsDone:
    def test_an_unverified_account_leaves_the_mailing_list_row_alone(
        self, db_session
    ):
        """The address may be somebody else's mistyping."""
        _member(db_session, "ada", subscribed=False)
        user = _user(db_session, "ada", verified=False, wants=True)

        assert fold_into_account(db_session, user) is False

        assert user.marketing_emails is True
        assert len(_members(db_session)) == 1

    def test_an_account_not_on_the_mailing_list(self, db_session):
        _member(db_session, "somebody-else")
        user = _user(db_session, "ada", answered=True)

        assert fold_into_account(db_session, user) is False
        assert len(_members(db_session)) == 1


class TestWhatTheyWereSent:
    def test_goes_with_them_so_no_campaign_reaches_them_twice(
        self, db_session
    ):
        member = _member(db_session, "ada")
        db_session.add(
            NewsletterSend(campaign="autumn", subscriber_id=member.id)
        )
        user = _user(db_session, "ada", answered=True)
        db_session.commit()

        fold_into_account(db_session, user)
        db_session.commit()

        [send] = db_session.scalars(select(NewsletterSend)).all()
        assert (send.campaign, send.user_id, send.subscriber_id) == (
            "autumn",
            user.id,
            None,
        )

    def test_a_campaign_both_records_had_is_kept_once(self, db_session):
        member = _member(db_session, "ada")
        user = _user(db_session, "ada", answered=True)
        db_session.add_all(
            [
                NewsletterSend(campaign="autumn", subscriber_id=member.id),
                NewsletterSend(campaign="autumn", user_id=user.id),
            ]
        )
        db_session.commit()

        fold_into_account(db_session, user)
        db_session.commit()

        [send] = db_session.scalars(select(NewsletterSend)).all()
        assert send.user_id == user.id


class TestEverybodyAtOnce:
    def test_folds_in_each_subscriber_with_a_verified_account(
        self, db_session
    ):
        _member(db_session, "ada", subscribed=False)
        _member(db_session, "bob")
        _member(db_session, "cat")
        _member(db_session, "nobody")
        ada = _user(db_session, "ada", answered=True)
        bob = _user(db_session, "bob", answered=False)
        _user(db_session, "cat", verified=False)

        assert fold_all(db_session) == 2
        db_session.commit()

        assert ada.marketing_emails is False
        assert bob.marketing_emails is False
        assert sorted(m.email for m in _members(db_session)) == [
            "cat@example.com",
            "nobody@example.com",
        ]


class TestVerifyingAnAddress:
    def test_folds_the_mailing_list_row_into_the_account(
        self, test_client, db_session
    ):
        _member(db_session, "ada", subscribed=False)
        user = _user(db_session, "ada", verified=False, answered=True)

        response = test_client.post(
            "/api/auth/verify-email",
            json={"token": create_email_verify_token(user.email)},
        )

        assert response.status_code == 200, response.text
        db_session.refresh(user)
        assert user.email_verified is True
        assert user.marketing_emails is False
        assert _members(db_session) == []


class TestTheSendItself:
    def test_leaves_out_an_account_whose_address_refused_on_the_list(
        self, db_session
    ):
        """The guard for an account the fold has not reached."""
        from app.marketing.newsletter import recipients

        _member(db_session, "ada", subscribed=False)
        _user(db_session, "ada", wants=True)
        _user(db_session, "bob", wants=True)

        assert [u.username for u in recipients(db_session)] == ["bob"]


def _closed(db_session, name, *, source=None, wants=True, sponsored=False):
    """Somebody whose account has just been closed.

    ``source`` is where their one answer came from, or None for
    somebody never asked.
    """
    user = User(
        username=name,
        email=f"{name}@example.com",
        password_hash="x",
        full_name=f"{name.title()} Example",
        email_verified=True,
    )
    db_session.add(user)
    db_session.commit()

    if source is not None:
        set_marketing_preference(
            db_session, user, wants=wants, source=source, first_answer=True
        )

    if sponsored:
        org = OrgUnit(name=f"{name}'s academy", type="hospital_team")
        db_session.add(org)
        db_session.flush()
        add_org_unit_member(db_session, org.id, user.id, "trainee")

    user.is_active = False
    db_session.commit()

    return user


def _entry(db_session, user):
    return db_session.scalar(
        select(NewsletterSubscriber).where(
            NewsletterSubscriber.email == user.email
        )
    )


class TestMovingToTheListWhenAnAccountCloses:
    """Closing an account is not somebody saying "stop emailing me"."""

    def test_a_direct_customer_who_did_not_refuse_goes_on_subscribed(
        self, db_session
    ):
        user = _closed(db_session, "ada", source="registration")

        move_to_list(db_session, user)

        entry = _entry(db_session, user)
        assert entry.subscribed is True
        assert entry.name == "Ada Example"

    def test_a_refusal_is_carried_as_a_refusal(self, db_session):
        user = _closed(db_session, "ada", source="registration", wants=False)

        move_to_list(db_session, user)

        entry = _entry(db_session, user)
        assert entry.subscribed is False
        assert entry.unsubscribed_at is not None

    @pytest.mark.parametrize(
        "source", ["registration", "invite", "settings", "unsubscribe_link"]
    )
    @pytest.mark.parametrize("wants", [True, False])
    def test_the_stored_answer_stands_however_it_was_given(
        self, db_session, source, wants
    ):
        """Mark, 14 October: the stored answer is the answer."""
        user = _closed(db_session, "ada", source=source, wants=wants)

        move_to_list(db_session, user)

        assert _entry(db_session, user).subscribed is wants

    @pytest.mark.parametrize("wants", [True, False])
    def test_a_member_of_a_sponsors_organisation_is_treated_the_same(
        self, db_session, wants
    ):
        user = _closed(
            db_session, "ada", source="invite", wants=wants, sponsored=True
        )

        move_to_list(db_session, user)

        assert _entry(db_session, user).subscribed is wants

    def test_the_latest_answer_is_the_one_that_counts(self, db_session):
        """Yes at registration, then no in Settings."""
        user = _closed(db_session, "ada", source="registration")
        set_marketing_preference(
            db_session, user, wants=False, source="settings"
        )
        db_session.commit()

        move_to_list(db_session, user)

        assert _entry(db_session, user).subscribed is False

    def test_somebody_never_asked_is_not_moved(self, db_session):
        user = _closed(db_session, "ada")

        assert move_to_list(db_session, user) is None

        assert _members(db_session) == []

    def test_an_unverified_address_is_never_moved(self, db_session):
        user = _closed(db_session, "ada", source="registration")
        user.email_verified = False
        db_session.commit()

        assert move_to_list(db_session, user) is None

        assert _members(db_session) == []

    def test_a_no_already_on_the_list_survives(self, db_session):
        user = _closed(db_session, "ada", source="registration")
        _member(db_session, "ada", subscribed=False)

        move_to_list(db_session, user)

        assert _entry(db_session, user).subscribed is False
        assert len(_members(db_session)) == 1

    def test_their_newest_word_stands_over_an_older_no(self, db_session):
        user = _closed(db_session, "ada", source="unsubscribe_link")
        _member(db_session, "ada", subscribed=False)

        move_to_list(db_session, user, their_newest_word=True)

        assert _entry(db_session, user).subscribed is True

    def test_what_they_were_sent_goes_with_them(self, db_session):
        """Or a campaign run again would reach them a second time."""
        user = _closed(db_session, "ada", source="registration")
        db_session.add(NewsletterSend(campaign="autumn", user_id=user.id))
        db_session.commit()

        entry = move_to_list(db_session, user)

        [send] = db_session.scalars(select(NewsletterSend)).all()
        assert send.subscriber_id == entry.id
        assert send.user_id is None

    def test_one_person_moving_leaves_the_next_as_they_were(self, db_session):
        ada = _closed(db_session, "ada", source="registration")
        bob = _user(db_session, "bob", answered=True)

        move_to_list(db_session, ada)

        assert _entry(db_session, bob) is None
        assert bob.marketing_emails is True


class TestAClosedAccountIsNotFoldedBack:
    def test_folding_leaves_a_closed_accounts_entry_alone(self, db_session):
        user = _closed(db_session, "ada", source="registration")
        move_to_list(db_session, user)
        db_session.commit()

        assert fold_into_account(db_session, user) is False
        assert fold_all(db_session) == 0

        assert _entry(db_session, user).subscribed is True

    def test_opening_it_again_folds_the_entry_back(self, db_session):
        user = _closed(db_session, "ada", source="registration")
        move_to_list(db_session, user)
        user.is_active = True
        db_session.commit()

        assert fold_into_account(db_session, user) is True

        assert _members(db_session) == []
        assert user.marketing_emails is True

    def test_a_no_given_while_closed_comes_back_with_them(self, db_session):
        user = _closed(db_session, "ada", source="registration")
        entry = move_to_list(db_session, user)
        entry.subscribed = False
        user.is_active = True
        db_session.commit()

        fold_into_account(db_session, user)

        assert user.marketing_emails is False
        assert _changes(db_session, user)[-1] == (False, "mailing_list")

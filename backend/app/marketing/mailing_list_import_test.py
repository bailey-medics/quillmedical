"""Reading a mailing list out of a dropped CSV, and importing it."""

import logging

import pytest
from sqlalchemy import select

from app.marketing import mailing_list_import as importer
from app.marketing.mailing_list_import import (
    MailingListError,
    apply,
    fingerprint,
    parse,
    summarise,
)
from app.models import NewsletterSubscriber, User

CHECK = "/api/newsletter/mailing-list/check"
IMPORT = "/api/newsletter/mailing-list/import"
AUDIENCE = "/api/newsletter/audience"

THREE = (
    "Email,Name,Opt in\r\n"
    "Ada@Example.org,Ada Lovelace,yes\r\n"
    "bob@example.org,,no\r\n"
    "cat@example.org,Cat,subscribed\r\n"
)


def _csv(text):
    return text.encode()


def _upload(text, name="list.csv"):
    return {"file": (name, _csv(text), "text/csv")}


def _members(db_session):
    return {
        m.email: m
        for m in db_session.scalars(select(NewsletterSubscriber)).all()
    }


class TestReadingAFile:
    def test_takes_the_address_the_name_and_the_answer(self):
        parsed = parse(_csv(THREE))

        assert [(e.email, e.name, e.opted_in) for e in parsed.entries] == [
            ("ada@example.org", "Ada Lovelace", True),
            ("bob@example.org", None, False),
            ("cat@example.org", "Cat", True),
        ]
        assert parsed.rows == 3
        assert parsed.has_opt_column is True

    def test_reads_the_columns_by_their_headings_in_any_order(self):
        parsed = parse(_csv("Status,E-mail\nunsubscribed,ada@example.org\n"))

        [entry] = parsed.entries
        assert (entry.email, entry.opted_in) == ("ada@example.org", False)

    def test_reads_a_mailing_services_own_export(self):
        """MailerLite heads the address "Subscriber" and splits the name."""
        parsed = parse(
            _csv(
                "Subscriber,Name,Last name\r\n"
                "ada@example.org,Ada,Lovelace\r\n"
                "bob@example.org,Bob,\r\n"
                "cat@example.org,,\r\n"
            )
        )

        assert [(e.email, e.name) for e in parsed.entries] == [
            ("ada@example.org", "Ada Lovelace"),
            ("bob@example.org", "Bob"),
            ("cat@example.org", None),
        ]

    def test_with_no_opt_column_everybody_is_opted_in_and_it_says_so(self):
        parsed = parse(_csv("Email\nada@example.org\n"))

        assert parsed.has_opt_column is False
        assert parsed.entries[0].opted_in is True

    def test_reads_a_file_excel_saved_with_a_byte_order_mark(self):
        parsed = parse(b"\xef\xbb\xbf" + _csv("Email\nada@example.org\n"))

        assert parsed.entries[0].email == "ada@example.org"

    def test_a_row_with_no_address_is_counted_by_number_and_left_out(self):
        parsed = parse(
            _csv(
                "Email,Opt in\n,yes\nnot-an-address,yes\nada@example.org,yes\n"
            )
        )

        assert parsed.no_address == [2, 3]
        assert [e.email for e in parsed.entries] == ["ada@example.org"]

    @pytest.mark.parametrize("answer", ["", "maybe", "yes please", "2", "?"])
    def test_an_answer_it_cannot_read_is_never_guessed(self, answer):
        parsed = parse(_csv(f"Email,Opt in\nada@example.org,{answer}\n"))

        assert parsed.unreadable_answer == [2]
        assert parsed.entries == []

    @pytest.mark.parametrize(
        ("word", "expected"),
        [
            ("IN", True),
            ("Yes", True),
            ("y", True),
            ("TRUE", True),
            ("1", True),
            ("Subscribed", True),
            ("active", True),
            ("out", False),
            ("No", False),
            ("n", False),
            ("false", False),
            ("0", False),
            ("Unsubscribed", False),
            (" opt-out ", False),
        ],
    )
    def test_the_words_it_reads(self, word, expected):
        parsed = parse(_csv(f"Email,Opt in\nada@example.org,{word}\n"))

        assert parsed.entries[0].opted_in is expected

    def test_an_address_named_twice_is_one_person_and_opted_out_wins(self):
        parsed = parse(
            _csv(
                "Email,Name,Opt in\n"
                "ada@example.org,Ada,yes\n"
                "ADA@example.org,,no\n"
                "ada@example.org,Other,yes\n"
            )
        )

        [entry] = parsed.entries
        assert (entry.email, entry.name, entry.opted_in) == (
            "ada@example.org",
            "Ada",
            False,
        )
        assert parsed.repeated == 2

    def test_blank_lines_are_not_rows(self):
        parsed = parse(_csv("Email\n\nada@example.org\n\n,\n"))

        assert parsed.rows == 1

    @pytest.mark.parametrize(
        ("raw", "message"),
        [
            (b"", "empty"),
            (b"Name,Opt in\nAda,yes\n", "No column is headed"),
            (b"\xff\xfe\x00\x01", "not a CSV"),
        ],
    )
    def test_a_file_that_is_not_a_mailing_list_is_refused(self, raw, message):
        with pytest.raises(MailingListError, match=message):
            parse(raw)

    def test_a_file_that_is_too_big_is_refused(self, monkeypatch):
        monkeypatch.setattr(importer, "MAX_BYTES", 20)

        with pytest.raises(MailingListError, match="larger than"):
            parse(_csv(THREE))

    def test_a_file_with_too_many_rows_is_refused(self, monkeypatch):
        monkeypatch.setattr(importer, "MAX_ROWS", 2)

        with pytest.raises(MailingListError, match="more than 2 rows"):
            parse(_csv(THREE))


class TestWhatAnImportWouldDo:
    def test_counts_everything_and_changes_nothing(self, db_session):
        db_session.add_all(
            [
                NewsletterSubscriber(email="bob@example.org"),
                NewsletterSubscriber(email="cat@example.org"),
            ]
        )
        db_session.commit()

        summary = summarise(db_session, parse(_csv(THREE)))

        assert (summary.new, summary.already_there, summary.switched_off) == (
            1,
            1,
            1,
        )
        assert (summary.opted_in, summary.opted_out) == (2, 1)
        assert _members(db_session)["bob@example.org"].subscribed is True
        assert "ada@example.org" not in _members(db_session)

    def test_counts_the_people_who_hold_an_account(self, db_session):
        db_session.add(
            User(
                username="ada",
                email="ada@example.org",
                password_hash="x",
                email_verified=True,
            )
        )
        db_session.commit()

        assert summarise(db_session, parse(_csv(THREE))).have_accounts == 1

    def test_the_fingerprint_changes_with_the_file_and_with_the_list(
        self, db_session
    ):
        raw = _csv(THREE)
        before = fingerprint(raw, summarise(db_session, parse(raw)))

        other = _csv(THREE + "dan@example.org,,yes\r\n")
        assert (
            fingerprint(other, summarise(db_session, parse(other))) != before
        )

        db_session.add(NewsletterSubscriber(email="ada@example.org"))
        db_session.commit()
        assert fingerprint(raw, summarise(db_session, parse(raw))) != before


class TestImporting:
    def test_adds_new_people_as_the_file_says(self, db_session):
        apply(db_session, parse(_csv(THREE)))
        db_session.commit()

        members = _members(db_session)
        assert members["ada@example.org"].subscribed is True
        assert members["ada@example.org"].name == "Ada Lovelace"
        assert members["bob@example.org"].subscribed is False
        assert members["bob@example.org"].unsubscribed_at is not None

    def test_never_turns_a_no_into_a_yes(self, db_session):
        """Somebody who unsubscribed stays so, whatever a file says."""
        db_session.add(
            NewsletterSubscriber(email="ada@example.org", subscribed=False)
        )
        db_session.commit()

        apply(db_session, parse(_csv(THREE)))
        db_session.commit()

        assert _members(db_session)["ada@example.org"].subscribed is False

    def test_an_opt_out_in_the_file_switches_somebody_off(self, db_session):
        db_session.add(NewsletterSubscriber(email="bob@example.org"))
        db_session.commit()

        apply(db_session, parse(_csv(THREE)))
        db_session.commit()

        assert _members(db_session)["bob@example.org"].subscribed is False

    def test_importing_the_same_file_twice_changes_nothing_more(
        self, db_session
    ):
        apply(db_session, parse(_csv(THREE)))
        db_session.commit()
        first = {
            e: (m.subscribed, m.name) for e, m in _members(db_session).items()
        }

        apply(db_session, parse(_csv(THREE)))
        db_session.commit()

        assert {
            e: (m.subscribed, m.name) for e, m in _members(db_session).items()
        } == first

    def test_fills_in_a_name_where_there_was_none_and_keeps_one_there_is(
        self, db_session
    ):
        db_session.add_all(
            [
                NewsletterSubscriber(email="ada@example.org"),
                NewsletterSubscriber(
                    email="cat@example.org", name="Catherine"
                ),
            ]
        )
        db_session.commit()

        apply(db_session, parse(_csv(THREE)))
        db_session.commit()

        members = _members(db_session)
        assert members["ada@example.org"].name == "Ada Lovelace"
        assert members["cat@example.org"].name == "Catherine"

    def test_somebody_with_a_verified_account_is_kept_as_the_account(
        self, db_session
    ):
        """The one-record rule runs over the whole list at import."""
        user = User(
            username="bob",
            email="bob@example.org",
            password_hash="x",
            email_verified=True,
            marketing_emails=True,
        )
        db_session.add(user)
        db_session.commit()

        apply(db_session, parse(_csv(THREE)))
        db_session.commit()

        assert "bob@example.org" not in _members(db_session)
        # The file opted Bob out, and a "no" from the list survives.
        assert user.marketing_emails is False


class TestTheRoutes:
    def test_checking_a_file_changes_nothing(
        self, authenticated_superadmin_client, db_session
    ):
        response = authenticated_superadmin_client.post(
            CHECK, files=_upload(THREE)
        )

        assert response.status_code == 200, response.text
        body = response.json()
        assert (body["new"], body["opted_in"], body["opted_out"]) == (3, 2, 1)
        assert body["imported"] is False
        assert _members(db_session) == {}

    def test_the_reply_holds_no_address_and_no_name(
        self, authenticated_superadmin_client
    ):
        response = authenticated_superadmin_client.post(
            CHECK, files=_upload(THREE)
        )

        # Whole words from the file. Not "ada" alone, which is in
        # "unreadable".
        text = response.text.lower()

        for word in ("ada@", "bob@", "cat@", "example.org", "lovelace"):
            assert word not in text

    def test_rows_it_could_not_read_come_back_by_number(
        self, authenticated_superadmin_client
    ):
        response = authenticated_superadmin_client.post(
            CHECK,
            files=_upload("Email,Opt in\nnope,yes\nada@example.org,perhaps\n"),
        )

        body = response.json()
        assert body["no_address_rows"] == [2]
        assert body["unreadable_answer_rows"] == [3]

    def test_importing_with_the_checks_fingerprint_adds_the_people(
        self, authenticated_superadmin_client, db_session
    ):
        client = authenticated_superadmin_client
        checked = client.post(CHECK, files=_upload(THREE)).json()

        response = client.post(
            IMPORT,
            files=_upload(THREE),
            data={"fingerprint": checked["fingerprint"]},
        )

        assert response.status_code == 200, response.text
        assert response.json()["imported"] is True
        assert sorted(_members(db_session)) == [
            "ada@example.org",
            "bob@example.org",
            "cat@example.org",
        ]

    def test_a_different_file_from_the_one_checked_is_refused(
        self, authenticated_superadmin_client, db_session
    ):
        client = authenticated_superadmin_client
        checked = client.post(CHECK, files=_upload(THREE)).json()

        response = client.post(
            IMPORT,
            files=_upload(THREE + "dan@example.org,,yes\r\n"),
            data={"fingerprint": checked["fingerprint"]},
        )

        assert response.status_code == 409
        assert _members(db_session) == {}

    def test_a_list_that_changed_since_the_check_is_refused(
        self, authenticated_superadmin_client, db_session
    ):
        client = authenticated_superadmin_client
        checked = client.post(CHECK, files=_upload(THREE)).json()
        db_session.add(NewsletterSubscriber(email="ada@example.org"))
        db_session.commit()

        response = client.post(
            IMPORT,
            files=_upload(THREE),
            data={"fingerprint": checked["fingerprint"]},
        )

        assert response.status_code == 409

    def test_a_file_that_is_not_a_list_is_a_400_that_says_why(
        self, authenticated_superadmin_client
    ):
        response = authenticated_superadmin_client.post(
            CHECK, files=_upload("Name\nAda\n")
        )

        assert response.status_code == 400
        assert "No column is headed" in response.json()["detail"]

    def test_a_file_over_the_limit_is_refused_partway(
        self, authenticated_superadmin_client, monkeypatch
    ):
        monkeypatch.setattr(importer, "MAX_BYTES", 30)

        response = authenticated_superadmin_client.post(
            CHECK, files=_upload(THREE)
        )

        assert response.status_code == 413

    def test_nothing_from_the_file_is_logged(
        self, authenticated_superadmin_client, caplog
    ):
        client = authenticated_superadmin_client

        with caplog.at_level(logging.DEBUG):
            checked = client.post(CHECK, files=_upload(THREE)).json()
            client.post(
                IMPORT,
                files=_upload(THREE),
                data={"fingerprint": checked["fingerprint"]},
            )

        logged = caplog.text.lower()

        for word in ("ada@", "bob@", "cat@", "lovelace"):
            assert word not in logged

    def test_the_audience_counts_each_kind(
        self, authenticated_superadmin_client, db_session
    ):
        apply(db_session, parse(_csv(THREE)))
        db_session.commit()

        response = authenticated_superadmin_client.get(AUDIENCE)

        assert response.status_code == 200, response.text
        assert response.json() == {
            "accounts": 0,
            "subscribers": 2,
            "unsubscribed": 1,
        }


class TestWhoMayUseThem:
    @pytest.mark.parametrize(
        ("method", "url"),
        [("get", AUDIENCE), ("post", CHECK), ("post", IMPORT)],
    )
    def test_nobody_signed_out(self, test_client, method, url):
        response = getattr(test_client, method)(url)

        assert response.status_code == 401

    @pytest.mark.parametrize(
        ("method", "url"),
        [("get", AUDIENCE), ("post", CHECK), ("post", IMPORT)],
    )
    def test_nobody_who_is_not_an_operator(
        self, authenticated_client, method, url
    ):
        kwargs = {} if method == "get" else {"files": _upload(THREE)}

        if url == IMPORT:
            kwargs["data"] = {"fingerprint": "0" * 64}

        response = getattr(authenticated_client, method)(url, **kwargs)

        assert response.status_code == 403

    def test_a_change_needs_the_csrf_token(
        self, authenticated_superadmin_client
    ):
        client = authenticated_superadmin_client
        del client.headers["X-CSRF-Token"]

        response = client.post(CHECK, files=_upload(THREE))

        assert response.status_code == 403

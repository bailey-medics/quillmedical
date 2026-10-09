"""Tests for configuration settings."""

import pytest
from pydantic import ValidationError

from app.config import Settings, parse_address_list


class TestSettingsComputedFields:
    """Test computed field properties in Settings."""

    def test_fhir_database_url(self):
        """Test FHIR database URL construction."""
        settings = Settings(
            JWT_SECRET="test_secret_long_enough_32_chars_min",
            CORE_DB_PASSWORD="auth_pass",
            FHIR_DB_PASSWORD="fhir_pass",
            EHRBASE_DB_PASSWORD="ehrbase_pass",
            EHRBASE_API_PASSWORD="api_pass",
            EHRBASE_API_ADMIN_PASSWORD="admin_pass",
            VAPID_PRIVATE="vapid_key",
            CLINICAL_SERVICES_ENABLED=True,
        )
        url = settings.FHIR_DATABASE_URL
        assert "postgresql+psycopg://" in url
        assert "hapi_user" in url
        assert "fhir_pass" in url
        assert "postgres-fhir" in url
        assert "5432" in url
        assert "hapi" in url

    def test_ehrbase_database_url(self):
        """Test EHRbase database URL construction."""
        settings = Settings(
            JWT_SECRET="test_secret_long_enough_32_chars_min",
            CORE_DB_PASSWORD="auth_pass",
            FHIR_DB_PASSWORD="fhir_pass",
            EHRBASE_DB_PASSWORD="ehrbase_pass",
            EHRBASE_API_PASSWORD="api_pass",
            EHRBASE_API_ADMIN_PASSWORD="admin_pass",
            VAPID_PRIVATE="vapid_key",
            CLINICAL_SERVICES_ENABLED=True,
        )
        url = settings.EHRBASE_DATABASE_URL
        assert "postgresql+psycopg://" in url
        assert "ehrbase_user" in url
        assert "ehrbase_pass" in url
        assert "postgres-ehrbase" in url
        assert "5432" in url
        assert "ehrbase" in url


class TestCorsOriginsFromEnvironment:
    """CORS_ORIGINS as Terraform sets it on the backend Cloud Run service."""

    def test_json_list_in_environment_is_read_as_a_list(self, monkeypatch):
        """`jsonencode([...])` in infra/main.tf arrives as a JSON string."""
        monkeypatch.setenv("CORS_ORIGINS", '["https://app.quill-medical.com"]')
        settings = Settings(
            JWT_SECRET="test_secret_long_enough_32_chars_min",
            CORE_DB_PASSWORD="auth_pass",
            VAPID_PRIVATE="vapid_key",
        )
        assert settings.CORS_ORIGINS == ["https://app.quill-medical.com"]

    def test_unset_falls_back_to_the_wildcard(self, monkeypatch):
        """The default every environment gets when nothing sets it."""
        monkeypatch.delenv("CORS_ORIGINS", raising=False)
        settings = Settings(
            JWT_SECRET="test_secret_long_enough_32_chars_min",
            CORE_DB_PASSWORD="auth_pass",
            VAPID_PRIVATE="vapid_key",
        )
        assert settings.CORS_ORIGINS == ["*"]


class TestCorsOriginsStartupCheck:
    """Production may not start with CORS open to every origin."""

    @staticmethod
    def _settings(**overrides: object) -> Settings:
        return Settings(
            JWT_SECRET="test_secret_long_enough_32_chars_min",
            CORE_DB_PASSWORD="auth_pass",
            VAPID_PRIVATE="vapid_key",
            **overrides,
        )

    def test_production_with_the_wildcard_is_refused(self):
        with pytest.raises(ValidationError, match="CORS_ORIGINS"):
            self._settings(BACKEND_ENV="production", CORS_ORIGINS=["*"])

    def test_production_with_the_default_is_refused(self, monkeypatch):
        """The real failure: nothing set CORS_ORIGINS at all."""
        monkeypatch.delenv("CORS_ORIGINS", raising=False)
        with pytest.raises(ValidationError, match="CORS_ORIGINS"):
            self._settings(BACKEND_ENV="production")

    def test_production_with_a_wildcard_among_named_origins_is_refused(self):
        with pytest.raises(ValidationError, match="CORS_ORIGINS"):
            self._settings(
                BACKEND_ENV="production",
                CORS_ORIGINS=["https://app.quill-medical.com", "*"],
            )

    def test_production_is_matched_whatever_its_case(self):
        with pytest.raises(ValidationError, match="CORS_ORIGINS"):
            self._settings(BACKEND_ENV="Production", CORS_ORIGINS=["*"])

    def test_production_with_a_named_origin_is_accepted(self):
        settings = self._settings(
            BACKEND_ENV="production",
            CORS_ORIGINS=["https://app.quill-medical.com"],
            FEEDBACK_NOTIFY_EMAIL="ops@example.test",
        )
        assert settings.CORS_ORIGINS == ["https://app.quill-medical.com"]

    @pytest.mark.parametrize("env", ["development", "testing"])
    def test_other_environments_keep_the_wildcard(self, env):
        settings = self._settings(BACKEND_ENV=env, CORS_ORIGINS=["*"])
        assert settings.CORS_ORIGINS == ["*"]


class TestParseAddressList:
    """A comma-separated setting, read as the addresses it names."""

    def test_one_address(self):
        assert parse_address_list("ops@example.test") == ["ops@example.test"]

    def test_several_in_the_order_given(self):
        assert parse_address_list("b@example.test,a@example.test") == [
            "b@example.test",
            "a@example.test",
        ]

    def test_spaces_capitals_and_blanks_are_forgiven(self):
        assert parse_address_list(
            " Ops@Example.test , ,lead@example.test,"
        ) == [
            "ops@example.test",
            "lead@example.test",
        ]

    def test_an_address_given_twice_is_kept_once(self):
        assert parse_address_list("ops@example.test,OPS@example.test") == [
            "ops@example.test"
        ]

    @pytest.mark.parametrize("raw", ["", "   ", ",", " , ,"])
    def test_nothing_named_is_an_empty_list(self, raw):
        assert parse_address_list(raw) == []

    @pytest.mark.parametrize(
        "raw",
        [
            "not-an-address",
            "@example.test",
            "ops@",
            "ops@example",
            "ops@@example.test",
            "ops @example.test",
            "ops@example.test;lead@example.test",
        ],
    )
    def test_an_entry_that_is_not_an_address_is_refused(self, raw):
        with pytest.raises(ValueError, match="not an email address"):
            parse_address_list(raw)

    def test_the_error_does_not_quote_the_entry(self):
        """An address must not reach a log through the message."""
        with pytest.raises(ValueError) as caught:
            parse_address_list("ops@example.test,secret-person")

        assert "secret-person" not in str(caught.value)
        assert "entry 2" in str(caught.value)


class TestFeedbackNotifyEmailStartupCheck:
    """Production may not start with nobody to tell of feedback."""

    @staticmethod
    def _settings(**overrides: object) -> Settings:
        return Settings(
            JWT_SECRET="test_secret_long_enough_32_chars_min",
            CORE_DB_PASSWORD="auth_pass",
            VAPID_PRIVATE="vapid_key",
            CORS_ORIGINS=["https://app.quill-medical.com"],
            **overrides,
        )

    @pytest.mark.parametrize("value", ["", "   "])
    def test_production_with_no_address_is_refused(self, value):
        with pytest.raises(ValidationError, match="FEEDBACK_NOTIFY_EMAIL"):
            self._settings(
                BACKEND_ENV="production", FEEDBACK_NOTIFY_EMAIL=value
            )

    def test_production_is_matched_whatever_its_case(self):
        with pytest.raises(ValidationError, match="FEEDBACK_NOTIFY_EMAIL"):
            self._settings(BACKEND_ENV="Production", FEEDBACK_NOTIFY_EMAIL="")

    def test_production_with_one_address_is_accepted(self):
        settings = self._settings(
            BACKEND_ENV="production", FEEDBACK_NOTIFY_EMAIL="ops@example.test"
        )

        assert settings.FEEDBACK_NOTIFY_EMAIL == "ops@example.test"

    def test_production_with_several_addresses_is_accepted(self):
        self._settings(
            BACKEND_ENV="production",
            FEEDBACK_NOTIFY_EMAIL="ops@example.test, lead@example.test",
        )

    @pytest.mark.parametrize("env", ["development", "testing"])
    def test_other_environments_may_leave_it_empty(self, env):
        settings = self._settings(BACKEND_ENV=env, FEEDBACK_NOTIFY_EMAIL="")

        assert settings.FEEDBACK_NOTIFY_EMAIL == ""

    @pytest.mark.parametrize("env", ["development", "testing", "production"])
    def test_set_but_naming_nobody_is_refused_everywhere(self, env):
        with pytest.raises(ValidationError, match="names no address"):
            self._settings(BACKEND_ENV=env, FEEDBACK_NOTIFY_EMAIL=" , ,")

    @pytest.mark.parametrize("env", ["development", "testing", "production"])
    def test_a_malformed_entry_is_refused_everywhere(self, env):
        with pytest.raises(ValidationError, match="not an email address"):
            self._settings(
                BACKEND_ENV=env,
                FEEDBACK_NOTIFY_EMAIL="ops@example.test,not-an-address",
            )


class TestFeedbackSlackWebhookStartupCheck:
    """A Slack webhook must point at Slack, or be left out."""

    @staticmethod
    def _settings(**overrides: object) -> Settings:
        return Settings(
            JWT_SECRET="test_secret_long_enough_32_chars_min",
            CORE_DB_PASSWORD="auth_pass",
            VAPID_PRIVATE="vapid_key",
            **overrides,
        )

    @pytest.mark.parametrize("value", [None, "", "   "])
    def test_unset_or_empty_is_accepted(self, value):
        self._settings(FEEDBACK_SLACK_WEBHOOK_URL=value)

    def test_a_slack_webhook_is_accepted(self):
        settings = self._settings(
            FEEDBACK_SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T/B/k"
        )

        assert settings.FEEDBACK_SLACK_WEBHOOK_URL is not None

    @pytest.mark.parametrize(
        "value",
        [
            "http://hooks.slack.com/services/T/B/k",
            "https://hooks.slack.com.example.test/services/T/B/k",
            "https://example.test/hook",
            "not a url",
        ],
    )
    def test_anything_else_is_refused_without_quoting_it(self, value):
        with pytest.raises(ValidationError) as caught:
            self._settings(FEEDBACK_SLACK_WEBHOOK_URL=value)

        assert "FEEDBACK_SLACK_WEBHOOK_URL" in str(caught.value)
        assert value not in str(caught.value)


class TestValidationErrorsHideWhatWasGiven:
    """A failed start must not print the environment into the log."""

    def test_a_refused_setting_does_not_show_the_other_secrets(self):
        with pytest.raises(ValidationError) as caught:
            Settings(
                JWT_SECRET="a_jwt_secret_that_must_not_be_printed_1234",
                CORE_DB_PASSWORD="a-database-password-not-to-print",
                VAPID_PRIVATE="vapid_key",
                BACKEND_ENV="production",
                CORS_ORIGINS=["*"],
            )

        message = str(caught.value)
        assert "CORS_ORIGINS" in message
        assert "a_jwt_secret_that_must_not_be_printed_1234" not in message
        assert "a-database-password-not-to-print" not in message

"""Tests for configuration settings."""

import pytest
from pydantic import ValidationError

from app.config import Settings


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
        )
        assert settings.CORS_ORIGINS == ["https://app.quill-medical.com"]

    @pytest.mark.parametrize("env", ["development", "testing"])
    def test_other_environments_keep_the_wildcard(self, env):
        settings = self._settings(BACKEND_ENV=env, CORS_ORIGINS=["*"])
        assert settings.CORS_ORIGINS == ["*"]

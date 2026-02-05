"""Tests for configuration settings."""

from app.config import Settings


class TestSettingsComputedFields:
    """Test computed field properties in Settings."""

    def test_fhir_database_url(self):
        """Test FHIR database URL construction."""
        settings = Settings(
            JWT_SECRET="test_secret_long_enough_32_chars_min",
            AUTH_DB_PASSWORD="auth_pass",
            FHIR_DB_PASSWORD="fhir_pass",
            EHRBASE_DB_PASSWORD="ehrbase_pass",
            EHRBASE_API_PASSWORD="api_pass",
            EHRBASE_API_ADMIN_PASSWORD="admin_pass",
            VAPID_PRIVATE="vapid_key",
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
            AUTH_DB_PASSWORD="auth_pass",
            FHIR_DB_PASSWORD="fhir_pass",
            EHRBASE_DB_PASSWORD="ehrbase_pass",
            EHRBASE_API_PASSWORD="api_pass",
            EHRBASE_API_ADMIN_PASSWORD="admin_pass",
            VAPID_PRIVATE="vapid_key",
        )
        url = settings.EHRBASE_DATABASE_URL
        assert "postgresql+psycopg://" in url
        assert "ehrbase_user" in url
        assert "ehrbase_pass" in url
        assert "postgres-ehrbase" in url
        assert "5432" in url
        assert "ehrbase" in url

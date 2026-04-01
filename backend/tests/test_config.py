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
            AUTH_DB_PASSWORD="auth_pass",
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

    def test_production_rejects_default_ehrbase_api_password(self):
        """Test that production mode rejects the default EHRbase API password."""
        import pytest
        from pydantic import ValidationError

        with pytest.raises(ValidationError, match="EHRBASE_API_PASSWORD"):
            Settings(
                JWT_SECRET="test_secret_long_enough_32_chars_min",
                AUTH_DB_PASSWORD="auth_pass",
                BACKEND_ENV="production",
                CLINICAL_SERVICES_ENABLED=True,
                # EHRBASE_API_PASSWORD not set — falls back to insecure default
            )

    def test_production_rejects_default_ehrbase_admin_password(self):
        """Test that production mode rejects the default EHRbase admin password."""
        import pytest
        from pydantic import ValidationError

        with pytest.raises(ValidationError, match="EHRBASE_API_ADMIN_PASSWORD"):
            Settings(
                JWT_SECRET="test_secret_long_enough_32_chars_min",
                AUTH_DB_PASSWORD="auth_pass",
                BACKEND_ENV="production",
                CLINICAL_SERVICES_ENABLED=True,
                EHRBASE_API_PASSWORD="custom_secure_password_123",
                # EHRBASE_API_ADMIN_PASSWORD not set — falls back to insecure default
            )

    def test_development_allows_default_credentials(self):
        """Test that development mode allows default EHRbase credentials."""
        settings = Settings(
            JWT_SECRET="test_secret_long_enough_32_chars_min",
            AUTH_DB_PASSWORD="auth_pass",
            BACKEND_ENV="development",
            CLINICAL_SERVICES_ENABLED=True,
            # No EHRBASE passwords set — uses insecure defaults (OK in dev)
        )
        assert settings.EHRBASE_API_PASSWORD.get_secret_value() == "ehrbase_password"

    def test_clinical_services_disabled_skips_password_validation(self):
        """Test that disabling clinical services skips password validation."""
        settings = Settings(
            JWT_SECRET="test_secret_long_enough_32_chars_min",
            AUTH_DB_PASSWORD="auth_pass",
            BACKEND_ENV="production",
            CLINICAL_SERVICES_ENABLED=False,
            # No EHRBASE passwords set — should not raise when services disabled
        )
        assert not settings.CLINICAL_SERVICES_ENABLED

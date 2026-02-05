"""Application configuration management.

This module defines the application settings using Pydantic Settings,
reading configuration from environment variables and providing computed
properties for database connection strings.

The configuration is organized into sections:
- JWT authentication settings
- Auth database connection
- FHIR database connection
- EHRbase connection
- VAPID keys for push notifications
"""

from urllib.parse import quote_plus

from pydantic import Field, SecretStr, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    All database passwords and secrets are stored as SecretStr to prevent
    accidental logging of sensitive values. Connection URLs are computed
    from individual components to support Docker Compose networking.

    Attributes:
        API_PREFIX: Base path for all API routes (default: /api)
        JWT_SECRET: Secret key for JWT token signing (min 32 chars)
        JWT_ALG: JWT signing algorithm (default: HS256)
        ACCESS_TTL_MIN: Access token lifetime in minutes (default: 15)
        REFRESH_TTL_DAYS: Refresh token lifetime in days (default: 7)
        COOKIE_DOMAIN: Domain for auth cookies (None = current domain)
        SECURE_COOKIES: Whether to use Secure flag on cookies (default: False)

        AUTH_DB_*: Authentication database connection parameters
        FHIR_DB_*: FHIR database connection parameters
        EHRBASE_*: EHRbase API connection parameters
        VAPID_PRIVATE: VAPID private key for push notifications
    """

    API_PREFIX: str = "/api"

    # No env_file: read env provided by Docker/Compose (and Docker secrets)
    model_config = SettingsConfigDict(
        extra="ignore",
        case_sensitive=False,
        # If you use Docker secrets, uncomment:
        # secrets_dir="/run/secrets",
    )

    # --- Auth ---
    JWT_SECRET: SecretStr = Field(
        ..., min_length=32, description="JWT signing key"
    )
    JWT_ALG: str = "HS256"
    ACCESS_TTL_MIN: int = 15
    REFRESH_TTL_DAYS: int = 7
    COOKIE_DOMAIN: str | None = None
    SECURE_COOKIES: bool = False

    # --- Auth Database ---
    AUTH_DB_NAME: str = Field("quill_auth", description="Auth database name")
    AUTH_DB_USER: str = Field("auth_user", description="Auth database user")
    AUTH_DB_PASSWORD: SecretStr = Field(
        ..., description="Auth database password"
    )
    AUTH_DB_HOST: str = Field(
        "postgres-auth", description="Auth database host"
    )
    AUTH_DB_PORT: int = Field(5432, description="Auth database port")

    # --- FHIR Database ---
    FHIR_DB_NAME: str = Field("hapi", description="FHIR database name")
    FHIR_DB_USER: str = Field("hapi_user", description="FHIR database user")
    FHIR_DB_PASSWORD: SecretStr = Field(
        ..., description="FHIR database password"
    )
    FHIR_DB_HOST: str = Field(
        "postgres-fhir", description="FHIR database host"
    )
    FHIR_DB_PORT: int = Field(5432, description="FHIR database port")

    # --- EHRbase Database ---
    EHRBASE_DB_NAME: str = Field(
        "ehrbase", description="EHRbase database name"
    )
    EHRBASE_DB_USER: str = Field(
        "ehrbase_user", description="EHRbase database user"
    )
    EHRBASE_DB_PASSWORD: SecretStr = Field(
        ..., description="EHRbase database password"
    )
    EHRBASE_DB_HOST: str = Field(
        "postgres-ehrbase", description="EHRbase database host"
    )
    EHRBASE_DB_PORT: int = Field(5432, description="EHRbase database port")

    # --- FHIR Server API ---
    FHIR_SERVER_URL: str = "http://fhir:8080/fhir"

    # --- EHRbase Server API ---
    EHRBASE_URL: str = "http://ehrbase:8080/ehrbase"
    EHRBASE_API_USER: str = Field(
        "ehrbase_user", description="EHRbase API user"
    )
    EHRBASE_API_PASSWORD: SecretStr = Field(
        ..., description="EHRbase API password"
    )
    EHRBASE_API_ADMIN_USER: str = Field(
        "ehrbase_admin", description="EHRbase API admin user"
    )
    EHRBASE_API_ADMIN_PASSWORD: SecretStr = Field(
        ..., description="EHRbase API admin password"
    )

    # --- Computed Database URLs ---
    @computed_field  # type: ignore[prop-decorator]
    @property
    def AUTH_DATABASE_URL(self) -> str:
        """Auth Database Connection URL.

        Constructs a PostgreSQL connection URL for the authentication database
        using psycopg (pure Python driver). The password is URL-encoded to handle
        special characters safely. This URL is used by SQLAlchemy to establish
        connections to the auth database container.

        Returns:
            str: SQLAlchemy-compatible database URL in format:
                postgresql+psycopg://user:password@host:port/database
        """
        """Construct auth database URL from components."""
        return (
            f"postgresql+psycopg://{self.AUTH_DB_USER}:"
            f"{quote_plus(self.AUTH_DB_PASSWORD.get_secret_value())}@"
            f"{self.AUTH_DB_HOST}:{self.AUTH_DB_PORT}/{self.AUTH_DB_NAME}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def FHIR_DATABASE_URL(self) -> str:
        """FHIR Database Connection URL.

        Constructs a PostgreSQL connection URL for the HAPI FHIR database.
        This database stores patient demographics and FHIR resources managed
        by the HAPI FHIR server. The password is URL-encoded for safe inclusion
        in the connection string.

        Returns:
            str: SQLAlchemy-compatible database URL for FHIR database.
        """
        return (
            f"postgresql+psycopg://{self.FHIR_DB_USER}:"
            f"{quote_plus(self.FHIR_DB_PASSWORD.get_secret_value())}@"
            f"{self.FHIR_DB_HOST}:{self.FHIR_DB_PORT}/{self.FHIR_DB_NAME}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def EHRBASE_DATABASE_URL(self) -> str:
        """EHRbase Database Connection URL.

        Constructs a PostgreSQL connection URL for the EHRbase database.
        This database stores OpenEHR compositions (clinical documents and letters)
        managed by the EHRbase server. The password is URL-encoded and includes
        special PostgreSQL parameters required by EHRbase.

        Returns:
            str: SQLAlchemy-compatible database URL for EHRbase database.
        """
        return (
            f"postgresql+psycopg://{self.EHRBASE_DB_USER}:"
            f"{quote_plus(self.EHRBASE_DB_PASSWORD.get_secret_value())}@"
            f"{self.EHRBASE_DB_HOST}:{self.EHRBASE_DB_PORT}/{self.EHRBASE_DB_NAME}"
        )


settings = Settings()

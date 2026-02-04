# app/config.py
from urllib.parse import quote_plus

from pydantic import Field, SecretStr, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
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
        """Construct auth database URL from components."""
        return (
            f"postgresql+psycopg://{self.AUTH_DB_USER}:"
            f"{quote_plus(self.AUTH_DB_PASSWORD.get_secret_value())}@"
            f"{self.AUTH_DB_HOST}:{self.AUTH_DB_PORT}/{self.AUTH_DB_NAME}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def FHIR_DATABASE_URL(self) -> str:
        """Construct FHIR database URL from components."""
        return (
            f"postgresql+psycopg://{self.FHIR_DB_USER}:"
            f"{quote_plus(self.FHIR_DB_PASSWORD.get_secret_value())}@"
            f"{self.FHIR_DB_HOST}:{self.FHIR_DB_PORT}/{self.FHIR_DB_NAME}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def EHRBASE_DATABASE_URL(self) -> str:
        """Construct EHRbase database URL from components."""
        return (
            f"postgresql+psycopg://{self.EHRBASE_DB_USER}:"
            f"{quote_plus(self.EHRBASE_DB_PASSWORD.get_secret_value())}@"
            f"{self.EHRBASE_DB_HOST}:{self.EHRBASE_DB_PORT}/{self.EHRBASE_DB_NAME}"
        )


settings = Settings()

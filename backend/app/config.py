# app/config.py
from urllib.parse import quote_plus

from pydantic import Field, SecretStr, model_validator
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

    # --- DB (compose from parts; Docker DNS host 'database' by default) ---
    DATABASE_URL: str | None = None
    POSTGRES_USER: str | None = Field(None, alias="postgres_user")
    POSTGRES_PASSWORD: str | None = Field(None, alias="postgres_password")
    POSTGRES_DB: str | None = Field(None, alias="postgres_db")
    POSTGRES_HOST: str | None = Field(
        "database", alias="postgres_host"
    )  # Docker service name
    POSTGRES_PORT: int | None = Field(5432, alias="postgres_port")

    # --- FHIR Server ---
    FHIR_SERVER_URL: str = "http://fhir:8080/fhir"

    # --- EHRbase Server ---
    EHRBASE_URL: str = "http://ehrbase:8080/ehrbase"
    EHRBASE_USER: str = "ehrbase-user"
    EHRBASE_PASSWORD: SecretStr = Field(
        ..., description="EHRbase user password"
    )
    EHRBASE_ADMIN_USER: str = "ehrbase-admin"
    EHRBASE_ADMIN_PASSWORD: SecretStr = Field(
        ..., description="EHRbase admin password"
    )

    @model_validator(mode="after")
    def build_db_url_if_missing(self):
        if (
            (not self.DATABASE_URL)
            and self.POSTGRES_USER
            and self.POSTGRES_PASSWORD
            and self.POSTGRES_DB
        ):
            self.DATABASE_URL = (
                f"postgresql+psycopg://{self.POSTGRES_USER}:"
                f"{quote_plus(self.POSTGRES_PASSWORD)}@"
                f"{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        return self


settings = Settings()

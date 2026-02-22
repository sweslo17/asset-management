"""Application configuration loaded from environment variables via pydantic-settings."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Portfolio updater configuration.

    All fields are loaded from environment variables prefixed with ``PORTFOLIO_``.

    Example::

        export PORTFOLIO_GOOGLE_SHEETS_ID="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
        export PORTFOLIO_SERVICE_ACCOUNT_JSON_PATH="/secrets/service-account.json"
        export PORTFOLIO_BACKFILL=true
    """

    model_config = SettingsConfigDict(
        env_prefix="PORTFOLIO_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    google_sheets_id: str = Field(
        ...,
        description="The ID of the Google Spreadsheet to read/write",
    )
    service_account_json_path: str = Field(
        default="service-account.json",
        description="Path to the Google service account credentials JSON file",
    )
    backfill: bool = Field(
        default=False,
        description="When True fetch full history from earliest investment date; "
        "when False fetch only the most recent 5 trading days",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached singleton Settings instance."""
    return Settings()  # type: ignore[call-arg]

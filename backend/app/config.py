"""
Central application configuration.

All values are read from environment variables (see .env.example).
Using pydantic-settings means every setting is validated and typed
once at process start-up instead of being re-parsed from os.environ
all over the codebase.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Database
    db_host: str = "localhost"
    db_port: int = 3306
    db_user: str = "library_admin"
    db_password: str = "Library@2026"
    db_name: str = "library_management_system"

    # Auth
    jwt_secret: str = "change_this_to_a_long_random_secret_before_deploying"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 120

    # App
    app_env: str = "development"
    cors_origins: str = "http://localhost:5500,http://127.0.0.1:5500"

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

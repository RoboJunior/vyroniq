from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ELASTICSEARCH_URL: str
    OLLAMA_HOST: str
    DECISION_MODEL: str
    SYSTEMONE_CONTEXT_WINDOW: int = 8192

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings():
    return Settings()

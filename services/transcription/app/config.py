"""Configuration for the transcription service."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8000
    service_api_key: str = ""
    groq_api_key: str = ""
    groq_audio_model_name: str = "whisper-large-v3-turbo"
    max_duration_seconds: int = 3600

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()

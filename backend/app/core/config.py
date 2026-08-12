from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App configuration, loaded from environment variables / .env file.

    See backend/.env.example for the full list and defaults.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "llama3:8b"

    upload_dir: Path = Path("./uploads")
    db_path: Path = Path("./app.db")

    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
settings.upload_dir.mkdir(parents=True, exist_ok=True)

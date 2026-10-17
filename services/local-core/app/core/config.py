from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

AUDIO_CACHE_DIR = BASE_DIR / "audio_cache"
AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)

class Settings(BaseModel):
    HOST: str = "127.0.0.1"
    PORT: int = 8765
    DATABASE_PATH: str = str(DATA_DIR / "sevadesk_local.db")
    AUDIO_CACHE_PATH: str = str(AUDIO_CACHE_DIR)
    ALLOWED_ORIGINS: list[str] = [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    ]
    BHASHINI_API_KEY: str = ""
    BHASHINI_USER_ID: str = ""

settings = Settings()

import os
from dataclasses import dataclass, field
from pathlib import Path
from .models import FILENAMES

ROOT = Path(__file__).resolve().parent


def default_model_dir():
    return Path(os.getenv("KATAGO_MODEL_DIR", ROOT / "models")).expanduser().resolve()


def default_model():
    return default_model_dir() / FILENAMES["L9"]


@dataclass
class Settings:
    binary: Path = field(default_factory=lambda: Path(os.getenv("KATAGO_BINARY", ROOT.parent / "katago")))
    model: Path = field(default_factory=default_model)
    model_dir: Path = field(default_factory=default_model_dir)
    human_model: Path | None = None
    gpu: int = field(default_factory=lambda: int(os.getenv("KATAGO_GPU", "0")))
    config: Path = field(default_factory=lambda: Path(os.getenv("KATAGO_CONFIG", ROOT / "analysis.cfg")))
    data: Path = field(default_factory=lambda: Path(os.getenv("KATAGO_DATA", ROOT / "data")))
    token: str = field(default_factory=lambda: os.getenv("KATAGO_WEB_TOKEN", ""))
    secure_cookie: bool = field(default_factory=lambda: os.getenv("KATAGO_SECURE_COOKIE", "0") == "1")
    max_jobs: int = 16
    max_owner_jobs: int = 2
    max_positions: int = 2048
    timeout: float = 120
    startup_timeout: float = 180

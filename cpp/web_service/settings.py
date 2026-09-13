import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def default_model():
    models = sorted((Path.home() / "katago/models").glob("*.bin.gz"))
    return next((p for p in models if "human" not in p.name), ROOT / "model.bin.gz")


@dataclass
class Settings:
    binary: Path = field(default_factory=lambda: Path(os.getenv("KATAGO_BINARY", ROOT.parent / "katago")))
    model: Path = field(default_factory=lambda: Path(os.getenv("KATAGO_MODEL", default_model())).expanduser())
    config: Path = field(default_factory=lambda: Path(os.getenv("KATAGO_CONFIG", ROOT / "analysis.cfg")))
    data: Path = field(default_factory=lambda: Path(os.getenv("KATAGO_DATA", ROOT / "data")))
    token: str = field(default_factory=lambda: os.getenv("KATAGO_WEB_TOKEN", ""))
    secure_cookie: bool = field(default_factory=lambda: os.getenv("KATAGO_SECURE_COOKIE", "0") == "1")
    max_jobs: int = 16
    max_owner_jobs: int = 2
    max_positions: int = 2048
    timeout: float = 120
    startup_timeout: float = 180

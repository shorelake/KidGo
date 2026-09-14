"""Run with conda run -n go python -m web_service.download_models."""
import argparse
import gzip
import hashlib
import subprocess
from pathlib import Path

from .models import DOWNLOAD_URLS, FILENAMES
from .settings import default_model_dir


def main():
    parser = argparse.ArgumentParser(description="Download and verify the configured KataGo networks")
    parser.add_argument("--directory", type=Path, default=default_model_dir())
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    for key, name in FILENAMES.items():
        destination = args.directory / name
        temporary = destination.with_name(name + ".part")
        if not destination.exists():
            print(f"Downloading {key}: {name}", flush=True)
            subprocess.run(["curl", "--fail", "--location", "--retry", "4", "--connect-timeout", "30",
                            "--continue-at", "-", "--output", str(temporary), DOWNLOAD_URLS[key]], check=True)
        source = destination if destination.exists() else temporary
        with gzip.open(source, "rb") as stream:
            while stream.read(1024 * 1024):
                pass
        with source.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        if source == temporary:
            temporary.replace(destination)
        destination.with_name(name + ".sha256").write_text(f"{digest}  {name}\n")
        print(f"Verified {key}: {digest}", flush=True)


if __name__ == "__main__":
    main()

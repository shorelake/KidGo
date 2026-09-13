import argparse
import logging
import secrets
from pathlib import Path
import uvicorn
from .settings import Settings
from .app import create_app


def main():
    parser = argparse.ArgumentParser(description="KataGo Web service (one worker)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=3000, type=int)
    parser.add_argument("--token-file", type=Path, help="Read or create a persistent access token")
    parser.add_argument("--model", type=Path)
    parser.add_argument("--config", type=Path)
    args = parser.parse_args()
    settings = Settings()
    if args.token_file and not settings.token:
        token_file = args.token_file.expanduser().resolve()
        token_file.parent.mkdir(parents=True, exist_ok=True)
        try:
            with token_file.open("x") as f:
                token_file.chmod(0o600)
                f.write(secrets.token_urlsafe(24) + "\n")
        except FileExistsError:
            pass
        settings.token = token_file.read_text().strip()
        print(f"Access token file: {token_file}", flush=True)
    if args.model:
        settings.model = args.model.expanduser().resolve()
    if args.config:
        settings.config = args.config.resolve()
    if args.host not in ("127.0.0.1", "::1", "localhost") and not settings.token:
        parser.error("Set KATAGO_WEB_TOKEN before binding a non-loopback address")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    uvicorn.run(create_app(settings), host=args.host, port=args.port, workers=1)


if __name__ == "__main__":
    main()

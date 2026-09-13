import asyncio
import fcntl
import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware

from .engine import Engine
from .schemas import AnalysisRequest, Position, Record
from .go import replay
from .records import Store, import_sgf, export_sgf
from .settings import ROOT, Settings


def create_app(settings=None, engine=None):
    settings = settings or Settings()
    settings.data.mkdir(parents=True, exist_ok=True)
    secret_file = settings.data / "session.secret"
    try:
        with secret_file.open("x") as f:
            secret_file.chmod(0o600)
            f.write(secrets.token_hex(32))
    except FileExistsError:
        pass
    engine = engine or Engine(settings)
    store = Store(settings.data / "games.sqlite3")

    @asynccontextmanager
    async def lifespan(app):
        with (settings.data / "engine.lock").open("w") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise RuntimeError("Web service already running: use one worker per GPU service") from None
            await engine.start()
            try:
                yield
            finally:
                await engine.close()

    app = FastAPI(title="KataGo Web", lifespan=lifespan)
    app.state.engine = engine
    app.state.settings = settings
    app.add_middleware(SessionMiddleware, secret_key=secret_file.read_text(),
                       session_cookie="katago_session", same_site="strict",
                       https_only=settings.secure_cookie, max_age=86400 * 30)
    auth_version = hashlib.sha256(settings.token.encode()).hexdigest()
    login_attempts = defaultdict(deque)

    def authenticated(connection):
        return not settings.token or connection.session.get("auth") == auth_version

    def owner(request: Request):
        if not authenticated(request):
            raise HTTPException(401, "请输入访问口令")
        if "owner" not in request.session:
            request.session["owner"] = secrets.token_hex(24)
        return request.session["owner"]

    def same_origin(connection):
        origin = connection.headers.get("origin")
        return not origin or urlsplit(origin).netloc == connection.headers.get("host")

    @app.middleware("http")
    async def guard(request, call_next):
        if request.method not in ("GET", "HEAD", "OPTIONS") and not same_origin(request):
            return JSONResponse({"detail": "跨站请求被拒绝"}, status_code=403)
        if request.url.path.startswith("/api/") and request.method in ("POST", "PUT", "PATCH"):
            length = request.headers.get("content-length")
            if length and (not length.isdigit() or int(length) > 2 * 1024 * 1024):
                return JSONResponse({"detail": "请求过大"}, status_code=413)
            chunks, size = [], 0
            async for chunk in request.stream():
                size += len(chunk)
                if size > 2 * 1024 * 1024:
                    return JSONResponse({"detail": "请求过大"}, status_code=413)
                chunks.append(chunk)
            request._body = b"".join(chunks)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/session")
    def session(request: Request):
        if "owner" not in request.session:
            request.session["owner"] = secrets.token_hex(24)
        return {"authenticated": authenticated(request), "requiresToken": bool(settings.token)}

    class SgfImport(BaseModel):
        content: str = Field(max_length=1024 * 1024)

    @app.post("/api/sgf/import")
    def sgf_import(body: SgfImport, identity=Depends(owner)):
        try:
            record, warnings = import_sgf(body.content)
            return {"record": record, "warnings": warnings}
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @app.post("/api/sgf/export")
    def sgf_export(body: Record, identity=Depends(owner)):
        try:
            return {"sgf": export_sgf(body)}
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @app.get("/api/games")
    def list_games(identity=Depends(owner)):
        return store.list(identity)

    @app.get("/api/games/{identifier}")
    def get_game(identifier: str, identity=Depends(owner)):
        try:
            return store.get(identity, identifier)
        except KeyError:
            raise HTTPException(404, "棋谱不存在") from None

    class SaveRequest(BaseModel):
        record: Record
        version: int | None = None

    def save_game(body, identity, identifier=None):
        try:
            replay(body.record)
            return store.save(identity, body.record, identifier, body.version)
        except KeyError:
            raise HTTPException(404, "棋谱不存在") from None
        except ValueError as exc:
            raise HTTPException(409 if identifier else 422, str(exc)) from None
        except OverflowError as exc:
            raise HTTPException(429, str(exc)) from None

    @app.post("/api/games", status_code=201)
    def create_game(body: SaveRequest, identity=Depends(owner)):
        return save_game(body, identity)

    @app.put("/api/games/{identifier}")
    def update_game(identifier: str, body: SaveRequest, identity=Depends(owner)):
        return save_game(body, identity, identifier)

    @app.delete("/api/games/{identifier}")
    def delete_game(identifier: str, identity=Depends(owner)):
        try:
            store.delete(identity, identifier)
            return {"ok": True}
        except KeyError:
            raise HTTPException(404, "棋谱不存在") from None

    class Login(BaseModel):
        token: str = Field(max_length=512)

    @app.post("/api/login")
    async def login(body: Login, request: Request):
        now = time.monotonic()
        address = request.client.host if request.client else "unknown"
        if len(login_attempts) > 4096:
            for key, attempts in list(login_attempts.items()):
                if not attempts or attempts[-1] < now - 60:
                    login_attempts.pop(key, None)
            if len(login_attempts) > 4096:
                raise HTTPException(429, "登录请求过多，请稍后重试")
        attempts = login_attempts[address]
        while attempts and attempts[0] < now - 60:
            attempts.popleft()
        if len(attempts) >= 10:
            raise HTTPException(429, "登录尝试过多，请一分钟后重试")
        attempts.append(now)
        if not hmac.compare_digest(body.token.encode(), settings.token.encode()):
            await asyncio.sleep(0.5)
            raise HTTPException(401, "访问口令错误")
        request.session["auth"] = auth_version
        request.session.setdefault("owner", secrets.token_hex(24))
        return {"ok": True}

    @app.post("/api/logout")
    async def logout(request: Request):
        for job in list(engine.jobs.values()):
            if job.owner == request.session.get("owner") and job.status == "running":
                await engine.cancel(job)
        request.session.pop("auth", None)
        return {"ok": True}

    @app.get("/api/health")
    def health():
        return JSONResponse({"ready": engine.ready, "status": "ready" if engine.ready else "starting",
                             "version": engine.version, "model": settings.model.name,
                             "activeJobs": sum(j.active for j in engine.jobs.values()),
                             "restarts": engine.restarts}, status_code=200 if engine.ready else 503)

    @app.post("/api/analyze", status_code=202)
    async def analyze(body: AnalysisRequest, identity=Depends(owner)):
        try:
            replay(body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        try:
            job = await engine.submit(identity, body.engine_query())
        except OverflowError as exc:
            raise HTTPException(429, str(exc)) from None
        except RuntimeError as exc:
            raise HTTPException(503, str(exc)) from None
        return job.snapshot()

    @app.post("/api/position")
    def position(body: Position, identity=Depends(owner)):
        try:
            return replay(body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    def get_job(identifier, identity):
        job = engine.jobs.get(identifier)
        if not job or job.owner != identity:
            raise HTTPException(404, "分析任务不存在")
        return job

    @app.get("/api/analyze/{identifier}")
    def result(identifier: str, identity=Depends(owner)):
        return get_job(identifier, identity).snapshot()

    @app.post("/api/analyze/{identifier}/cancel")
    async def cancel(identifier: str, identity=Depends(owner)):
        job = get_job(identifier, identity)
        try:
            await engine.cancel(job)
        except (RuntimeError, ConnectionError, asyncio.TimeoutError):
            raise HTTPException(503, "引擎连接已断开") from None
        return job.snapshot()

    @app.websocket("/api/ws")
    async def websocket(ws: WebSocket):
        identity = ws.session.get("owner")
        if not identity or not authenticated(ws) or not same_origin(ws):
            await ws.close(code=1008)
            return
        listeners = engine.listeners.setdefault(identity, [])
        if len(listeners) >= 4 or sum(map(len, engine.listeners.values())) >= 128:
            await ws.close(code=1013)
            return
        await ws.accept()
        queue = asyncio.Queue(maxsize=128)
        listeners.append(queue)

        async def sender():
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), 20)
                except asyncio.TimeoutError:
                    event = {"type": "heartbeat"}
                await ws.send_json(event)

        task = asyncio.create_task(sender())
        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            listeners.remove(queue)
            if not listeners:
                engine.listeners.pop(identity, None)

    dist = ROOT / "frontend/dist"
    if dist.exists():
        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    return app

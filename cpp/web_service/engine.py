import asyncio
import contextlib
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from .models import human_move

log = logging.getLogger("katago.engine")


@dataclass
class Job:
    id: str
    owner: str
    query: dict
    deadline: float
    created: float = field(default_factory=time.time)
    status: str = "running"
    results: dict = field(default_factory=dict)
    finished_turns: set = field(default_factory=set)
    error: str | None = None
    cancel_deadline: float | None = None
    provenance: dict = field(default_factory=dict)

    @property
    def turns(self):
        return self.query.get("analyzeTurns", [len(self.query["moves"])])

    @property
    def active(self):
        return self.status == "running" or self.cancel_deadline is not None

    def snapshot(self):
        return {"id": self.id, "status": self.status, "results": list(self.results.values()),
                "completed": len(self.finished_turns), "total": len(self.turns), "error": self.error}


class Engine:
    def __init__(self, settings):
        self.settings = settings
        self.process = None
        self.ready = False
        self.error = None
        self.version = None
        self.jobs = {}
        self.listeners = {}
        self.write_lock = asyncio.Lock()
        self.tasks = []
        self.stopping = False
        self.restarts = 0

    async def start(self):
        self.tasks = [asyncio.create_task(self._supervise()), asyncio.create_task(self._reap())]

    async def close(self):
        self.stopping = True
        self.ready = False
        for task in self.tasks:
            task.cancel()
        if self.process and self.process.returncode is None:
            self.process.terminate()
            try:
                await asyncio.wait_for(self.process.wait(), 10)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()
        await asyncio.gather(*self.tasks, return_exceptions=True)

    async def _supervise(self):
        while not self.stopping:
            stderr_task = None
            try:
                s = self.settings
                for path in (s.binary, s.model, s.config):
                    if not path.is_file():
                        raise RuntimeError(f"File not found: {path}")
                self.process = await asyncio.create_subprocess_exec(
                    str(s.binary.resolve()), "analysis", "-model", str(s.model.resolve()),
                    *(["-human-model", str(s.human_model.resolve())] if s.human_model else []),
                    "-config", str(s.config.resolve()), "-override-config",
                    f"reportAnalysisWinratesAs=BLACK,cudaDeviceToUse={s.gpu}",
                    "-quit-without-waiting", cwd=s.data,
                    stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE, limit=4 * 1024 * 1024)
                stderr_task = asyncio.create_task(self._stderr(self.process.stderr))
                await self.write({"id": "__ready__", "action": "query_version"})
                async with asyncio.timeout(s.startup_timeout):
                    while not self.ready:
                        line = await self.process.stdout.readline()
                        if not line:
                            raise RuntimeError("Engine exited during startup; check server log")
                        message = json.loads(line)
                        if message.get("id") == "__ready__" and "version" in message:
                            self.ready = True
                            self.error = None
                            self.version = message["version"]
                log.info("KataGo %s ready with %s", self.version, s.model.name)
                while line := await self.process.stdout.readline():
                    await self._message(json.loads(line))
                raise RuntimeError(f"Engine exited (code {await self.process.wait()})")
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self.ready = False
                self.error = str(exc) or type(exc).__name__
                log.exception("KataGo unavailable; restarting")
                for job in list(self.jobs.values()):
                    if job.active:
                        job.status = "failed"
                        job.error = "分析引擎已断开，请稍后重试"
                        job.cancel_deadline = None
                        self.emit(job, {"type": "status", **job.snapshot()})
            finally:
                self.ready = False
                if self.process and self.process.returncode is None:
                    self.process.kill()
                    await self.process.wait()
                if stderr_task:
                    stderr_task.cancel()
                    await asyncio.gather(stderr_task, return_exceptions=True)
            self.restarts += 1
            await asyncio.sleep(min(30, 2 * self.restarts))

    async def _stderr(self, stream):
        while line := await stream.readline():
            log.info("%s", line.decode(errors="replace").rstrip())

    async def write(self, message):
        async with self.write_lock:
            if not self.process or self.process.returncode is not None:
                raise RuntimeError("Engine unavailable")
            self.process.stdin.write((json.dumps(message, separators=(",", ":")) + "\n").encode())
            await asyncio.wait_for(self.process.stdin.drain(), 10)

    async def submit(self, owner, query, provenance=None):
        if not self.ready:
            raise RuntimeError("分析引擎尚未就绪")
        active = [j for j in self.jobs.values() if j.active]
        turns = len(query.get("analyzeTurns", [0]))
        if (len(active) >= self.settings.max_jobs
                or sum(j.owner == owner for j in active) >= self.settings.max_owner_jobs
                or sum(len(j.turns) for j in active) + turns > self.settings.max_positions):
            raise OverflowError("分析队列已满，请稍后重试")
        identifier = uuid.uuid4().hex
        query = {**query, "id": identifier}
        job = Job(identifier, owner, query, time.monotonic() + min(1800, self.settings.timeout + turns * 5))
        job.provenance = provenance or {}
        self.jobs[identifier] = job
        try:
            await self.write(query)
        except Exception:
            self.jobs.pop(identifier, None)
            raise RuntimeError("无法提交到分析引擎") from None
        return job

    def emit(self, job, event):
        for queue in list(self.listeners.get(job.owner, [])):
            if queue.full():
                # Clients recover complete results through GET /api/analyze/{id}.
                with contextlib.suppress(asyncio.QueueEmpty):
                    queue.get_nowait()
            queue.put_nowait(event)

    async def _message(self, message):
        job = self.jobs.get(message.get("id"))
        if not job or not job.active:
            return
        if "error" in message:
            job.status, job.error, job.cancel_deadline = "failed", message["error"], None
            self.emit(job, {"type": "status", **job.snapshot()})
            return
        if "warning" in message:
            self.emit(job, {"type": "warning", "id": job.id, "warning": message["warning"]})
            return
        turn = message.get("turnNumber")
        if turn not in job.turns:
            return
        if job.status == "running" and not message.get("noResults"):
            message["provenance"] = job.provenance
            if job.provenance.get("modelId") == "human" and message.get("isDuringSearch") is False:
                try:
                    message["selectedMove"] = human_move(message, job.query)
                except ValueError as exc:
                    job.status, job.error = "failed", str(exc)
                    self.emit(job, {"type": "status", **job.snapshot()})
                    return
            message.pop("humanPolicy", None)
            message.pop("policy", None)
            if "moveInfos" in message:
                message["moveInfos"] = sorted(message["moveInfos"], key=lambda m: m["order"])[:8]
            job.results[turn] = message
            self.emit(job, {"type": "analysis", **message})
        if message.get("isDuringSearch") is False:
            job.finished_turns.add(turn)
            if len(job.finished_turns) == len(job.turns):
                job.cancel_deadline = None
                if job.status == "running":
                    job.status = "completed"
                self.emit(job, {"type": "status", **job.snapshot()})

    async def cancel(self, job, status="cancelled"):
        if job.status != "running":
            return
        job.status = status
        job.cancel_deadline = time.monotonic() + 15
        if status == "timed_out":
            job.error = "分析超时"
        await self.write({"id": uuid.uuid4().hex, "action": "terminate", "terminateId": job.id})
        self.emit(job, {"type": "status", **job.snapshot()})

    async def _reap(self):
        while True:
            await asyncio.sleep(1)
            now = time.monotonic()
            for identifier, job in list(self.jobs.items()):
                if job.status == "running" and now > job.deadline:
                    with contextlib.suppress(RuntimeError, BrokenPipeError, ConnectionError, asyncio.TimeoutError):
                        await self.cancel(job, "timed_out")
                if job.cancel_deadline and now > job.cancel_deadline:
                    if self.process and self.process.returncode is None:
                        self.process.kill()
                    job.cancel_deadline = None
                if not job.active and time.time() - job.created > 3600:
                    self.jobs.pop(identifier, None)
            finished = [j for j in self.jobs.values() if not j.active]
            retained_positions = sum(len(j.results) for j in finished)
            while finished and (len(finished) > 64 or retained_positions > 4096):
                job = finished.pop(0)
                retained_positions -= len(job.results)
                self.jobs.pop(job.id, None)

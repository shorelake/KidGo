"""Keep the teacher resident and lazily load at most two opponent workers."""
import asyncio
import time
from dataclasses import replace

from .engine import Engine
from .models import FILENAMES


class EnginePool:
    def __init__(self, settings):
        self.settings = settings
        self.listeners = {}
        self.teacher = Engine(replace(settings, model=settings.model_dir / FILENAMES["L9"]))
        self.teacher.listeners = self.listeners
        self.workers = {"L9": self.teacher}
        self.last_used = {}
        self.retired_jobs = {}
        self.lock = asyncio.Lock()

    @property
    def ready(self):
        return self.teacher.ready

    @property
    def version(self):
        return self.teacher.version

    @property
    def restarts(self):
        return sum(worker.restarts for worker in self.workers.values())

    @property
    def jobs(self):
        return {**self.retired_jobs, **{key: job for worker in self.workers.values()
                                      for key, job in worker.jobs.items()}}

    def catalog(self):
        return [{"id": key, "name": name,
                 "available": (self.settings.model_dir / name).is_file(),
                 "ready": key in self.workers and self.workers[key].ready}
                for key, name in FILENAMES.items()]

    async def start(self):
        await self.teacher.start()

    async def close(self):
        await asyncio.gather(*(worker.close() for worker in self.workers.values()))

    async def submit(self, owner, query, *, purpose="analysis", opponent_model="human", human_rank="rank_20k"):
        key = "L9" if purpose == "analysis" else opponent_model
        async with self.lock:
            active = [job for job in self.jobs.values() if job.active]
            if (len(active) >= self.settings.max_jobs
                    or sum(j.owner == owner for j in active) >= self.settings.max_owner_jobs
                    or sum(len(j.turns) for j in active) + len(query.get("analyzeTurns", [0])) > self.settings.max_positions):
                raise OverflowError("分析队列已满，请稍后重试")
            if not (self.settings.model_dir / FILENAMES[key]).is_file():
                raise RuntimeError(f"模型 {key} 尚未下载，请运行模型下载命令")
            if key not in self.workers:
                if len(self.workers) >= 3:
                    idle = [k for k, w in self.workers.items() if k != "L9" and not any(j.active for j in w.jobs.values())]
                    if not idle:
                        raise OverflowError("陪练模型正在使用，请稍后切换")
                    victim = min(idle, key=lambda k: self.last_used.get(k, 0))
                    worker = self.workers.pop(victim)
                    await worker.close()
                    self.retired_jobs.update(worker.jobs)
                    self.retired_jobs = dict(list(self.retired_jobs.items())[-64:])
                s = replace(self.settings,
                            model=self.settings.model_dir / FILENAMES["L9" if key == "human" else key],
                            human_model=self.settings.model_dir / FILENAMES["human"] if key == "human" else None,
                            gpu=self.settings.gpu)
                worker = self.workers[key] = Engine(s)
                worker.listeners = self.listeners
                await worker.start()
            worker = self.workers[key]
            deadline = time.monotonic() + self.settings.startup_timeout
            while not worker.ready:
                if worker.error or time.monotonic() > deadline:
                    raise RuntimeError(f"模型 {key} 加载失败：{worker.error or '超时'}")
                await asyncio.sleep(0.1)
            query = dict(query)
            if key == "human":
                query.update(maxVisits=64, includePolicy=True,
                             overrideSettings={"humanSLProfile": human_rank, "ignorePreRootHistory": False})
            provenance = {"modelId": key, "modelName": FILENAMES[key], "purpose": purpose,
                          "maxVisits": query["maxVisits"]}
            if key == "human":
                provenance.update(humanRank=human_rank, searchModel=FILENAMES["L9"])
            self.last_used[key] = time.monotonic()
            return await worker.submit(owner, query, provenance=provenance)

    async def cancel(self, job, status="cancelled"):
        for worker in self.workers.values():
            if job.id in worker.jobs:
                await worker.cancel(job, status)
                return

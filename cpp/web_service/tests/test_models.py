import asyncio
import random

import pytest
from pydantic import ValidationError

from web_service.engine import Engine
from web_service.engine_pool import EnginePool
from web_service.models import FILENAMES, human_move
from web_service.schemas import AnalysisRequest, Record
from web_service.settings import Settings


@pytest.mark.parametrize("rank", [f"rank_{i}k" for i in range(1, 21)] + [f"rank_{i}d" for i in range(1, 10)])
def test_rank_validation_and_routing_fields(rank):
    request = AnalysisRequest(purpose="play", humanRank=rank)
    query = request.engine_query()
    assert not {"purpose", "opponentModel", "humanRank"} & query.keys()
    assert Record(humanRank=rank).humanRank == rank


@pytest.mark.parametrize("changes", [{"humanRank": "rank_21k"}, {"humanRank": "rank_10d"},
                                    {"opponentModel": "../model"}, {"purpose": "play", "analyzeTurns": [0]}])
def test_invalid_model_settings(changes):
    with pytest.raises(ValidationError):
        AnalysisRequest(**changes)


@pytest.mark.parametrize("size", [5, 7, 11, 15, 19])
def test_human_policy_coordinates_illegal_and_pass(size):
    policy = [-1] * (size * size) + [100]
    query = {"boardXSize": size}
    message = {"humanPolicy": policy, "moveInfos": [{"move": "C3", "order": 0}]}
    for index, expected in [(0, f"A{size}"), (size * size - 1, "ABCDEFGHJKLMNOPQRST"[size - 1] + "1")]:
        policy[index] = 1
        assert human_move(message, query) == expected
        policy[index] = -1
    with pytest.raises(ValueError):
        human_move(message, query)
    message["moveInfos"][0]["move"] = "pass"
    assert human_move(message, query) == "pass"
    del message["humanPolicy"]
    with pytest.raises(ValueError):
        human_move(message, query)


def test_human_samples_probability_not_search_order():
    policy = [0.0] * 26
    policy[0], policy[1] = 0.1, 0.9
    message = {"humanPolicy": policy, "moveInfos": [{"move": "A5", "order": 0}]}
    rng = random.Random(1234)
    choices = [human_move(message, {"boardXSize": 5}, rng) for _ in range(1000)]
    assert 850 < choices.count("B5") < 950


class Worker(Engine):
    async def start(self):
        self.ready = True

    async def close(self):
        self.ready = False

    async def write(self, message):
        self.last_query = message


def test_pool_teacher_routing_human_profile_limits_and_eviction(tmp_path, monkeypatch):
    from web_service import engine_pool
    monkeypatch.setattr(engine_pool, "Engine", Worker)
    for name in FILENAMES.values():
        (tmp_path / name).touch()

    async def scenario():
        pool = EnginePool(Settings(data=tmp_path, model_dir=tmp_path, max_owner_jobs=2))
        await pool.start()
        q = AnalysisRequest(size=5, moves=[("B", "C3")]).engine_query()
        first = await pool.submit("alice", q, opponent_model="L2")
        assert first.provenance["modelId"] == "L9"
        second = await pool.submit("alice", q, purpose="play", human_rank="rank_9d")
        assert second.query["maxVisits"] == 64
        assert second.query["overrideSettings"]["humanSLProfile"] == "rank_9d"
        assert pool.workers["human"].settings.human_model.name == FILENAMES["human"]
        with pytest.raises(OverflowError):
            await pool.submit("alice", q, purpose="play", opponent_model="L2")
        first.status = second.status = "completed"
        third = await pool.submit("bob", q, purpose="play", opponent_model="L6")
        third.status = "completed"
        fourth = await pool.submit("bob", q, purpose="play", opponent_model="L2")
        assert "human" not in pool.workers and len(pool.workers) == 3
        assert second.id in pool.jobs
        assert pool.workers["L2"].listeners is pool.listeners
        assert {worker.settings.gpu for worker in pool.workers.values()} == {0}
        await pool.cancel(fourth)
        assert fourth.status == "cancelled"
        await pool.close()
    asyncio.run(scenario())


@pytest.mark.parametrize("old,new", [("L1", "L2"), ("L3", "L6"), ("L7", "L6")])
def test_retired_models_are_not_selectable_but_old_games_load(old, new):
    with pytest.raises(ValidationError):
        AnalysisRequest(opponentModel=old)
    assert Record(opponentModel=old).opponentModel == new


def test_human_result_and_provenance_are_preserved(tmp_path):
    async def scenario():
        worker = Worker(Settings(data=tmp_path))
        await worker.start()
        provenance = {"modelId": "human", "modelName": FILENAMES["human"],
                      "purpose": "play", "maxVisits": 64, "humanRank": "rank_20k"}
        job = await worker.submit("alice", {"moves": [], "boardXSize": 5}, provenance)
        await worker._message({"id": job.id, "turnNumber": 0, "isDuringSearch": False,
                               "rootInfo": {}, "moveInfos": [{"order": 0, "move": "C3"}],
                               "humanPolicy": [1] + [0] * 25})
        assert job.status == "completed"
        assert job.results[0]["selectedMove"] == "A5"
        assert job.results[0]["provenance"] == provenance
        assert "humanPolicy" not in job.results[0]
    asyncio.run(scenario())

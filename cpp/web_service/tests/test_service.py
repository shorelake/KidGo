import asyncio
import time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from web_service.app import create_app
from web_service.engine import Engine, Job
from web_service.go import replay
from web_service.records import import_sgf, export_sgf, Store
from web_service.schemas import Position, Record, AnalysisRequest


def test_small_board_opening_pass_policy():
    base = dict(size=5, moves=[("B", "C3")], avoidEarlyPass=True)
    query = AnalysisRequest(**base).engine_query()
    assert query["avoidMoves"] == [{"player": "W", "moves": ["pass"], "untilDepth": 1}]
    assert "avoidEarlyPass" not in query
    for changes in [dict(size=19), dict(avoidEarlyPass=False), dict(moves=[("B", "pass")]),
                    dict(initialStones=[("W", "A1")]), dict(analyzeTurns=[1]),
                    dict(moves=[("B", "C3"), ("W", "B3"), ("B", "C2"), ("W", "B2"), ("B", "D3")])]:
        assert "avoidMoves" not in AnalysisRequest(**{**base, **changes}).engine_query()
from web_service.settings import Settings


def test_capture_suicide_and_ko():
    capture = Position(size=9, initialPlayer="W", initialStones=[("B","A1"),("W","B1")], moves=[("W","A2")])
    result = replay(capture)
    assert result["board"][8][0] == ""
    assert result["captures"]["W"] == 1
    with pytest.raises(ValueError, match="禁入点"):
        replay(Position(size=9,initialStones=[("W","B1"),("W","A2")],moves=[("B","A1")]))
    stones = [("B","B3"),("B","D3"),("B","C4"),("W","C3"),("W","B2"),("W","D2"),("W","C1")]
    with pytest.raises(ValueError, match="劫"):
        replay(Position(size=9,initialStones=stones,moves=[("B","C2"),("W","C3")]))
    assert replay(Position(size=9,initialStones=stones,moves=[("B","C2"),("W","H8"),("B","J9"),("W","C3")]))["captures"]["W"] == 1


def test_passes_and_invalid_history():
    assert replay(Position(moves=[("B","pass"),("W","pass")]))["ended"]
    for moves in [[("B","I4")],[("W","D4")],[("B","D4"),("W","D4")]]:
        with pytest.raises(ValueError):
            replay(Position(moves=moves))


def test_sgf_roundtrip_handicap_pass_comments():
    text = '(;FF[4]GM[1]SZ[9]KM[0.5]HA[2]AB[cc][gg]RU[Chinese]GN[测试]PB[甲]PW[乙]C[根];W[ee]C[中盘];B[];W[])'
    record, warnings = import_sgf(text)
    assert record.initialPlayer == "W" and record.comments[1] == "中盘" and not warnings
    copy, warnings = import_sgf(export_sgf(record))
    assert copy.model_dump() == record.model_dump()
    _, warnings = import_sgf('(;SZ[9];B[cc](;W[dd])(;W[ee]))')
    assert warnings
    with pytest.raises(ValueError):
        import_sgf('(;SZ[9];B[cc];AB[dd])')
    with pytest.raises(ValueError):
        import_sgf('not an sgf')


def test_store_isolation_conflict_and_restart(tmp_path):
    store = Store(tmp_path / "test.sqlite")
    record = Record(moves=[("B","D4")])
    saved = store.save("alice",record)
    with pytest.raises(KeyError):
        store.get("bob", saved["id"])
    assert store.list("bob") == []
    assert Store(tmp_path / "test.sqlite").get("alice", saved["id"])["record"]["moves"] == [["B","D4"]]
    store.save("alice",record,saved["id"],1)
    with pytest.raises(ValueError, match="更新"):
        store.save("alice",record,saved["id"],1)
    with pytest.raises(KeyError):
        store.delete("bob", saved["id"])


class FakeEngine(Engine):
    async def start(self):
        self.ready = True
    async def close(self):
        pass
    async def write(self, message):
        pass


def test_api_auth_limits_and_isolation(tmp_path):
    settings = Settings(data=tmp_path, token="test-token")
    engine = FakeEngine(settings)
    app = create_app(settings,engine)
    with TestClient(app) as alice:
        assert not alice.get('/api/session').json()['authenticated']
        assert alice.get('/api/games').status_code == 401
        assert alice.post('/api/login',json={"token":"test-token"}).status_code == 200
        assert alice.post('/api/position',json={"moves":[["B","I4"]]}).status_code == 422
        assert alice.post('/api/analyze',json={"maxVisits":10001}).status_code == 422
        assert alice.post('/api/analyze',json={"analyzeTurns":[0,0]}).status_code == 422
        assert alice.post('/api/analyze',json={},headers={"Origin":"http://evil.test"}).status_code == 403
        with alice.websocket_connect('/api/ws') as ws:
            ws.send_text('ping')
            job = alice.post('/api/analyze',json={}).json()
            assert alice.post('/api/analyze',json={}).status_code == 202
            assert alice.post('/api/analyze',json={}).status_code == 429
            assert alice.post('/api/analyze/'+job['id']+'/cancel',json={}).json()['status'] == 'cancelled'
            assert ws.receive_json()['id'] == job['id']
        saved=alice.post('/api/games',json={"record":Record().model_dump()}).json()
        bob = TestClient(app)
        bob.post('/api/login',json={"token":"test-token"})
        assert bob.get('/api/games/'+saved['id']).status_code == 404
        assert bob.get('/api/analyze/'+job['id']).status_code == 404


def test_out_of_order_completion_and_cancel_capacity(tmp_path):
    async def scenario():
        engine=FakeEngine(Settings(data=tmp_path,max_owner_jobs=1))
        await engine.start()
        job=await engine.submit('a',{"moves":[["B","D4"]],"analyzeTurns":[0,1]})
        await engine._message({"id":job.id,"turnNumber":1,"isDuringSearch":False,"rootInfo":{}})
        assert job.status == 'running'
        await engine.cancel(job)
        with pytest.raises(OverflowError):
            await engine.submit('a',{"moves":[]})
        await engine._message({"id":job.id,"turnNumber":0,"isDuringSearch":False,"noResults":True})
        assert job.status == 'cancelled' and not job.active
        await engine.submit('a',{"moves":[]})
    asyncio.run(scenario())


@pytest.mark.parametrize("size", [5,7,9,11,13,15,19])
def test_board_sizes_sgf_roundtrip(size):
    record = Record(size=size,moves=[("B","C3")])
    board = replay(record)["board"]
    assert len(board) == size and len(board[0]) == size
    restored, _ = import_sgf(export_sgf(record))
    assert restored.size == size and restored.moves == record.moves


def test_process_restart_timeout_and_shutdown(tmp_path):
    binary = tmp_path / "fake-katago"
    binary.write_bytes((Path(__file__).parent / "fake_katago.py").read_bytes())
    binary.chmod(0o755)
    model = tmp_path / "model"
    model.touch()
    config = tmp_path / "config"
    config.touch()

    async def wait_for(predicate):
        async with asyncio.timeout(8):
            while not predicate():
                await asyncio.sleep(.02)

    async def scenario():
        engine = Engine(Settings(binary=binary,model=model,config=config,data=tmp_path))
        await engine.start()
        try:
            await wait_for(lambda: engine.ready)
            job = await engine.submit("a", {"moves":[]})
            job.deadline = time.monotonic() - 1
            await wait_for(lambda: job.status == "timed_out" and not job.active)
            crash = await engine.submit("a", {"moves":[["B","crash"]]})
            await wait_for(lambda: crash.status == "failed")
            await wait_for(lambda: engine.ready and engine.restarts >= 1)
            process = engine.process
        finally:
            await engine.close()
        assert process.returncode is not None
    asyncio.run(scenario())

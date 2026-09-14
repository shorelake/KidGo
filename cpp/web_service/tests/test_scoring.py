import pytest
from web_service.schemas import Position, Record
from web_service.scoring import score_position


def test_area_score_requires_passes_and_handles_dead_stones_and_komi():
    with pytest.raises(ValueError, match="连续"):
        score_position(Position(size=5), [])
    p = Position(size=5, komi=0.5, initialStones=[("B", "B1"), ("W", "A1")], moves=[("B", "pass"), ("W", "pass")])
    result = score_position(p, ["A1"])
    assert result["black"] == 25 and result["white"] == 0.5
    assert result["result"] == "B+24.5"
    for invalid in ["pass", "E5", "T19"]:
        with pytest.raises(ValueError):
            score_position(p, [invalid])


def test_empty_territory_score_komi_and_draw():
    for rules in ["chinese", "japanese"]:
        p = Position(size=5, rules=rules, komi=6.5, moves=[("B", "pass"), ("W", "pass")])
        assert score_position(p, [])["result"] == "W+6.5"
        assert score_position(p.model_copy(update={"komi": 0}), [])["result"] == "0"


def test_japanese_score_includes_captures():
    p = Position(size=5, rules="japanese", komi=0, initialStones=[("B", "B1"), ("W", "A1")],
                 moves=[("B", "A2"), ("W", "pass"), ("B", "pass")])
    result = score_position(p, [])
    assert result["black"] >= 1
    without_capture = p.model_copy(update={"initialStones": [("B", "B1"), ("B", "A2")], "moves": [("B", "pass"), ("W", "pass")]})
    assert result["black"] == score_position(without_capture, [])["black"] + 1


def test_training_settings_validate_and_default_for_old_records():
    assert Record().aiLevel == "standard" and Record().captureTarget == 0
    for target in [3, 5, 7, 13, 21]:
        assert Record(captureTarget=target).captureTarget == target
    for field, value in [("aiLevel", "9dan"), ("captureTarget", 2)]:
        with pytest.raises(ValueError):
            Record(**{field: value})

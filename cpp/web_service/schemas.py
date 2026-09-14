from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

OpponentModel = Literal["human", "L9", "L6", "L2"]
RANK_PATTERN = r"^rank_(?:[1-9]k|1[0-9]k|20k|[1-9]d)$"


class Position(BaseModel):
    model_config = ConfigDict(extra="forbid")
    size: Literal[5, 7, 9, 11, 13, 15, 19] = 19
    rules: Literal["chinese", "japanese"] = "chinese"
    komi: float = Field(default=7.5, ge=-100, le=100)
    initialPlayer: Literal["B", "W"] = "B"
    initialStones: list[tuple[Literal["B", "W"], str]] = Field(default_factory=list, max_length=361)
    moves: list[tuple[Literal["B", "W"], str]] = Field(default_factory=list, max_length=1000)

    @model_validator(mode="after")
    def validate_komi(self):
        if self.komi * 2 != int(self.komi * 2):
            raise ValueError("贴目必须为整数或半整数")
        return self


class AnalysisRequest(Position):
    purpose: Literal["analysis", "play"] = "analysis"
    opponentModel: OpponentModel = "human"
    humanRank: str = Field(default="rank_20k", pattern=RANK_PATTERN)
    maxVisits: int = Field(default=500, ge=1, le=10000)
    analyzeTurns: list[int] | None = Field(default=None, min_length=1, max_length=1001)
    includeOwnership: bool = False
    avoidEarlyPass: bool = False

    @model_validator(mode="after")
    def validate_turns(self):
        if self.purpose == "play" and self.analyzeTurns is not None:
            raise ValueError("对弈落子只允许分析当前局面")
        if self.analyzeTurns is not None:
            if len(set(self.analyzeTurns)) != len(self.analyzeTurns) or any(t < 0 or t > len(self.moves) for t in self.analyzeTurns):
                raise ValueError("分析手数超出棋谱范围或重复")
        return self

    def engine_query(self):
        result = self.model_dump(exclude={"size", "avoidEarlyPass", "purpose", "opponentModel", "humanRank"}, exclude_none=True)
        result.update(boardXSize=self.size, boardYSize=self.size, reportDuringSearchEvery=0.25, analysisPVLen=16)
        # Small-board teaching games should develop an opening before passing.
        if (self.avoidEarlyPass and self.size <= 7 and not self.initialStones
                and len(self.moves) < self.size and self.analyzeTurns is None
                and not any(move == "pass" for _, move in self.moves)):
            player = ("W" if self.moves[-1][0] == "B" else "B") if self.moves else self.initialPlayer
            result["avoidMoves"] = [{"player": player, "moves": ["pass"], "untilDepth": 1}]
        return result


class RootInfo(BaseModel):
    currentPlayer: Literal["B", "W"]
    winrate: float = Field(ge=0, le=1)
    scoreLead: float = Field(ge=-1000, le=1000)
    visits: int = Field(ge=0)


class MoveInfo(BaseModel):
    move: str = Field(max_length=8)
    order: int = Field(ge=0)
    winrate: float = Field(ge=0, le=1)
    scoreLead: float = Field(ge=-1000, le=1000)
    visits: int = Field(ge=0)
    pv: list[str] = Field(default_factory=list, max_length=64)


class AnalysisProvenance(BaseModel):
    modelId: Literal["human", "L9", "L7", "L6", "L3", "L2", "L1"]
    modelName: str = Field(max_length=160)
    purpose: Literal["analysis", "play"]
    maxVisits: int = Field(ge=1, le=10000)
    humanRank: str | None = Field(default=None, pattern=RANK_PATTERN)
    searchModel: str | None = Field(default=None, max_length=160)


class SavedAnalysis(BaseModel):
    provenance: AnalysisProvenance | None = None
    rootInfo: RootInfo
    moveInfos: list[MoveInfo] = Field(default_factory=list, max_length=8)
    turnNumber: int = Field(ge=0, le=1000)


class Record(Position):
    @model_validator(mode="before")
    @classmethod
    def migrate_retired_opponent(cls, data):
        if isinstance(data, dict) and data.get("opponentModel") in {"L1", "L3", "L7"}:
            return {**data, "opponentModel": {"L1": "L2", "L3": "L6", "L7": "L6"}[data["opponentModel"]]}
        return data

    opponentModel: OpponentModel = "human"
    humanRank: str = Field(default="rank_20k", pattern=RANK_PATTERN)
    aiLevel: Literal["starter", "beginner", "standard", "advanced", "expert"] = "standard"
    # Keep legacy 1/8-stone goals readable in saved records.
    captureTarget: Literal[0, 1, 3, 5, 7, 8, 13, 21] = 0
    title: str = Field(default="未命名棋谱", min_length=1, max_length=120)
    black: str = Field(default="黑方", max_length=120)
    white: str = Field(default="白方", max_length=120)
    result: str = Field(default="", max_length=40)
    comments: dict[int, str] = Field(default_factory=dict, max_length=1001)
    analyses: dict[int, SavedAnalysis] = Field(default_factory=dict, max_length=1001)

    @model_validator(mode="after")
    def validate_metadata(self):
        if any(t < 0 or t > len(self.moves) or len(c) > 4000 for t, c in self.comments.items()):
            raise ValueError("棋谱注释无效")
        if any(t < 0 or t > len(self.moves) or a.turnNumber != t for t, a in self.analyses.items()):
            raise ValueError("分析记录手数无效")
        return self

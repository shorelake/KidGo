from .go import replay, point
from .vendor import goscorer


def score_position(position, dead_stones):
    state = replay(position)
    if not state["ended"]:
        raise ValueError("双方连续停一手后才能计分")
    stones = [[{"": 0, "B": 1, "W": 2}[stone] for stone in row] for row in state["board"]]
    marked = [[False] * position.size for _ in range(position.size)]
    for move in dead_stones:
        p = point(move, position.size)
        if p is None:
            raise ValueError("死子坐标不能为停着")
        row, col = position.size - 1 - p[0], p[1]
        if not stones[row][col]:
            raise ValueError("只能标记棋盘上已有的棋子")
        marked[row][col] = True
    if position.rules == "chinese":
        scores = goscorer.final_area_score(stones, marked, position.komi)
    else:
        scores = goscorer.final_territory_score(stones, marked, state["captures"]["B"], state["captures"]["W"], position.komi)
    difference = scores[1] - scores[2]
    return {"black": scores[1], "white": scores[2], "komi": position.komi,
            "result": "0" if difference == 0 else f'{"B" if difference > 0 else "W"}+{abs(difference):g}',
            "deadStones": dead_stones}

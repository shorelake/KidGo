import re
from sgfmill import boards

LETTERS = "ABCDEFGHJKLMNOPQRST"


def point(value, size):
    if value == "pass":
        return None
    if not re.fullmatch(r"[A-HJ-T][1-9][0-9]?", value):
        raise ValueError(f"无效坐标：{value[:30]}")
    row, col = int(value[1:]) - 1, LETTERS.index(value[0])
    if row >= size or col >= size:
        raise ValueError("坐标超出棋盘")
    return row, col


def coordinate(p):
    return "pass" if p is None else f"{LETTERS[p[1]]}{p[0] + 1}"


def replay(position):
    board = boards.Board(position.size)
    setup = {"B": set(), "W": set()}
    for color, move in position.initialStones:
        p = point(move, position.size)
        if p is None or p in setup["B"] or p in setup["W"]:
            raise ValueError("初始棋子重复或坐标无效")
        setup[color].add(p)
    if not board.apply_setup(setup["B"], setup["W"], []):
        raise ValueError("初始局面存在无气棋块")
    captures, ko, player, passes = {"B": 0, "W": 0}, None, position.initialPlayer, 0
    for index, (color, move) in enumerate(position.moves):
        if color != player:
            raise ValueError(f"第 {index + 1} 手行棋方错误")
        p = point(move, position.size)
        if p is None:
            ko = None
            passes += 1
        else:
            if p == ko:
                raise ValueError(f"第 {index + 1} 手不能立即回提劫")
            before = len(board.list_occupied_points())
            try:
                ko = board.play(*p, color.lower())
            except ValueError:
                raise ValueError(f"第 {index + 1} 手位置已有棋子") from None
            if board.get(*p) != color.lower():
                raise ValueError(f"第 {index + 1} 手为禁入点")
            captures[color] += before + 1 - len(board.list_occupied_points())
            passes = 0
        player = "W" if color == "B" else "B"
    return {"board": [[(board.get(r, c) or "").upper() for c in range(position.size)]
                      for r in range(position.size - 1, -1, -1)],
            "player": player, "captures": captures, "ended": passes >= 2,
            "ko": coordinate(ko) if ko else None}

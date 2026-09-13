import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from sgfmill import sgf
from .go import coordinate, point, replay
from .schemas import Record


def import_sgf(content):
    try:
        game = sgf.Sgf_game.from_string(content)
        root = game.get_root()
        size = game.get_size()
        if size not in (5, 7, 9, 11, 13, 15, 19):
            raise ValueError("仅支持 5、7、9、11、13、15、19 路棋盘")
        rules_name = (root.get("RU") if root.has_property("RU") else "Chinese").lower()
        rule_map = {"chinese": "chinese", "china": "chinese", "日本": "japanese", "japanese": "japanese", "japan": "japanese", "中国": "chinese"}
        if rules_name not in rule_map:
            raise ValueError(f"暂不支持棋谱规则：{rules_name[:40]}")
        black, white, empty = root.get_setup_stones()
        initial = [("B", coordinate(p)) for p in sorted(black - empty)] + [("W", coordinate(p)) for p in sorted(white - empty)]
        initial_player = root.get("PL").upper() if root.has_property("PL") else ("W" if game.get_handicap() and game.get_handicap() >= 2 else "B")
        nodes = list(game.get_main_sequence())
        moves, comments, warnings = [], {}, []
        if any(len(n) > 1 for n in nodes):
            warnings.append("已导入主线；旁支变化未导入")
        for i, node in enumerate(nodes):
            if i and node.has_setup_stones():
                raise ValueError("暂不支持主线中途摆子，请导出纯落子主线")
            color, p = node.get_move()
            if color:
                if not moves and not root.has_property("PL"):
                    initial_player = color.upper()
                moves.append((color.upper(), coordinate(p)))
            if node.has_property("C"):
                comments[len(moves)] = node.get("C")
        record = Record(size=size, rules=rule_map[rules_name], komi=game.get_komi(),
                        initialPlayer=initial_player, initialStones=initial, moves=moves,
                        title=root.get("GN") if root.has_property("GN") else "导入棋谱",
                        black=game.get_player_name("b") or "黑方", white=game.get_player_name("w") or "白方",
                        result=root.get("RE") if root.has_property("RE") else "", comments=comments)
        replay(record)
        return record, warnings
    except (ValueError, KeyError, IndexError, UnicodeError) as exc:
        raise ValueError(f"SGF 导入失败：{str(exc)[:200]}") from None


def export_sgf(record):
    replay(record)
    game = sgf.Sgf_game(record.size)
    root = game.get_root()
    for key, value in {"GN": record.title, "PB": record.black, "PW": record.white,
                       "KM": record.komi, "RU": record.rules, "PL": record.initialPlayer.lower(),
                       "AP": ("KataGoWeb", "1.0")}.items():
        root.set(key, value)
    if record.result:
        root.set("RE", record.result)
    root.set_setup_stones({point(m, record.size) for c, m in record.initialStones if c == "B"},
                          {point(m, record.size) for c, m in record.initialStones if c == "W"})
    if record.comments.get(0):
        root.set("C", record.comments[0])
    for turn, (color, move) in enumerate(record.moves, 1):
        node = game.extend_main_sequence()
        node.set_move(color.lower(), point(move, record.size))
        if record.comments.get(turn):
            node.set("C", record.comments[turn])
    return game.serialise().decode("utf-8")


class Store:
    def __init__(self, path):
        self.path = path
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, owner TEXT NOT NULL, body TEXT NOT NULL, version INTEGER NOT NULL, updated REAL NOT NULL)")
            db.execute("CREATE INDEX IF NOT EXISTS games_owner ON games(owner, updated)")
        path.chmod(0o600)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def list(self, owner):
        with self.connect() as db:
            rows = db.execute("SELECT id,body,version,updated FROM games WHERE owner=? ORDER BY updated DESC", (owner,)).fetchall()
        return [{"id": id, "title": (body := json.loads(raw))["title"], "size": body["size"],
                 "moves": len(body["moves"]), "black": body["black"], "white": body["white"],
                 "result": body["result"], "version": version, "updated": updated} for id, raw, version, updated in rows]

    def get(self, owner, identifier):
        with self.connect() as db:
            row = db.execute("SELECT body,version,updated FROM games WHERE id=? AND owner=?", (identifier, owner)).fetchone()
        if not row:
            raise KeyError(identifier)
        return {"id": identifier, "record": json.loads(row[0]), "version": row[1], "updated": row[2]}

    def save(self, owner, record, identifier=None, version=None):
        body, now = record.model_dump_json(), time.time()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if identifier:
                row = db.execute("SELECT version FROM games WHERE id=? AND owner=?", (identifier, owner)).fetchone()
                if not row:
                    raise KeyError(identifier)
                if row[0] != version:
                    raise ValueError("棋谱已在其他页面更新，请重新打开后再编辑")
                version += 1
                db.execute("UPDATE games SET body=?,version=?,updated=? WHERE id=? AND owner=?", (body, version, now, identifier, owner))
            else:
                if db.execute("SELECT count(*) FROM games WHERE owner=?", (owner,)).fetchone()[0] >= 200:
                    raise OverflowError("棋谱数量已达 200，请先删除旧棋谱")
                identifier, version = uuid.uuid4().hex, 1
                db.execute("INSERT INTO games VALUES (?,?,?,?,?)", (identifier, owner, body, version, now))
        return {"id": identifier, "version": version, "updated": now}

    def delete(self, owner, identifier):
        with self.connect() as db:
            if not db.execute("DELETE FROM games WHERE id=? AND owner=?", (identifier, owner)).rowcount:
                raise KeyError(identifier)

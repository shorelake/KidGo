"""Explicit network catalog and Human SL policy sampling."""
import math
import random

FILENAMES = {
    "L9": "kata1-tf3-b11c768-s11001M-d5973M.bin.gz",
    "L6": "kata1-b18c384nbt-s8617907712-d3952620469.bin.gz",
    "L2": "kata1-b10c128-s41138688-d27396855.txt.gz",
    "human": "b18c384nbt-humanv0.bin.gz",
}
BASE_URL = "https://media.katagotraining.org/uploaded/networks/models/kata1/"
DOWNLOAD_URLS = {key: BASE_URL + name for key, name in FILENAMES.items()}
DOWNLOAD_URLS["human"] = "https://github.com/lightvector/KataGo/releases/download/v1.15.0/b18c384nbt-humanv0.bin.gz"


def human_move(message, query, rng=random):
    size = query["boardXSize"]
    policy = message.get("humanPolicy")
    if not isinstance(policy, list) or len(policy) != size * size + 1:
        raise ValueError("Human SL 未返回有效段位策略，请检查模型和段位配置")
    candidates = sorted(message.get("moveInfos", []), key=lambda m: m["order"])
    if not candidates:
        raise ValueError("Human SL 未返回有效搜索结果")
    if candidates[0]["move"] == "pass":
        return "pass"
    # Policy coordinates run from the top-left intersection; the final slot is pass.
    points = [(i, p) for i, p in enumerate(policy[:-1])
              if isinstance(p, (int, float)) and math.isfinite(p) and p > 0]
    if not points:
        raise ValueError("Human SL 没有可用的合法落点")
    index = rng.choices([i for i, _ in points], weights=[p for _, p in points], k=1)[0]
    return "ABCDEFGHJKLMNOPQRST"[index % size] + str(size - index // size)

import React, { useEffect, useState } from "react";
import Board from "./Board";
import { api, letters, positionOf } from "./api";
import { resultLabel } from "./gameplay";

export default function Scoring({ record, board, onConfirm, onResume }) {
  const [dead, setDead] = useState([]),
    [score, setScore] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setScore(null);
    setError("");
    api("/score", { position: positionOf(record), deadStones: dead })
      .then((result) => {
        if (current) setScore(result);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [record, dead]);
  function toggle(move) {
    const y = record.size - Number(move.slice(1)),
      x = letters.indexOf(move[0]);
    const color = board[y][x];
    if (!color) return;
    const group = new Set(),
      queue = [[y, x]];
    while (queue.length) {
      const [r, c] = queue.pop(),
        key = letters[c] + (record.size - r);
      if (group.has(key)) continue;
      group.add(key);
      for (const [nr, nc] of [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ])
        if (board[nr]?.[nc] === color) queue.push([nr, nc]);
    }
    setScore(null);
    setDead(
      dead.includes(move)
        ? dead.filter((m) => !group.has(m))
        : [...new Set([...dead, ...group])],
    );
  }
  return (
    <div className="scoring-form">
      <p title="点击棋块可标记或取消死子；半透明棋块按死子计分。">
        死子确认 · {dead.length} 子
      </p>
      <Board
        size={record.size}
        board={board}
        onMark={toggle}
        deadStones={dead}
      />
      <p>
        {record.rules === "chinese"
          ? "中国规则 · 子空合计"
          : "日本规则 · 地与提子合计"}{" "}
        · 白棋含贴目 {record.komi}
      </p>
      {score && (
        <p className="score-total">
          黑 {score.black} · 白 {score.white} · {resultLabel(score.result)}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="scoring-actions">
        <button onClick={onResume}>继续下棋</button>
        <button
          className="primary"
          disabled={!score}
          onClick={() => onConfirm(score)}
        >
          确认死子与结果
        </button>
      </div>
    </div>
  );
}

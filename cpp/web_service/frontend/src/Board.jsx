import React, { useEffect, useState } from "react";
import { letters } from "./api";

export default function Board({
  size,
  board,
  onPlay,
  disabled,
  candidates = [],
  lastMove,
  ownership,
  numbers = {},
  preview = false,
  player = "B",
  positionKey,
  onMark,
  deadStones = [],
}) {
  const [pending, setPending] = useState(null);
  useEffect(() => setPending(null), [board, disabled, preview, positionKey]);
  const step = 560 / size,
    margin = (600 - step * (size - 1)) / 2,
    xy = (r, c) => [margin + c * step, margin + r * step];
  function choose(move, stone) {
    if (onMark) {
      if (!disabled && stone) onMark(move);
      return;
    }
    if (disabled || stone) return;
    if (pending === move) {
      setPending(null);
      onPlay(move);
    } else setPending(move);
  }
  const edge = size >= 11 ? 3 : 2;
  const stars =
    size <= 7 ? [(size - 1) / 2] : [edge, (size - 1) / 2, size - 1 - edge];
  return (
    <svg
      className={"board" + (preview ? " preview" : "")}
      viewBox="0 0 600 600"
      role="group"
      aria-label={`${size}路围棋棋盘`}
      onKeyDown={(e) => {
        if (e.key === "Escape") setPending(null);
      }}
    >
      <defs>
        <radialGradient id="black-stone" cx="35%" cy="25%" r="80%">
          <stop stopColor="#505454" />
          <stop offset="0.55" stopColor="#222626" />
          <stop offset="1" stopColor="#0d1111" />
        </radialGradient>
        <radialGradient id="white-stone" cx="35%" cy="25%" r="80%">
          <stop stopColor="#fff" />
          <stop offset="0.7" stopColor="#f4f5f2" />
          <stop offset="1" stopColor="#cdd2cd" />
        </radialGradient>
      </defs>
      <rect width="600" height="600" fill="#daca9c" />
      {Array.from({ length: size }, (_, i) => (
        <g key={i}>
          <path
            d={`M${margin} ${margin + i * step}H${600 - margin} M${margin + i * step} ${margin}V${600 - margin}`}
            stroke="#756f54"
            strokeWidth="0.9"
          />
          <text
            x={margin + i * step}
            y={margin - step * 0.55}
            textAnchor="middle"
            className="coord"
          >
            {letters[i]}
          </text>
          <text
            x={margin - step * 0.63}
            y={margin + 4 + i * step}
            textAnchor="middle"
            className="coord"
          >
            {size - i}
          </text>
        </g>
      ))}
      {stars.flatMap((r) =>
        stars.map((c) => (
          <circle
            key={`${r}-${c}`}
            cx={xy(r, c)[0]}
            cy={xy(r, c)[1]}
            r="2.6"
            fill="#595743"
          />
        )),
      )}
      {board.flatMap((row, r) =>
        row.map((stone, c) => {
          const [x, y] = xy(r, c),
            move = letters[c] + (size - r),
            candidate = candidates.find((m) => m.move === move);
          const territory = ownership?.[r * size + c];
          return (
            <g
              key={move}
              className="board-point"
              data-color={stone}
              data-move={move}
            >
              {territory != null && !stone && (
                <rect
                  x={x - step * 0.33}
                  y={y - step * 0.33}
                  width={step * 0.66}
                  height={step * 0.66}
                  fill={territory > 0 ? "#181e20" : "#ffffff"}
                  opacity={Math.abs(territory) * 0.5}
                />
              )}
              {stone && (
                <circle
                  className="stone"
                  opacity={deadStones.includes(move) ? 0.3 : 1}
                  cx={x}
                  cy={y + 0.6}
                  r={step * 0.455}
                  fill={`url(#${stone === "B" ? "black" : "white"}-stone)`}
                  stroke={stone === "B" ? "#101919" : "#b7bbaa"}
                  strokeWidth="0.6"
                />
              )}
              {stone && deadStones.includes(move) && (
                <path
                  d={`M${x - step * 0.2} ${y - step * 0.2}L${x + step * 0.2} ${y + step * 0.2}M${x + step * 0.2} ${y - step * 0.2}L${x - step * 0.2} ${y + step * 0.2}`}
                  stroke="#be493e"
                  strokeWidth="3"
                  pointerEvents="none"
                />
              )}
              {stone && numbers[move] ? (
                <text
                  x={x}
                  y={y + step * 0.13}
                  textAnchor="middle"
                  fill={stone === "B" ? "white" : "#182322"}
                  fontSize={step * 0.4}
                >
                  {numbers[move]}
                </text>
              ) : (
                stone &&
                move === lastMove && (
                  <circle
                    cx={x}
                    cy={y}
                    r={step * 0.15}
                    fill="none"
                    stroke={stone === "B" ? "#f6f9f6" : "#273532"}
                    strokeWidth="1.8"
                  />
                )
              )}
              {!stone && candidate && pending !== move && (
                <g className="recommendation-marker" data-player={player}>
                  <title>
                    {player === "B" ? "黑方" : "白方"}推荐 {move}，候选{" "}
                    {candidate.order + 1}
                  </title>
                  <circle
                    cx={x}
                    cy={y}
                    r={step * 0.43}
                    fill={candidate.order === 0 ? "#16765a" : "#347caa"}
                    opacity="0.92"
                  />
                  <text
                    x={x}
                    y={y + step * 0.14}
                    textAnchor="middle"
                    fill="white"
                    fontSize={step * 0.4}
                  >
                    {candidate.order + 1}
                  </text>
                  <circle
                    className="recommendation-ring"
                    cx={x}
                    cy={y}
                    r={step * 0.46}
                    fill="none"
                    stroke={player === "B" ? "#17221c" : "#fff"}
                    strokeWidth={step * 0.055}
                    strokeDasharray={`${step * 0.09} ${step * 0.055}`}
                    pointerEvents="none"
                  />
                </g>
              )}
              {!stone && pending === move && (
                <circle
                  className="pending-stone"
                  data-player={player}
                  cx={x}
                  cy={y}
                  r={step * 0.445}
                  fill={player === "B" ? "#34443d" : "#fff"}
                  fillOpacity={player === "B" ? 0.18 : 0.55}
                  stroke={player === "B" ? "#526c5d" : "#fcfff9"}
                  strokeWidth="2.5"
                  strokeDasharray={`${step * 0.055} ${step * 0.065}`}
                  pointerEvents="none"
                />
              )}
              {!stone && (
                <circle
                  className="focus-ring"
                  cx={x}
                  cy={y}
                  r={step * 0.46}
                  fill="none"
                  stroke="#6d8269"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  pointerEvents="none"
                />
              )}
              <rect
                x={x - step / 2}
                y={y - step / 2}
                width={step}
                height={step}
                fill="transparent"
                role="button"
                aria-label={move}
                aria-disabled={disabled || (onMark ? !stone : !!stone)}
                aria-pressed={
                  onMark ? deadStones.includes(move) : pending === move
                }
                tabIndex={disabled || (onMark ? !stone : stone) ? -1 : 0}
                className={!disabled && !stone ? "intersection" : ""}
                onClick={() => choose(move, stone)}
                onKeyDown={(e) => {
                  if (!disabled && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    choose(move, stone);
                  }
                }}
              />
            </g>
          );
        }),
      )}
    </svg>
  );
}

import React from "react";
import { levels } from "./gameplay";

const modelIds = ["human", "L2", "L6", "L9"];
const ranks = [
  ...Array.from({ length: 20 }, (_, i) => [`rank_${20 - i}k`, `${20 - i} 级`]),
  ...Array.from({ length: 9 }, (_, i) => [`rank_${i + 1}d`, `${i + 1} 段`]),
];

export default function OpponentSettings({
  record,
  onChange,
  disabled,
  models = [],
  prefix = "",
}) {
  const human = (record.opponentModel || "human") === "human";
  return (
    <>
      <label>
        对手模型
        <select
          aria-label={prefix + "对手模型"}
          value={record.opponentModel || "human"}
          disabled={disabled}
          onChange={(e) => onChange({ opponentModel: e.target.value })}
        >
          {modelIds.map((id) => {
            const model = models.find((m) => m.id === id);
            return (
              <option
                key={id}
                value={id}
                disabled={model?.available === false}
                title={model?.name}
              >
                {id === "human" ? "Human SL 陪练" : id}
                {model?.available === false ? "（未下载）" : ""}
              </option>
            );
          })}
        </select>
      </label>
      {human && (
        <label title="Human SL 模拟对应段位的落子风格；小棋盘不保证与正式段位棋力一致。">
          陪练段位
          <select
            aria-label={prefix + "陪练段位"}
            value={record.humanRank || "rank_20k"}
            disabled={disabled}
            onChange={(e) => onChange({ humanRank: e.target.value })}
          >
            {ranks.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label
        title={
          human
            ? "Human SL 使用陪练段位；AI 强度适用于普通对弈模型。"
            : "控制搜索量与选点容错，不等同于正式段位。"
        }
      >
        AI 强度
        <select
          aria-label={prefix + "AI 强度"}
          value={record.aiLevel || "standard"}
          disabled={disabled || human}
          onChange={(e) => onChange({ aiLevel: e.target.value })}
        >
          {Object.entries(levels).map(([key, level]) => (
            <option key={key} value={key}>
              {level.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

import React from "react";
import { ChevronRight } from "lucide-react";
import { positionExplanation, gameReview } from "./explanations";

export default function AnalysisExplanation({
  record,
  cursor,
  analysis,
  onNavigate,
  disabled,
}) {
  const lines = positionExplanation(record, cursor, analysis);
  const review = gameReview(record);
  if (!lines.length && !Object.keys(record.analyses).length) return null;
  return (
    <section className="analysis-explanation" aria-label="学习解读">
      <h2>局面解读</h2>
      {lines.length ? (
        lines.map((line, index) => <p key={index}>{line}</p>)
      ) : (
        <p>当前手尚未分析。</p>
      )}
      <p className="explanation-source">
        依据 KataGo 搜索与坐标生成；棋理观察是学习方向，不是已验证的战术结论。
      </p>
      {record.moves.length > 0 && (
        <>
          <h2>复盘重点</h2>
          <p>
            已比较 {review.compared} / {record.moves.length}{" "}
            手。仅比较落子前同一搜索中的推荐着法与实战着法；实战落点未进入候选时不估算失分。
          </p>
          {review.mistakes.map((item) => (
            <button
              className="review-mistake"
              key={item.turn}
              onClick={() => onNavigate(item.turn - 1)}
              disabled={disabled}
            >
              <span>
                第 {item.turn} 手 · {item.player === "B" ? "黑" : "白"}{" "}
                {item.move === "pass" ? "停一手" : item.move}
                <small>
                  预计损失 {item.loss.toFixed(1)} 目 · 推荐{" "}
                  {item.best === "pass" ? "停一手" : item.best}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
          {!review.mistakes.length && (
            <p>
              {review.compared
                ? "已比较着法中，暂无预计损失达到 0.5 目的着法。"
                : "暂无可比较着法。"}
            </p>
          )}
        </>
      )}
    </section>
  );
}

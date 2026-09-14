export const levels = {
  starter: { label: "启蒙", visits: 32, loss: 12, temperature: 5 },
  beginner: { label: "入门", visits: 128, loss: 6, temperature: 2.5 },
  standard: { label: "进阶", visits: 500, loss: 2, temperature: 0.7 },
  advanced: { label: "熟练", visits: 2000, loss: 0, temperature: 0 },
  expert: { label: "挑战", visits: 6000, loss: 0, temperature: 0 },
};

export function chooseBotMove(
  result,
  level = "standard",
  random = Math.random,
) {
  const moves = [...(result?.moveInfos || [])].sort(
    (a, b) => a.order - b.order,
  );
  const best = moves[0],
    settings = levels[level] || levels.standard;
  if (!best || !settings.temperature || best.move === "pass") return best?.move;
  const sign = result.rootInfo.currentPlayer === "B" ? 1 : -1;
  const candidates = moves.filter(
    (m) =>
      m.move !== "pass" &&
      sign * (best.scoreLead - m.scoreLead) <= settings.loss,
  );
  if (!candidates.length) return best.move;
  const weights = candidates.map((m) =>
    Math.exp(
      -Math.max(0, sign * (best.scoreLead - m.scoreLead)) /
        settings.temperature,
    ),
  );
  let sample = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) {
    sample -= weights[i];
    if (sample <= 0) return candidates[i].move;
  }
  return candidates.at(-1).move;
}

export function practiceResult(captures, target) {
  if (!target) return "";
  const lead = captures.B - captures.W;
  return Math.abs(lead) >= target ? (lead > 0 ? "B+Capture" : "W+Capture") : "";
}

export function resultLabel(result) {
  if (result === "0") return "和棋";
  if (result.endsWith("+Capture"))
    return `${result[0] === "B" ? "黑方" : "白方"}吃子达标获胜`;
  if (/^[BW]\+/.test(result))
    return `${result[0] === "B" ? "黑方" : "白方"}胜${result.endsWith("+R") ? "" : ` ${result.slice(2)} 目`}`;
  return result;
}

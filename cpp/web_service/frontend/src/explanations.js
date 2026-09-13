const colorName = (color) => (color === "B" ? "黑棋" : "白棋");
const moveName = (move) => (move === "pass" ? "停一手" : move);
const ordered = (analysis) =>
  [...(analysis?.moveInfos || [])].sort((a, b) => a.order - b.order);

export function compareMove(analysis, move, player) {
  const candidates = ordered(analysis),
    best = candidates[0];
  const actual = candidates.find((candidate) => candidate.move === move);
  if (
    !best ||
    !actual ||
    !Number.isFinite(best.scoreLead) ||
    !Number.isFinite(actual.scoreLead)
  )
    return null;
  return {
    best,
    actual,
    loss: (best.scoreLead - actual.scoreLead) * (player === "B" ? 1 : -1),
  };
}

export function positionExplanation(record, cursor, analysis) {
  if (!analysis?.rootInfo) return [];
  const root = analysis.rootInfo;
  const player = cursor
    ? record.moves[cursor - 1][0] === "B"
      ? "W"
      : "B"
    : record.initialPlayer;
  const candidates = ordered(analysis),
    best = candidates[0];
  const lines = [];
  if (Number.isFinite(root.scoreLead)) {
    const lead = Math.abs(root.scoreLead);
    lines.push(
      `轮到${colorName(player)}。${lead < 0.5 ? "双方预计得分接近" : `${root.scoreLead > 0 ? "黑棋" : "白棋"}预计领先 ${lead.toFixed(1)} 目`}，这是搜索估计，尚未终局计分。`,
    );
  }
  if (Number.isFinite(root.winrate))
    lines.push(
      `黑棋胜率 ${(root.winrate * 100).toFixed(1)}% 表示模型对最终胜负的估计，不是棋盘占地比例；即使胜率接近 100%，也仍需正确应对。`,
    );
  if (!best)
    return [...lines, "本次搜索尚无候选落点，可增加搜索次数后重新分析。"];
  if (best.move === "pass")
    lines.push(
      "推荐停一手：引擎当前把不落子排在第一位。停着不等于认输，双方连续停着会进入终局；仍需核对死子和未完成的边界。",
    );
  else {
    const col = "ABCDEFGHJKLMNOPQRST".indexOf(best.move[0]);
    const row = Number(best.move.slice(1)) - 1;
    const edge = Math.min(
      col,
      row,
      record.size - col - 1,
      record.size - row - 1,
    );
    lines.push(
      `推荐${colorName(player)}下在 ${best.move}，位于距最近边界第 ${edge + 1} 线。${edge === 0 ? "边线附近可用方向较少，留意棋块的气。" : edge <= 2 ? "观察这手与附近棋子的连接，以及边上围地的变化。" : "观察这手对中央活动空间及附近棋块的影响。"}`,
    );
  }
  const variation = (best.pv || []).slice(0, 6);
  if (variation.length)
    lines.push(
      "参考变化：" +
        variation
          .map(
            (move, index) =>
              `${colorName(index % 2 ? (player === "B" ? "W" : "B") : player)} ${moveName(move)}`,
          )
          .join(" → ") +
        "。这是双方可能的应手，不是必然进程。",
    );
  const alternative = candidates[1];
  if (alternative) {
    const comparison = compareMove(analysis, alternative.move, player);
    if (comparison)
      lines.push(
        comparison.loss > 0.05
          ? `同一局面下，改下 ${moveName(alternative.move)}，${colorName(player)}的预计目差比推荐着法差约 ${comparison.loss.toFixed(1)} 目。对照两条变化，留意得失发生在哪一段。`
          : "前两项候选的目差接近，或目差排序与推荐顺序不同；引擎也考虑胜负和搜索不确定性，不能只凭目差认定唯一好棋。",
      );
  }
  return lines;
}

export function gameReview(record) {
  let compared = 0;
  const mistakes = [];
  record.moves.forEach(([player, move], index) => {
    const comparison = compareMove(record.analyses[index], move, player);
    if (!comparison) return;
    compared++;
    if (comparison.loss >= 0.5)
      mistakes.push({
        turn: index + 1,
        player,
        move,
        best: comparison.best.move,
        loss: comparison.loss,
      });
  });
  return {
    compared,
    mistakes: mistakes.sort((a, b) => b.loss - a.loss).slice(0, 5),
  };
}

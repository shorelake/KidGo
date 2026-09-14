export const namePrefixes = { play: "练习", practice: "启蒙", review: "复盘" };

export function nextGameName(mode, games, storedCounter = 0) {
  const prefix = namePrefixes[mode] || namePrefixes.play;
  let counter = Number(storedCounter) || 0;
  for (const game of games) {
    const match = /^(练习|启蒙|复盘)(\d+)$/.exec(game.title || "");
    if (match?.[1] === prefix) counter = Math.max(counter, Number(match[2]));
  }
  return `${prefix}${counter + 1}`;
}

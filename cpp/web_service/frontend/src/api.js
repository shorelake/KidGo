export async function api(path, body, method) {
  const response = await fetch("/api" + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(
      typeof data.detail === "string" ? data.detail : "请求参数无效",
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
export const emptyGame = () => ({
  size: 19,
  rules: "chinese",
  komi: 7.5,
  initialPlayer: "B",
  initialStones: [],
  moves: [],
});
export const positionOf = (game, turn = game.moves.length) =>
  Object.fromEntries(
    ["size", "rules", "komi", "initialPlayer", "initialStones", "moves"].map(
      (k) => [k, k === "moves" ? game.moves.slice(0, turn) : game[k]],
    ),
  );
export const letters = "ABCDEFGHJKLMNOPQRST";
export const percent = (n) =>
  Number.isFinite(n) ? (n * 100).toFixed(1) + "%" : "--";
export const playerWinrate = (value, player) =>
  Number.isFinite(value) ? (player === "W" ? 1 - value : value) : undefined;
export const playerScore = (value, player) => {
  if (!Number.isFinite(value)) return "--";
  const lead = player === "W" ? -value : value;
  return (lead >= 0 ? "+" : "") + lead.toFixed(1);
};
export const score = (n) =>
  Number.isFinite(n)
    ? (n >= 0 ? "黑 +" : "白 +") + Math.abs(n).toFixed(1)
    : "--";

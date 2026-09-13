import React, { useState } from "react";
import { Search, RefreshCw, X, FileText, Pencil, Trash2 } from "lucide-react";

export default function HistorySidebar({
  games,
  activeId,
  onOpen,
  onRefresh,
  onRename,
  onDelete,
  error,
  open,
  onClose,
  disabled,
}) {
  const [search, setSearch] = useState("");
  const matches = games.filter((game) =>
    [game.title, game.black, game.white]
      .join(" ")
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  return (
    <>
      {open && <div className="history-backdrop" onClick={onClose} />}
      <nav
        className={"history-sidebar" + (open ? " is-open" : "")}
        aria-label="历史棋局"
      >
        <div className="history-heading">
          <h2>历史棋局</h2>
          <div>
            <button
              className="icon-button"
              title="刷新棋局"
              aria-label="刷新棋局"
              onClick={onRefresh}
            >
              <RefreshCw size={15} />
            </button>
            <button
              className="icon-button history-close"
              title="关闭历史导航"
              aria-label="关闭历史导航"
              onClick={onClose}
            >
              <X size={17} />
            </button>
          </div>
        </div>
        <label className="history-search">
          <Search size={15} />
          <input
            aria-label="搜索历史棋局"
            placeholder="搜索棋局"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {error && (
          <p className="history-error" role="alert">
            {error}
          </p>
        )}
        <div className="history-list">
          {matches.map((game) => (
            <div className="history-entry" key={game.id}>
              <button
                type="button"
                className="history-game"
                key={game.id}
                aria-current={game.id === activeId ? "page" : undefined}
                disabled={disabled}
                onClick={() => onOpen(game)}
              >
                <span className="history-game-title">
                  <FileText size={14} />
                  <strong>
                    {game.title === "未命名棋谱"
                      ? `${game.size} 路棋局`
                      : game.title}
                  </strong>
                </span>
                <span>
                  {game.size} 路 · {game.moves} 手
                  {game.result ? " · " + game.result : ""}
                </span>
                <small>
                  {new Date(game.updated * 1000).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
              </button>
              {game.id === activeId && (
                <div className="history-actions">
                  <button
                    className="icon-button"
                    title="改名"
                    aria-label={"改名 " + game.title}
                    disabled={disabled}
                    onClick={() => onRename(game)}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="icon-button"
                    title="删除"
                    aria-label={"删除 " + game.title}
                    disabled={disabled}
                    onClick={() => onDelete(game)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {!matches.length && (
          <p className="history-empty">
            {search ? "没有匹配棋局" : "暂无历史棋局"}
          </p>
        )}
        <div className="history-summary">{games.length} 局</div>
      </nav>
    </>
  );
}

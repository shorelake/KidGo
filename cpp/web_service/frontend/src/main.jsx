import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Play,
  Square,
  Undo2,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Plus,
  Upload,
  Download,
  Save,
  FolderOpen,
  X,
  Trash2,
  Flag,
  RefreshCw,
  Settings2,
  LogOut,
  Check,
  Lightbulb,
  PanelLeft,
  Volume2,
  VolumeX,
  ChevronDown,
} from "lucide-react";
import Board from "./Board";
import Music from "./Music";
import HistorySidebar from "./HistorySidebar";
import AnalysisExplanation from "./AnalysisExplanation";
import Scoring from "./Scoring";
import { levels, chooseBotMove, practiceResult, resultLabel } from "./gameplay";
import {
  unlockStoneSound,
  playStoneSound,
  playVictoryMusic,
  stopVictoryMusic,
} from "./stoneSound";
import { isHumanVictory } from "./victoryMusic";
import { namePrefixes, nextGameName } from "./naming";
import { api, emptyGame, positionOf, percent, score } from "./api";
import "./style.css";

const newRecord = () => ({
  ...emptyGame(),
  title: "未命名棋谱",
  black: "黑方",
  white: "白方",
  result: "",
  comments: {},
  analyses: {},
  aiLevel: "standard",
  captureTarget: 0,
});
const blank = (size) => ({
  board: Array.from({ length: size }, () => Array(size).fill("")),
  player: "B",
  captures: { B: 0, W: 0 },
  ended: false,
});
const compact = (result) => ({
  turnNumber: result.turnNumber,
  rootInfo: result.rootInfo,
  moveInfos: (result.moveInfos || [])
    .slice(0, 8)
    .map((m) => ({ ...m, pv: (m.pv || []).slice(0, 64) })),
});
function IconButton({ icon: Icon, label, ...props }) {
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      {...props}
    >
      <Icon size={18} />
    </button>
  );
}
function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="section-heading">
          <h2>{title}</h2>
          <IconButton icon={X} label="关闭" onClick={onClose} />
        </div>
        {children}
      </section>
    </div>
  );
}

function App() {
  const [victoryEnabled, setVictoryEnabled] = useState(
    () => localStorage.getItem("katago-victory-music") !== "off",
  );
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) stopVictoryMusic();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      stopVictoryMusic();
    };
  }, []);
  const [historyCollapsed, setHistoryCollapsed] = useState(
    () => localStorage.getItem("katago-history-collapsed") === "true",
  );
  const [isPhone, setIsPhone] = useState(
    () => window.matchMedia("(max-width: 600px)").matches,
  );
  const [phonePanel, setPhonePanel] = useState(null);
  const draftAutoName = useRef("");
  useEffect(() => {
    const query = window.matchMedia("(max-width: 600px)");
    const change = () => {
      setIsPhone(query.matches);
      if (!query.matches) setPhonePanel(null);
    };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const [sound, setSound] = useState(
    () => localStorage.getItem("katago-stone-sound") !== "off",
  );
  useEffect(() => {
    if (!sound && !victoryEnabled) return;
    document.addEventListener("pointerdown", unlockStoneSound);
    document.addEventListener("keydown", unlockStoneSound);
    return () => {
      document.removeEventListener("pointerdown", unlockStoneSound);
      document.removeEventListener("keydown", unlockStoneSound);
    };
  }, [sound, victoryEnabled]);
  const [record, setRecord] = useState(newRecord),
    [cursor, setCursor] = useState(0),
    [position, setPosition] = useState(blank(19));
  const [session, setSession] = useState(null),
    [health, setHealth] = useState({}),
    [connected, setConnected] = useState(false);
  const [mode, setMode] = useState("review"),
    [human, setHuman] = useState("B"),
    [paused, setPaused] = useState(false);
  useEffect(() => {
    setPhonePanel(null);
  }, [mode]);
  const [visits, setVisits] = useState(500),
    [auto, setAuto] = useState(false),
    [ownership, setOwnership] = useState(false),
    [showNumbers, setShowNumbers] = useState(false);
  const [busy, setBusy] = useState(false),
    [job, setJob] = useState(null),
    [live, setLive] = useState(null),
    [preview, setPreview] = useState(null),
    [pvStep, setPvStep] = useState(1),
    [previewBoard, setPreviewBoard] = useState(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState(null),
    [library, setLibrary] = useState([]),
    [token, setToken] = useState("");
  const [identity, setIdentity] = useState(null),
    [dirty, setDirty] = useState(false),
    [draft, setDraft] = useState(newRecord),
    [draftMode, setDraftMode] = useState("review");
  const [historyOpen, setHistoryOpen] = useState(false),
    [libraryError, setLibraryError] = useState(""),
    [saving, setSaving] = useState(false);
  const recordRef = useRef(record),
    cursorRef = useRef(0),
    identityRef = useRef(null),
    generation = useRef(0),
    task = useRef(null),
    eventHandler = useRef(null),
    fileInput = useRef(null),
    moving = useRef(false),
    stateRef = useRef({}),
    restored = useRef(false);
  const snapshotHandler = useRef(null),
    submitting = useRef(false),
    lastAutoKey = useRef(null),
    documentEpoch = useRef(0),
    saveTask = useRef(null),
    lastSavedRecord = useRef(null),
    autoSaveFailed = useRef(false);
  stateRef.current = {
    mode,
    human,
    paused,
    visits,
    auto,
    ownership,
    health,
    position,
    preview,
  };
  const update = (next, changed = true) => {
    recordRef.current = next;
    setRecord(next);
    if (changed) setDirty(true);
  };
  const identify = (value) => {
    identityRef.current = value;
    setIdentity(value);
  };
  const fail = (e) => {
    setError(e.message || String(e));
  };
  const announce = (text) => {
    setNotice(text);
    setError("");
  };

  useEffect(() => {
    api("/session").then(setSession).catch(fail);
    const check = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then(setHealth)
        .catch(() => setHealth({ ready: false }));
    check();
    const timer = setInterval(check, 4000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!session?.authenticated) return;
    let ws,
      timer,
      stopped = false;
    const connect = () => {
      if (stopped) return;
      ws = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`,
      );
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        try {
          eventHandler.current?.(JSON.parse(e.data));
        } catch (err) {
          fail(err);
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) timer = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [session?.authenticated]);
  useEffect(() => {
    if (!session?.authenticated || restored.current) return;
    restored.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem("katago-draft"));
      if (saved?.record) {
        loadRecord(saved.record, saved.identity, true).then(() =>
          setDirty(saved.dirty),
        );
      }
    } catch {
      localStorage.removeItem("katago-draft");
    }
  }, [session?.authenticated]);
  useEffect(() => {
    if (!session?.authenticated) return;
    refreshLibrary();
    const timer = setInterval(refreshLibrary, 30000);
    return () => clearInterval(timer);
  }, [session?.authenticated]);
  useEffect(() => {
    if (
      !session?.authenticated ||
      mode === "review" ||
      !record.moves.length ||
      !dirty ||
      busy ||
      job ||
      saving ||
      autoSaveFailed.current
    )
      return;
    const timer = setTimeout(() => save({ quiet: true }), 600);
    return () => clearTimeout(timer);
  }, [
    session?.authenticated,
    mode,
    record,
    identity,
    dirty,
    busy,
    job,
    saving,
  ]);
  useEffect(() => {
    if (!session?.authenticated) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          "katago-draft",
          JSON.stringify({ record, identity, dirty }),
        );
      } catch {
        setError("浏览器存储空间不足，请保存到棋谱库");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [record, identity, dirty, session?.authenticated]);
  useEffect(() => {
    const before = (e) => {
      try {
        localStorage.setItem(
          "katago-draft",
          JSON.stringify({
            record: recordRef.current,
            identity: identityRef.current,
            dirty,
          }),
        );
      } catch {
        /* The saved server record remains available in the library. */
      }
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!preview) {
      setPreviewBoard(null);
      return;
    }
    let cancelled = false;
    const base = positionOf(record, cursor);
    let player = position.player;
    const moves = preview.pv.slice(0, pvStep).map((move) => {
      const m = [player, move];
      player = player === "B" ? "W" : "B";
      return m;
    });
    api("/position", { ...base, moves: [...base.moves, ...moves] })
      .then((p) => {
        if (!cancelled) setPreviewBoard(p);
      })
      .catch((e) => {
        if (!cancelled) fail(e);
      });
    return () => {
      cancelled = true;
    };
  }, [preview, pvStep, record, cursor, position.player]);
  useEffect(() => {
    if (
      !session?.authenticated ||
      !health.ready ||
      busy ||
      job ||
      preview ||
      modal
    )
      return;
    const atEnd = cursor === record.moves.length;
    if (
      mode !== "review" &&
      atEnd &&
      !paused &&
      !position.ended &&
      !record.result &&
      position.player !== human
    ) {
      analyze("bot");
      return;
    }
    if (auto && mode === "review" && lastAutoKey.current !== analysisKey()) {
      const timer = setTimeout(() => analyze("single"), 350);
      return () => clearTimeout(timer);
    }
  }, [
    record.moves,
    cursor,
    mode,
    human,
    paused,
    health.ready,
    session?.authenticated,
    position.player,
    busy,
    job,
    preview,
    auto,
    visits,
    ownership,
    modal,
  ]);
  useEffect(() => {
    const timer = setInterval(async () => {
      const current = task.current;
      if (!current) return;
      try {
        const snapshot = await api("/analyze/" + current.id);
        if (task.current === current) snapshotHandler.current(snapshot);
      } catch (e) {
        if (task.current === current) {
          task.current = null;
          setJob(null);
          setPaused(true);
          fail(e);
        }
      }
    }, 800);
    return () => clearInterval(timer);
  }, []);

  function applyResult(result) {
    if (!result.rootInfo) return;
    setLive(result);
    if (!result.isDuringSearch) {
      const current = recordRef.current;
      update({
        ...current,
        analyses: { ...current.analyses, [result.turnNumber]: compact(result) },
      });
    }
  }
  function handleSnapshot(snapshot) {
    const current = task.current;
    if (
      !current ||
      current.id !== snapshot.id ||
      current.generation !== generation.current
    )
      return;
    for (const result of snapshot.results || []) applyResult(result);
    setJob({ ...snapshot, kind: current.kind });
    if (snapshot.status === "running") return;
    task.current = null;
    setJob(null);
    if (snapshot.error) {
      setPaused(true);
      fail(new Error(snapshot.error));
      return;
    }
    if (
      current.kind === "bot" &&
      snapshot.status === "completed" &&
      cursorRef.current === current.turn
    ) {
      const result = (snapshot.results || []).find(
        (r) => r.turnNumber === current.turn,
      );
      const move = chooseBotMove(result, recordRef.current.aiLevel);
      if (move) play(move, true);
      else {
        setPaused(true);
        fail(new Error("引擎未返回可用落点"));
      }
    } else if (current.kind === "whole" && snapshot.status === "completed")
      announce("整盘分析完成");
  }
  snapshotHandler.current = handleSnapshot;
  eventHandler.current = (event) => {
    const current = task.current;
    if (
      !current ||
      current.id !== event.id ||
      current.generation !== generation.current
    )
      return;
    if (event.type === "analysis") applyResult(event);
    if (event.type === "status") handleSnapshot(event);
    if (event.type === "warning") setNotice(event.warning);
  };
  async function stop() {
    const current = task.current;
    task.current = null;
    setJob(null);
    if (current)
      try {
        await api("/analyze/" + current.id + "/cancel", {});
      } catch (e) {
        fail(e);
      }
  }
  async function analyze(kind = "single") {
    if (task.current || moving.current || submitting.current) return;
    if (isPhone && kind !== "bot") setPhonePanel("analysis");
    const currentRecord = recordRef.current;
    const nextPlayer = cursorRef.current
      ? currentRecord.moves[cursorRef.current - 1][0] === "B"
        ? "W"
        : "B"
      : currentRecord.initialPlayer;
    if (
      kind === "bot" &&
      (stateRef.current.mode === "review" ||
        stateRef.current.paused ||
        nextPlayer === stateRef.current.human)
    )
      return;
    const turn = cursorRef.current,
      epoch = generation.current;
    submitting.current = true;
    if (kind === "single") lastAutoKey.current = analysisKey();
    setBusy(true);
    setError("");
    try {
      const base = positionOf(
        recordRef.current,
        kind === "whole" ? recordRef.current.moves.length : turn,
      );
      const response = await api("/analyze", {
        ...base,
        avoidEarlyPass: kind === "bot",
        maxVisits:
          kind === "bot"
            ? (levels[currentRecord.aiLevel] || levels.standard).visits
            : Number(stateRef.current.visits),
        includeOwnership: stateRef.current.ownership,
        ...(kind === "whole"
          ? {
              analyzeTurns: Array.from(
                { length: base.moves.length + 1 },
                (_, i) => i,
              ),
            }
          : {}),
      });
      if (epoch !== generation.current) {
        await api("/analyze/" + response.id + "/cancel", {});
        return;
      }
      task.current = { id: response.id, kind, generation: epoch, turn };
      setJob({ ...response, kind });
      snapshotHandler.current(response);
      // Snapshot recovery must not keep a completed bot move in the submitting state.
      api("/analyze/" + response.id)
        .then((snapshot) => snapshotHandler.current(snapshot))
        .catch(() => {});
    } catch (e) {
      setPaused(true);
      fail(e);
    } finally {
      submitting.current = false;
      setBusy(moving.current);
    }
  }
  async function play(move, bot = false) {
    if (moving.current || (!bot && stateRef.current.preview)) return;
    const current = recordRef.current,
      turn = cursorRef.current,
      s = stateRef.current;
    const player = turn
      ? current.moves[turn - 1][0] === "B"
        ? "W"
        : "B"
      : current.initialPlayer;
    if (bot && (s.mode === "review" || s.paused || player === s.human)) return;
    if (!bot && s.mode !== "review" && player !== s.human) return;
    if (s.mode !== "review" && (s.position.ended || current.result)) return;
    if (
      turn < current.moves.length &&
      !window.confirm("从这里落子将替换后续主线，是否继续？")
    )
      return;
    moving.current = true;
    setBusy(true);
    setError("");
    await stop();
    generation.current++;
    try {
      const next = {
        ...current,
        result: "",
        moves: [...current.moves.slice(0, turn), [player, move]],
        analyses: Object.fromEntries(
          Object.entries(current.analyses).filter(([t]) => Number(t) <= turn),
        ),
        comments: Object.fromEntries(
          Object.entries(current.comments).filter(([t]) => Number(t) <= turn),
        ),
      };
      const board = await api("/position", positionOf(next));
      if (s.mode === "practice") {
        const target = next.captureTarget || 3;
        next.captureTarget = target;
        next.result =
          practiceResult(board.captures, target) || (board.ended ? "0" : "");
        if (next.result) {
          next.comments[next.moves.length] =
            `吃子练习：净提子领先 ${target} 子获胜。黑提 ${board.captures.B}，白提 ${board.captures.W}。${resultLabel(next.result)}`;
          setPaused(true);
        }
      }
      update(next);
      if (sound && move !== "pass") playStoneSound();
      celebrate(next.result, s.mode, s.human, current.result);
      cursorRef.current = next.moves.length;
      setCursor(next.moves.length);
      setPosition(board);
      setLive(null);
      setPreview(null);
      if (board.ended && s.mode === "play") {
        setPaused(true);
        setModal("score");
      }
    } catch (e) {
      if (bot) setPaused(true);
      fail(e);
    } finally {
      moving.current = false;
      setBusy(false);
    }
  }
  async function navigate(turn) {
    if (moving.current || busy) return;
    moving.current = true;
    setBusy(true);
    try {
      if (task.current?.kind !== "whole") await stop();
      const p = await api("/position", positionOf(recordRef.current, turn));
      cursorRef.current = turn;
      setCursor(turn);
      setPosition(p);
      setLive(null);
      setPreview(null);
    } catch (e) {
      fail(e);
    } finally {
      moving.current = false;
      setBusy(false);
    }
  }
  async function loadRecord(
    next,
    id = null,
    restoring = false,
    turn = next.moves.length,
  ) {
    setPhonePanel(null);
    stopVictoryMusic();
    setBusy(true);
    documentEpoch.current++;
    autoSaveFailed.current = false;
    generation.current++;
    await stop();
    try {
      const p = await api("/position", positionOf(next, turn));
      update(next, false);
      identify(id);
      cursorRef.current = turn;
      setCursor(turn);
      setPosition(p);
      setLive(null);
      setPreview(null);
      setMode("review");
      setPaused(true);
      setAuto(false);
      setDirty(false);
      if (!restoring) setModal(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function undo() {
    if (!record.moves.length || busy) return;
    await stop();
    setPaused(true);
    const count = mode !== "review" && record.moves.at(-1)[0] !== human ? 2 : 1;
    const moves = record.moves.slice(
      0,
      Math.max(0, record.moves.length - count),
    );
    const next = {
      ...record,
      moves,
      result: "",
      analyses: Object.fromEntries(
        Object.entries(record.analyses).filter(
          ([t]) => Number(t) <= moves.length,
        ),
      ),
      comments: Object.fromEntries(
        Object.entries(record.comments).filter(
          ([t]) => Number(t) <= moves.length,
        ),
      ),
    };
    const id = identity,
      previousMode = mode;
    await loadRecord(next, id);
    setMode(previousMode);
    setPaused(true);
    setDirty(true);
  }
  function analysisKey() {
    return JSON.stringify({
      ...positionOf(recordRef.current, cursorRef.current),
      visits: stateRef.current.visits,
      ownership: stateRef.current.ownership,
      document: documentEpoch.current,
    });
  }
  async function refreshLibrary() {
    try {
      setLibrary(await api("/games"));
      setLibraryError("");
    } catch (e) {
      setLibraryError(e.message);
    }
  }
  async function openSavedGame(game) {
    if (dirty) {
      if (mode !== "review" && recordRef.current.moves.length) {
        if (!(await save({ quiet: true }))) return;
      } else if (!window.confirm("当前棋谱有未保存修改，继续打开？")) return;
    }
    try {
      const data = await api("/games/" + game.id);
      await loadRecord(
        data.record,
        { id: game.id, version: data.version },
        false,
        data.record.moves.length,
      );
      setHistoryOpen(false);
    } catch (e) {
      fail(e);
    }
  }
  async function save({ quiet = false } = {}) {
    if (saveTask.current) {
      if (!(await saveTask.current)) return false;
      if (recordRef.current === lastSavedRecord.current) return true;
    }
    const epoch = documentEpoch.current,
      snapshot = recordRef.current,
      id = identityRef.current;
    autoSaveFailed.current = false;
    setSaving(true);
    const promise = (async () => {
      try {
        const saved = await api(
          "/games" + (id ? "/" + id.id : ""),
          { record: snapshot, version: id?.version },
          id ? "PUT" : "POST",
        );
        if (documentEpoch.current === epoch) {
          identify(saved);
          lastSavedRecord.current = snapshot;
          if (recordRef.current === snapshot) setDirty(false);
          try {
            localStorage.setItem(
              "katago-draft",
              JSON.stringify({
                record: recordRef.current,
                identity: saved,
                dirty: recordRef.current !== snapshot,
              }),
            );
          } catch {
            setNotice("棋谱已保存到服务端，浏览器草稿存储不可用");
          }
        }
        await refreshLibrary();
        if (!quiet) announce("棋谱已保存");
        return true;
      } catch (e) {
        if (documentEpoch.current === epoch) {
          autoSaveFailed.current = true;
          fail(e);
        }
        return false;
      }
    })();
    saveTask.current = promise;
    try {
      return await promise;
    } finally {
      if (saveTask.current === promise) {
        saveTask.current = null;
        setSaving(false);
      }
    }
  }
  async function openLibrary() {
    try {
      setLibrary(await api("/games"));
      setModal("library");
    } catch (e) {
      fail(e);
    }
  }
  async function renameGame(game) {
    const title = window.prompt("棋局名称 / 备注", game.title)?.trim();
    if (!title || title === game.title) return;
    if (title.length > 120) return fail(new Error("棋局名称不能超过 120 字"));
    try {
      if (saveTask.current && !(await saveTask.current)) return;
      if (identityRef.current?.id === game.id) {
        update({ ...recordRef.current, title });
        await save({ quiet: true });
      } else {
        setSaving(true);
        const data = await api("/games/" + game.id);
        await api(
          "/games/" + game.id,
          { record: { ...data.record, title }, version: data.version },
          "PUT",
        );
        await refreshLibrary();
      }
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }
  async function deleteGame(game) {
    if (!window.confirm(`确认删除“${game.title}”？删除后无法恢复。`)) return;
    setSaving(true);
    try {
      if (saveTask.current && !(await saveTask.current)) return;
      const active = identityRef.current?.id === game.id;
      if (active) await stop();
      await api("/games/" + game.id, undefined, "DELETE");
      if (active) await loadRecord(newRecord());
      await refreshLibrary();
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }
  async function importFile(file) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("SGF 文件不能超过 1 MB");
      if (dirty && !window.confirm("当前棋谱有未保存修改，继续导入？")) return;
      const data = await api("/sgf/import", { content: await file.text() });
      await loadRecord(data.record);
      setDirty(true);
      announce(data.warnings.length ? data.warnings.join("；") : "棋谱已导入");
    } catch (e) {
      fail(e);
    } finally {
      fileInput.current.value = "";
    }
  }
  async function exportFile() {
    try {
      const data = await api("/sgf/export", recordRef.current);
      const url = URL.createObjectURL(
        new Blob([data.sgf], { type: "application/x-go-sgf;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download =
        (record.title.replace(/[\\/:*?"<>|]/g, "_") || "game") + ".sgf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      fail(e);
    }
  }
  async function resign() {
    if (!window.confirm("确认认输并结束本局？")) return;
    await stop();
    update({ ...recordRef.current, result: human === "B" ? "W+R" : "B+R" });
    setPaused(true);
  }
  async function confirmScore(score) {
    const current = recordRef.current;
    const won = isHumanVictory(score.result, human, mode, current.result);
    update({
      ...current,
      result: score.result,
      comments: {
        ...current.comments,
        [current.moves.length]: [
          current.comments[current.moves.length],
          `终局计分：黑 ${score.black}，白 ${score.white}（含贴目 ${score.komi}）；死子 ${score.deadStones.join("、") || "无"}。${resultLabel(score.result)}`,
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 4000),
      },
    });
    setPaused(true);
    setModal(null);
    if (won) celebrate(score.result, mode, human, current.result);
    await save({ quiet: true });
  }
  function celebrate(result, playMode, player, previousResult) {
    if (
      victoryEnabled &&
      isHumanVictory(result, player, playMode, previousResult)
    ) {
      setCelebrating(playVictoryMusic(() => setCelebrating(false)));
    }
  }
  async function resumeFromScoring() {
    const current = recordRef.current,
      turn = current.moves.length - 2;
    const next = {
      ...current,
      result: "",
      moves: current.moves.slice(0, turn),
      analyses: Object.fromEntries(
        Object.entries(current.analyses).filter(([t]) => Number(t) <= turn),
      ),
      comments: Object.fromEntries(
        Object.entries(current.comments).filter(([t]) => Number(t) <= turn),
      ),
    };
    await loadRecord(next, identityRef.current);
    setMode("play");
    setPaused(false);
    setDirty(true);
  }
  async function beginNew() {
    if (dirty && mode !== "review" && recordRef.current.moves.length) {
      if (!(await save({ quiet: true }))) return;
    } else if (dirty && !window.confirm("当前棋谱有未保存修改，继续新建？"))
      return;
    const title = defaultTitle("play");
    draftAutoName.current = title;
    setDraft({ ...newRecord(), title });
    setDraftMode("play");
    setModal("new");
  }
  function defaultTitle(newMode) {
    const prefix = namePrefixes[newMode];
    const counter = Math.max(
      Number(localStorage.getItem("katago-name-counter-" + prefix)) || 0,
      prefix === "练习"
        ? Number(localStorage.getItem("katago-practice-counter")) || 0
        : 0,
    );
    return nextGameName(newMode, [...library, recordRef.current], counter);
  }
  function changeDraftMode(newMode) {
    const title = defaultTitle(newMode);
    if (draft.title === draftAutoName.current) setDraft({ ...draft, title });
    draftAutoName.current = title;
    setDraftMode(newMode);
  }
  async function createNew(e) {
    e.preventDefault();
    const next = {
      ...draft,
      captureTarget: draftMode === "practice" ? draft.captureTarget || 3 : 0,
    };
    if (next.title === "未命名棋谱" && draftMode !== "review")
      next.title = `${next.size} 路${draftMode === "practice" ? "练习" : "对弈"} · ${new Date().toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
    await loadRecord(next);
    const sequence = /^(练习|启蒙|复盘)(\d+)$/.exec(next.title);
    if (sequence)
      localStorage.setItem(
        "katago-name-counter-" + sequence[1],
        String(
          Math.max(
            Number(
              localStorage.getItem("katago-name-counter-" + sequence[1]),
            ) || 0,
            Number(sequence[2]),
          ),
        ),
      );
    setMode(draftMode);
    setPaused(false);
    setDirty(true);
  }
  const analysis = live?.turnNumber === cursor ? live : record.analyses[cursor];
  const candidates = [...(analysis?.moveInfos || [])].sort(
      (a, b) => a.order - b.order,
    ),
    root = analysis?.rootInfo;
  const numbers = {};
  if (showNumbers)
    record.moves.slice(0, cursor).forEach((m, i) => {
      numbers[m[1]] = i + 1;
    });
  if (preview)
    preview.pv.slice(0, pvStep).forEach((m, i) => {
      numbers[m] = i + 1;
    });
  const canPlay =
    !(isPhone && phonePanel) &&
    !busy &&
    !job &&
    !preview &&
    (mode === "review" ||
      (!paused &&
        !position.ended &&
        !record.result &&
        position.player === human &&
        cursor === record.moves.length));
  const plotted = Object.entries(record.analyses)
    .map(([t, a]) => ({ t: Number(t), ...a.rootInfo }))
    .sort((a, b) => a.t - b.t);
  const maxScore = Math.max(10, ...plotted.map((p) => Math.abs(p.scoreLead)));
  const graphPath = (key) =>
    plotted
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${12 + (p.t / Math.max(1, record.moves.length)) * 376} ${key === "winrate" ? 12 + (1 - p.winrate) * 76 : 50 - (p.scoreLead / maxScore) * 38}`,
      )
      .join(" ");

  if (!session)
    return (
      <div className="loading-screen">
        <Activity size={24} />
        <span>正在连接</span>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  if (!session.authenticated)
    return (
      <div className="login-screen">
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/login", { token });
              setSession(await api("/session"));
              setToken("");
              setError("");
            } catch (err) {
              fail(err);
            }
          }}
        >
          <div className="brand">
            <span className="brand-mark">
              <i />
              <i />
            </span>
            <strong>KataGo</strong>
          </div>
          <h1>登录围棋工作台</h1>
          <label>
            访问口令
            <input
              autoFocus
              type="password"
              autoComplete="current-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </label>
          <button className="primary wide">登录</button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      </div>
    );
  return (
    <>
      <header>
        <div className="brand">
          <span className="brand-mark">
            <i />
            <i />
          </span>
          <strong>KataGo</strong>
          <span>围棋工作台</span>
        </div>
        <div className="header-right">
          <Music
            onError={fail}
            victoryEnabled={victoryEnabled}
            celebrating={celebrating}
            onVictoryToggle={(enabled) => {
              setVictoryEnabled(enabled);
              localStorage.setItem(
                "katago-victory-music",
                enabled ? "on" : "off",
              );
              if (!enabled) stopVictoryMusic();
              else unlockStoneSound();
            }}
          />
          <IconButton
            icon={sound ? Volume2 : VolumeX}
            label={sound ? "关闭落子音效" : "开启落子音效"}
            onClick={() => {
              setSound(!sound);
              localStorage.setItem("katago-stone-sound", sound ? "off" : "on");
              if (!sound) unlockStoneSound();
            }}
          />
          <span className={"engine-status " + (health.ready ? "online" : "")}>
            <Activity size={15} />
            {health.ready ? "引擎就绪" : "引擎连接中"}
          </span>
          <IconButton icon={FolderOpen} label="棋谱库" onClick={openLibrary} />
          {session.requiresToken && (
            <IconButton
              icon={LogOut}
              label="退出登录"
              onClick={async () => {
                await stop();
                await api("/logout", {});
                setSession(await api("/session"));
              }}
            />
          )}
        </div>
      </header>
      <div
        className={
          "application-layout" + (historyCollapsed ? " history-collapsed" : "")
        }
      >
        <HistorySidebar
          games={library}
          activeId={identity?.id}
          onOpen={openSavedGame}
          onRefresh={refreshLibrary}
          onRename={renameGame}
          onDelete={deleteGame}
          error={libraryError}
          open={historyOpen}
          onClose={() => {
            setHistoryOpen(false);
            if (window.matchMedia("(min-width: 1101px)").matches) {
              setHistoryCollapsed(true);
              localStorage.setItem("katago-history-collapsed", "true");
            }
          }}
          disabled={busy || saving}
        />
        <div className="workbench">
          <div className="document-bar">
            <div className="document-title">
              <h1>{record.title}</h1>
              <span>
                {saving
                  ? "保存中"
                  : identity
                    ? dirty
                      ? "未保存"
                      : "已保存"
                    : "本地草稿"}
              </span>
            </div>
            <div className="document-actions">
              <span className="history-toggle">
                <IconButton
                  icon={PanelLeft}
                  label="历史棋局"
                  onClick={() => {
                    setHistoryOpen(
                      window.matchMedia("(max-width: 1100px)").matches,
                    );
                    setHistoryCollapsed(false);
                    localStorage.setItem("katago-history-collapsed", "false");
                  }}
                />
              </span>
              <IconButton
                icon={Plus}
                label="新建棋局"
                onClick={beginNew}
                disabled={busy}
              />
              <IconButton
                icon={Upload}
                label="导入 SGF"
                onClick={() => fileInput.current.click()}
                disabled={busy}
              />
              <IconButton
                icon={Download}
                label="导出 SGF"
                onClick={exportFile}
              />
              <IconButton
                icon={Save}
                label="保存棋谱"
                onClick={() => save()}
                disabled={busy || !!job || saving}
              />
              <IconButton
                icon={Settings2}
                label="棋谱信息"
                onClick={() => {
                  setDraft(record);
                  setModal("edit");
                }}
              />
            </div>
            <input
              type="file"
              accept=".sgf"
              ref={fileInput}
              hidden
              onChange={(e) => importFile(e.target.files[0])}
            />
          </div>
          {(error || notice) && (
            <div
              className={"notification " + (error ? "error" : "success")}
              role={error ? "alert" : "status"}
            >
              <span>{error || notice}</span>
              <IconButton
                icon={X}
                label="关闭消息"
                onClick={() => {
                  setError("");
                  setNotice("");
                }}
              />
            </div>
          )}
          <main
            className={
              "workspace" + (phonePanel ? " phone-panel-" + phonePanel : "")
            }
          >
            <section className="board-section">
              <div className="section-heading">
                <div className="segmented" aria-label="模式">
                  <button
                    className={mode === "practice" ? "selected" : ""}
                    disabled={busy}
                    onClick={async () => {
                      await stop();
                      setMode("practice");
                      if (!recordRef.current.captureTarget)
                        update({ ...recordRef.current, captureTarget: 3 });
                      setAuto(false);
                      setPaused(false);
                    }}
                  >
                    练习
                  </button>
                  <button
                    className={mode === "play" ? "selected" : ""}
                    onClick={async () => {
                      await stop();
                      setMode("play");
                      setAuto(false);
                      setPaused(false);
                    }}
                    disabled={busy}
                  >
                    对弈
                  </button>
                  <button
                    className={mode === "review" ? "selected" : ""}
                    onClick={async () => {
                      await stop();
                      setMode("review");
                    }}
                    disabled={busy}
                  >
                    复盘
                  </button>
                </div>
                <span>
                  {record.size} 路 ·{" "}
                  {record.rules === "chinese" ? "中国规则" : "日本规则"} · 贴{" "}
                  {record.komi} 目
                </span>
              </div>
              <div className="player-strip">
                <div>
                  <span className="stone-dot black" />
                  <b>{record.black}</b>
                  <small>提 {position.captures.B}</small>
                </div>
                <span className="turn-label">
                  {(cursor === record.moves.length &&
                    resultLabel(record.result)) ||
                    (position.ended
                      ? "双方停一手"
                      : `第 ${cursor} 手${record.moves[cursor - 1]?.[1] === "pass" ? ` · ${record.moves[cursor - 1][0] === "B" ? "黑" : "白"}方停一手` : ""}`)}
                </span>
                <div>
                  <small>提 {position.captures.W}</small>
                  <b>{record.white}</b>
                  <span className="stone-dot white" />
                </div>
              </div>
              {mode === "practice" && (
                <p className="practice-progress">
                  吃子目标：净领先 {record.captureTarget || 3} 子 · 黑提{" "}
                  {position.captures.B} / 白提 {position.captures.W}
                </p>
              )}
              {record.result && cursor === record.moves.length && (
                <div className="game-outcome" role="status">
                  {resultLabel(record.result)}
                  {record.result.endsWith("+Capture")
                    ? ` · 净提子领先 ${record.captureTarget} 子目标已达成`
                    : record.result.endsWith("+R")
                      ? " · 认输结束"
                      : ""}
                </div>
              )}
              {position.ended &&
                !record.result &&
                cursor === record.moves.length && (
                  <button
                    className="primary"
                    onClick={() => {
                      setPaused(true);
                      setModal("score");
                    }}
                    disabled={busy || !!job}
                  >
                    终局计分
                  </button>
                )}
              <Board
                size={record.size}
                board={previewBoard?.board || position.board}
                onPlay={play}
                player={position.player}
                positionKey={`${documentEpoch.current}:${cursor}:${mode}`}
                disabled={!canPlay}
                candidates={preview ? [] : candidates.slice(0, 5)}
                lastMove={record.moves[cursor - 1]?.[1]}
                ownership={ownership && !preview ? analysis?.ownership : null}
                numbers={numbers}
                preview={!!preview}
              />
              {preview && (
                <div className="pv-toolbar">
                  <b>
                    {preview.move} 变化 · {pvStep}/{preview.pv.length}
                  </b>
                  <input
                    aria-label="变化手数"
                    type="range"
                    min="1"
                    max={preview.pv.length}
                    value={pvStep}
                    onChange={(e) => setPvStep(Number(e.target.value))}
                  />
                  <IconButton
                    icon={X}
                    label="关闭变化"
                    onClick={() => setPreview(null)}
                  />
                </div>
              )}
              <div className="board-toolbar">
                {mode === "practice" && (
                  <IconButton
                    icon={Lightbulb}
                    label="提示一手"
                    onClick={() => analyze("single")}
                    disabled={busy || !!job || !health.ready}
                  />
                )}
                <IconButton
                  icon={SkipBack}
                  label="第一手"
                  onClick={() => navigate(0)}
                  disabled={busy || cursor === 0}
                />
                <IconButton
                  icon={ChevronLeft}
                  label="上一手"
                  onClick={() => navigate(cursor - 1)}
                  disabled={busy || cursor === 0}
                />
                <span className="move-counter">
                  {cursor} / {record.moves.length}
                </span>
                <IconButton
                  icon={ChevronRight}
                  label="下一手"
                  onClick={() => navigate(cursor + 1)}
                  disabled={busy || cursor === record.moves.length}
                />
                <IconButton
                  icon={SkipForward}
                  label="最后一手"
                  onClick={() => navigate(record.moves.length)}
                  disabled={busy || cursor === record.moves.length}
                />
                <span className="toolbar-divider" />
                <IconButton
                  icon={Undo2}
                  label="悔棋"
                  onClick={undo}
                  disabled={busy || !record.moves.length}
                />
                <button onClick={() => play("pass")} disabled={!canPlay}>
                  停一手
                </button>
                {mode !== "review" && (
                  <IconButton
                    icon={Flag}
                    label="认输"
                    onClick={resign}
                    disabled={busy || !!record.result}
                  />
                )}
              </div>
              <input
                className="timeline"
                aria-label="棋谱手数"
                type="range"
                min="0"
                max={record.moves.length || 1}
                value={cursor}
                onChange={(e) =>
                  navigate(
                    Math.min(Number(e.target.value), record.moves.length),
                  )
                }
                disabled={busy || !record.moves.length}
              />
              {mode !== "review" && (
                <div className="play-settings">
                  <label>
                    AI 强度
                    <select
                      aria-label="AI 强度"
                      value={record.aiLevel || "standard"}
                      disabled={busy || !!job || !!record.result}
                      onChange={async (e) => {
                        const aiLevel = e.target.value;
                        await stop();
                        update({ ...recordRef.current, aiLevel });
                      }}
                    >
                      {Object.entries(levels).map(([key, value]) => (
                        <option key={key} value={key}>
                          {value.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    执子
                    <select
                      aria-label="执子"
                      value={human}
                      onChange={async (e) => {
                        await stop();
                        setHuman(e.target.value);
                        setPaused(false);
                      }}
                      disabled={busy}
                    >
                      <option value="B">黑方</option>
                      <option value="W">白方</option>
                    </select>
                  </label>
                  <span>
                    {record.result
                      ? "对局结束"
                      : position.ended
                        ? "终局待确认"
                        : paused
                          ? "对弈已暂停"
                          : position.player === human
                            ? "轮到你落子"
                            : "KataGo 思考中"}
                  </span>
                  <IconButton
                    icon={paused ? Play : Square}
                    label={paused ? "继续对弈" : "暂停对弈"}
                    onClick={async () => {
                      await stop();
                      setPaused(!paused);
                    }}
                  />
                </div>
              )}
              <div className="mobile-analysis-dock" aria-label="手机分析视图">
                <button
                  aria-label="局势浮层"
                  aria-expanded={phonePanel === "chart"}
                  aria-controls="position-chart"
                  className={phonePanel === "chart" ? "selected" : ""}
                  onClick={() =>
                    setPhonePanel(phonePanel === "chart" ? null : "chart")
                  }
                >
                  <Activity size={17} />
                  局势
                </button>
                <button
                  aria-label="分析浮层"
                  aria-expanded={phonePanel === "analysis"}
                  aria-controls="position-analysis"
                  className={phonePanel === "analysis" ? "selected" : ""}
                  onClick={() =>
                    setPhonePanel(phonePanel === "analysis" ? null : "analysis")
                  }
                >
                  <Lightbulb size={17} />
                  分析
                </button>
              </div>
              <div className="review-chart" id="position-chart">
                <div className="section-heading">
                  <h2>局势变化</h2>
                  <span className="mobile-panel-close">
                    <IconButton
                      icon={ChevronDown}
                      label="收起局势"
                      onClick={() => setPhonePanel(null)}
                    />
                  </span>
                  <div className="chart-legend">
                    <span>黑方胜率</span>
                    <span>黑方目差</span>
                  </div>
                </div>
                <svg
                  viewBox="0 0 400 100"
                  role="img"
                  aria-label="胜率与目差曲线"
                  onClick={(e) => {
                    const transform = e.currentTarget.getScreenCTM();
                    if (!transform) return;
                    // Include viewBox scaling and letterboxing in the hit test.
                    const point = new DOMPoint(
                      e.clientX,
                      e.clientY,
                    ).matrixTransform(transform.inverse());
                    navigate(
                      Math.max(
                        0,
                        Math.min(
                          record.moves.length,
                          Math.round(
                            ((point.x - 12) / 376) * record.moves.length,
                          ),
                        ),
                      ),
                    );
                  }}
                >
                  <path
                    d="M12 12H388 M12 50H388 M12 88H388"
                    stroke="#e0e7e2"
                    strokeDasharray="3 4"
                  />
                  {plotted.length > 0 && (
                    <>
                      <path
                        d={graphPath("winrate")}
                        fill="none"
                        stroke="#218062"
                        strokeWidth="2"
                      />
                      <path
                        d={graphPath("scoreLead")}
                        fill="none"
                        stroke="#5088b2"
                        strokeWidth="1.5"
                      />
                      {plotted.map((p) => (
                        <circle
                          key={p.t}
                          cx={
                            12 + (p.t / Math.max(1, record.moves.length)) * 376
                          }
                          cy={12 + (1 - p.winrate) * 76}
                          r="2"
                          fill="#218062"
                        />
                      ))}
                    </>
                  )}
                  <line
                    x1={12 + (cursor / Math.max(1, record.moves.length)) * 376}
                    x2={12 + (cursor / Math.max(1, record.moves.length)) * 376}
                    y1="8"
                    y2="92"
                    stroke="#8c9b92"
                  />
                  <text x="13" y="99">
                    0
                  </text>
                  <text x="382" y="99" textAnchor="end">
                    {record.moves.length}
                  </text>
                </svg>
              </div>
            </section>
            <aside className="analysis-aside" id="position-analysis">
              <div className="section-heading">
                <h2>局面分析</h2>
                <span className="mobile-panel-close">
                  <IconButton
                    icon={ChevronDown}
                    label="收起分析"
                    onClick={() => setPhonePanel(null)}
                  />
                </span>
                <span>黑方视角</span>
              </div>
              <div className="metrics">
                <div>
                  <small>黑方胜率</small>
                  <strong>{percent(root?.winrate)}</strong>
                </div>
                <div>
                  <small>预计目差</small>
                  <strong>{score(root?.scoreLead)}</strong>
                </div>
              </div>
              <div className="winrate-bar">
                <div style={{ width: `${(root?.winrate ?? 0.5) * 100}%` }} />
              </div>
              <div className="analysis-controls">
                <label>
                  搜索次数
                  <input
                    aria-label="搜索次数"
                    type="number"
                    min="1"
                    max="10000"
                    step="100"
                    value={visits}
                    onChange={(e) => setVisits(e.target.value)}
                    onBlur={() =>
                      setVisits(
                        Math.min(10000, Math.max(1, Number(visits) || 500)),
                      )
                    }
                    disabled={!!job}
                  />
                </label>
                <button
                  className="primary"
                  disabled={!health.ready || busy}
                  onClick={
                    job
                      ? async () => {
                          setPaused(true);
                          setAuto(false);
                          await stop();
                        }
                      : () => analyze("single")
                  }
                >
                  {job ? <Square size={16} /> : <Play size={16} />}{" "}
                  {job ? "停止分析" : "分析局面"}
                </button>
              </div>
              <div className="toggle-row">
                <label>
                  <input
                    type="checkbox"
                    checked={auto}
                    onChange={(e) => setAuto(e.target.checked)}
                    disabled={mode !== "review"}
                  />
                  自动分析
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={ownership}
                    onChange={(e) => setOwnership(e.target.checked)}
                  />
                  归属
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={showNumbers}
                    onChange={(e) => setShowNumbers(e.target.checked)}
                  />
                  手数
                </label>
              </div>
              <div className="analysis-status">
                <span className={job ? "working" : ""}>
                  {job
                    ? job.kind === "whole"
                      ? `整盘分析 ${job.completed}/${job.total}`
                      : job.kind === "bot"
                        ? "KataGo 思考中"
                        : "正在分析"
                    : root
                      ? `已搜索 ${root.visits.toLocaleString()} 次`
                      : "尚未分析"}
                </span>
                <span>{connected ? "实时连接" : "轮询连接"}</span>
              </div>
              <div className="candidate-table">
                <div className="candidate-head">
                  <span>推荐落点</span>
                  <span>黑方胜率</span>
                  <span>目差</span>
                  <span>搜索</span>
                </div>
                {candidates.slice(0, 8).map((m, i) => (
                  <button
                    className={
                      "candidate " + (preview?.move === m.move ? "active" : "")
                    }
                    key={m.move}
                    onClick={() => {
                      setPreview(m);
                      setPvStep(Math.min(1, m.pv.length));
                      if (isPhone) setPhonePanel(null);
                    }}
                    disabled={!m.pv?.length}
                  >
                    <span>
                      <i className={i === 0 ? "best" : ""}>{i + 1}</i>
                      <b>{m.move === "pass" ? "停一手" : m.move}</b>
                    </span>
                    <span>{percent(m.winrate)}</span>
                    <span>{score(m.scoreLead)}</span>
                    <span>{m.visits}</span>
                  </button>
                ))}
                {!candidates.length && (
                  <div className="empty-analysis">
                    <Activity size={26} />
                    <span>
                      {health.ready ? "暂无分析结果" : "等待引擎就绪"}
                    </span>
                  </div>
                )}
              </div>
              {preview && (
                <div className="pv-line">
                  <strong>变化</strong>
                  <span>{preview.pv.join(" → ")}</span>
                </div>
              )}
              <button
                className="wide secondary-analysis"
                disabled={busy || !!job || !health.ready}
                onClick={() => analyze("whole")}
              >
                <RefreshCw size={16} />
                整盘分析
              </button>
              <AnalysisExplanation
                record={record}
                cursor={cursor}
                analysis={analysis}
                onNavigate={navigate}
                disabled={busy || !!job}
              />
              <section className="comment-section">
                <div className="section-heading">
                  <h2>第 {cursor} 手注释</h2>
                </div>
                <textarea
                  aria-label="棋谱注释"
                  maxLength="4000"
                  value={record.comments[cursor] || ""}
                  onChange={(e) =>
                    update({
                      ...record,
                      comments: {
                        ...record.comments,
                        [cursor]: e.target.value,
                      },
                    })
                  }
                />
              </section>
            </aside>
          </main>
          <footer>
            <span>KataGo {health.version || "1.18.2"} · CUDA</span>
            <span title={health.model}>{health.model || "模型加载中"}</span>
            <span>{health.activeJobs || 0} 个分析任务</span>
          </footer>
        </div>
      </div>
      {(modal === "new" || modal === "edit") && (
        <Modal
          title={modal === "new" ? "新建棋局" : "棋谱信息"}
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={
              modal === "new"
                ? createNew
                : (e) => {
                    e.preventDefault();
                    update({
                      ...record,
                      title: draft.title,
                      black: draft.black,
                      white: draft.white,
                      result: draft.result,
                    });
                    setModal(null);
                  }
            }
            className="game-form"
          >
            {modal === "new" && (
              <>
                <label>
                  模式
                  <select
                    aria-label="新建模式"
                    value={draftMode}
                    onChange={(e) => changeDraftMode(e.target.value)}
                  >
                    <option value="play">人机对弈</option>
                    <option value="practice">启蒙练习</option>
                    <option value="review">复盘</option>
                  </select>
                </label>
                <label>
                  棋盘
                  <select
                    aria-label="棋盘"
                    value={draft.size}
                    onChange={(e) =>
                      setDraft({ ...draft, size: Number(e.target.value) })
                    }
                  >
                    {[5, 7, 9, 11, 13, 15, 19].map((size) => (
                      <option key={size} value={size}>
                        {size} 路
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label>
              棋局名称
              <input
                required
                maxLength="120"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <div className="form-columns">
              <label>
                黑方
                <input
                  maxLength="120"
                  value={draft.black}
                  onChange={(e) =>
                    setDraft({ ...draft, black: e.target.value })
                  }
                />
              </label>
              <label>
                白方
                <input
                  maxLength="120"
                  value={draft.white}
                  onChange={(e) =>
                    setDraft({ ...draft, white: e.target.value })
                  }
                />
              </label>
            </div>
            {modal === "new" && draftMode !== "review" && (
              <div className="form-columns">
                <label>
                  AI 强度
                  <select
                    aria-label="新局 AI 强度"
                    value={draft.aiLevel || "standard"}
                    onChange={(e) =>
                      setDraft({ ...draft, aiLevel: e.target.value })
                    }
                  >
                    {Object.entries(levels).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value.label}
                      </option>
                    ))}
                  </select>
                </label>
                {draftMode === "practice" && (
                  <label>
                    吃子级别
                    <select
                      aria-label="吃子级别"
                      value={draft.captureTarget || 3}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          captureTarget: Number(e.target.value),
                        })
                      }
                    >
                      {[3, 5, 7, 13, 21].map((target, index) => (
                        <option key={target} value={target}>
                          {index + 1} 级 · 净领先 {target} 子
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
            {modal === "new" ? (
              <>
                <div className="form-columns">
                  <label>
                    规则
                    <select
                      value={draft.rules}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          rules: e.target.value,
                          komi: e.target.value === "japanese" ? 6.5 : 7.5,
                        })
                      }
                    >
                      <option value="chinese">中国规则</option>
                      <option value="japanese">日本规则</option>
                    </select>
                  </label>
                  <label>
                    贴目（白棋补偿分）
                    <input
                      aria-label="贴目"
                      title="黑棋先行，计分时给白棋的补偿分，不是 AI 难度。"
                      type="number"
                      step="0.5"
                      min="-100"
                      max="100"
                      required
                      value={draft.komi}
                      onChange={(e) =>
                        setDraft({ ...draft, komi: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
              </>
            ) : (
              <label>
                对局结果
                <input
                  maxLength="40"
                  placeholder="B+R / W+2.5 / 0"
                  value={draft.result}
                  onChange={(e) =>
                    setDraft({ ...draft, result: e.target.value })
                  }
                />
              </label>
            )}
            <button className="primary wide" disabled={busy}>
              <Check size={17} />
              {modal === "new" ? "创建" : "保存信息"}
            </button>
          </form>
        </Modal>
      )}
      {modal === "score" && (
        <Modal title="终局计分 · 确认死子" onClose={() => setModal(null)}>
          <Scoring
            record={record}
            board={position.board}
            onConfirm={confirmScore}
            onResume={resumeFromScoring}
          />
        </Modal>
      )}
      {modal === "library" && (
        <Modal title="棋谱库" onClose={() => setModal(null)}>
          <div className="library-list">
            {library.length ? (
              library.map((g) => (
                <div className="library-item" key={g.id}>
                  <button
                    onClick={async () => {
                      if (
                        dirty &&
                        !window.confirm("当前棋谱有未保存修改，继续打开？")
                      )
                        return;
                      try {
                        const data = await api("/games/" + g.id);
                        await loadRecord(data.record, {
                          id: g.id,
                          version: data.version,
                        });
                      } catch (e) {
                        fail(e);
                      }
                    }}
                  >
                    <strong>{g.title}</strong>
                    <span>
                      {g.size} 路 · {g.moves} 手 · {g.black} / {g.white}
                    </span>
                    <small>
                      {new Date(g.updated * 1000).toLocaleString("zh-CN")}
                    </small>
                  </button>
                  <IconButton
                    icon={Trash2}
                    label={"删除 " + g.title}
                    disabled={busy || saving}
                    onClick={() => deleteGame(g)}
                  />
                </div>
              ))
            ) : (
              <p className="empty-library">暂无已保存棋谱</p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);

import React, { useEffect, useRef, useState } from "react";
import {
  Music2,
  Volume2,
  VolumeX,
  ChevronDown,
  Repeat1,
  Shuffle,
  SkipForward,
  X,
} from "lucide-react";

function preferences() {
  try {
    return JSON.parse(localStorage.getItem("katago-music")) || {};
  } catch {
    return {};
  }
}
export default function Music({
  onError,
  victoryEnabled,
  onVictoryToggle,
  celebrating,
}) {
  const audio = useRef(null),
    panel = useRef(null),
    intent = useRef(false);
  const [tracks, setTracks] = useState([]),
    [track, setTrack] = useState(() => preferences().track || "little-steps"),
    [mode, setMode] = useState(() =>
      preferences().mode === "shuffle" ? "shuffle" : "repeat",
    );
  const [playing, setPlaying] = useState(() => preferences().enabled !== false),
    [open, setOpen] = useState(false),
    [volume, setVolume] = useState(() => {
      const v = Number(preferences().volume ?? 0.2);
      return Number.isFinite(v) ? Math.max(0, Math.min(0.6, v)) : 0.2;
    });
  intent.current = playing;
  useEffect(() => {
    let cancelled = false;
    fetch("/music/tracks.json")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((list) => {
        if (cancelled) return;
        setTracks(list);
        setTrack((current) =>
          list.some((t) => t.id === current) ? current : list[0].id,
        );
      })
      .catch(() => {
        if (!cancelled) onError(new Error("音乐列表加载失败"));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (audio.current) audio.current.volume = volume * (celebrating ? 0.2 : 1);
    try {
      localStorage.setItem(
        "katago-music",
        JSON.stringify({ track, mode, volume, enabled: playing }),
      );
    } catch {}
  }, [track, mode, volume, celebrating, playing]);
  function startPlayback() {
    const element = audio.current;
    if (!intent.current || document.hidden || !element?.getAttribute("src"))
      return;
    element.play().catch((e) => {
      if (!intent.current || element !== audio.current) return;
      if (e.name !== "AbortError" && e.name !== "NotAllowedError") {
        setPlaying(false);
        onError(new Error("音乐暂时无法播放"));
      }
    });
  }
  useEffect(() => {
    if (playing) startPlayback();
    else audio.current?.pause();
  }, [track, tracks, playing]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) audio.current?.pause();
      else startPlayback();
    };
    const dismiss = (e) => {
      if (!panel.current?.contains(e.target)) setOpen(false);
      if (audio.current?.paused) startPlayback();
    };
    const keyboard = () => {
      if (audio.current?.paused) startPlayback();
    };
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", keyboard);
    };
  }, []);
  async function toggle() {
    if (playing) {
      intent.current = false;
      audio.current.pause();
      setPlaying(false);
      return;
    }
    intent.current = true;
    setPlaying(true);
    startPlayback();
  }
  function next(random = mode === "shuffle") {
    const options = tracks.filter((t) => t.id !== track);
    if (!options.length) return;
    const selected = random
      ? options[Math.floor(Math.random() * options.length)]
      : tracks[(tracks.findIndex((t) => t.id === track) + 1) % tracks.length];
    setTrack(selected.id);
  }
  const selected = tracks.find((t) => t.id === track);
  return (
    <div
      className="music-controls"
      ref={panel}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <audio
        ref={audio}
        src={selected ? "/music/" + selected.file : undefined}
        loop={mode === "repeat"}
        preload="none"
        onEnded={() => {
          if (mode === "shuffle") next(true);
        }}
        onError={() => {
          setPlaying(false);
          onError(new Error("背景音乐加载失败"));
        }}
      />
      <button
        type="button"
        className={"icon-button " + (playing ? "music-active" : "")}
        aria-label={playing ? "暂停音乐" : "播放音乐"}
        title={playing ? "暂停音乐" : "播放音乐"}
        aria-pressed={playing}
        disabled={!selected}
        onClick={toggle}
      >
        <Music2 size={18} />
      </button>
      <button
        type="button"
        className="icon-button music-settings-toggle"
        aria-label="音乐设置"
        title="音乐设置"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDown size={14} />
      </button>
      {open && (
        <section className="music-panel" aria-label="背景音乐">
          <div className="section-heading">
            <h2>背景音乐</h2>
            <button
              className="icon-button"
              title="关闭音乐设置"
              aria-label="关闭音乐设置"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <label className="track-choice">
            曲目
            <select
              aria-label="音乐曲目"
              value={track}
              onChange={(e) => setTrack(e.target.value)}
            >
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <div className="music-mode-row">
            <div className="segmented">
              <button
                title="单曲循环"
                aria-label="单曲循环"
                aria-pressed={mode === "repeat"}
                className={mode === "repeat" ? "selected" : ""}
                onClick={() => setMode("repeat")}
              >
                <Repeat1 size={18} />
              </button>
              <button
                title="随机切换"
                aria-label="随机切换"
                aria-pressed={mode === "shuffle"}
                className={mode === "shuffle" ? "selected" : ""}
                onClick={() => setMode("shuffle")}
              >
                <Shuffle size={18} />
              </button>
            </div>
            <button
              className="icon-button"
              aria-label="下一首"
              title="下一首"
              onClick={() => next()}
              disabled={tracks.length < 2}
            >
              <SkipForward size={18} />
            </button>
          </div>
          <label className="music-volume" title="音乐音量">
            {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            <input
              aria-label="音乐音量"
              type="range"
              min="0"
              max="0.6"
              step="0.02"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
            <span>{Math.round(volume * 100)}%</span>
          </label>
          <label className="victory-music-option">
            <input
              type="checkbox"
              checked={victoryEnabled}
              onChange={(e) => onVictoryToggle(e.target.checked)}
            />
            胜利音乐
          </label>
        </section>
      )}
    </div>
  );
}

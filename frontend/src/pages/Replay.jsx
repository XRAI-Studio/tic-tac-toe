import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "../api";
import Board3D from "../components/Board3D";
import { emptyBoard, generateLines, checkWinner, PLAYER_COLORS, cellNotation } from "../game/logic";
import { motion } from "framer-motion";
import { Play as PlayIcon, Pause, RotateCcw, Home, FastForward } from "lucide-react";

const MARK_SYMBOL = ["╳", "⚫", "▲"];

export default function Replay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [replay, setReplay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(700);
  const timerRef = useRef(null);
  const [resetToken, setResetToken] = useState(0);

  useEffect(() => {
    api.get(`/replays/${id}`)
      .then(({ data }) => setReplay(data))
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") console.debug("[replay] fetch failed:", err?.message);
        navigate("/", { replace: true });
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const N = replay?.board_size || 3;
  const lines = useMemo(() => generateLines(N), [N]);
  const moves = replay?.moves || [];

  const board = useMemo(() => {
    const b = emptyBoard(N);
    for (let i = 0; i < step; i++) {
      const m = moves[i];
      b[m.flat] = m.player;
    }
    return b;
  }, [N, step, moves]);

  const winInfo = useMemo(() => checkWinner(board, lines), [board, lines]);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!playing || !replay) return;
    if (step >= moves.length) { setPlaying(false); return; }
    timerRef.current = setTimeout(() => setStep((s) => s + 1), speed);
    return () => clearTimeout(timerRef.current);
  }, [step, playing, speed, replay, moves.length]);

  if (loading) return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
      <div className="font-mono text-slate-400">Loading replay…</div>
    </div>
  );

  if (!replay) return null;

  const isFinal = step >= moves.length;

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)]" data-testid="replay-screen">
      <div className="absolute inset-0">
        <Board3D
          N={N}
          board={board}
          currentPlayer={0}
          onPlay={() => {}}
          winningLine={isFinal ? winInfo.line : null}
          disabled={true}
          exploded={false}
          resetToken={resetToken}
        />
      </div>

      <div className="absolute top-4 left-4 z-30 glass rounded-lg p-4 w-[280px] max-w-[80vw]" data-testid="replay-info">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[#2B4FFF] mb-1">Replay</div>
        <div className="font-heading uppercase tracking-wider text-white">{replay.player_name}</div>
        <div className="font-mono text-[10px] text-slate-400 mt-1">
          {N}×{N}×{N} · {replay.mode?.replace("_", " ")}
          {replay.result === "win" && <span className="ml-2 text-[#00E676]">WIN</span>}
          {replay.result === "loss" && <span className="ml-2 text-[#FF1744]">LOSS</span>}
          {replay.result === "draw" && <span className="ml-2 text-slate-300">DRAW</span>}
        </div>
        <div className="mt-3">
          <div className="h-1 bg-[#0A0A12] rounded overflow-hidden">
            <div className="h-full bg-[#2B4FFF]" style={{ width: `${(step / Math.max(moves.length, 1)) * 100}%`, boxShadow: "0 0 10px #2B4FFF" }} />
          </div>
          <div className="font-mono text-[10px] text-slate-500 mt-1">move {step} / {moves.length}</div>
        </div>
      </div>

      <div className="absolute top-4 right-4 z-30 flex flex-col gap-2">
        <button onClick={() => setResetToken((t) => t + 1)} className="glass rounded px-3 py-2 text-xs text-slate-200 hover:text-[#2B4FFF] flex items-center gap-2" data-testid="replay-reset-view-btn">
          <RotateCcw className="w-3.5 h-3.5" /> Reset View
        </button>
        <Link to="/lobby" className="glass rounded px-3 py-2 text-xs text-slate-200 hover:text-[#2B4FFF] flex items-center gap-2" data-testid="replay-lobby-btn">
          <Home className="w-3.5 h-3.5" /> Lobby
        </Link>
      </div>

      <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 glass rounded-full px-4 py-2 flex items-center gap-3" data-testid="replay-controls">
        <button
          onClick={() => { if (isFinal) setStep(0); setPlaying((p) => !p); }}
          className="text-[#2B4FFF] hover:glow-text transition"
          data-testid="replay-playpause-btn"
          aria-label="Play/Pause"
        >
          {playing && !isFinal ? <Pause className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
        </button>
        <button onClick={() => { setStep(0); setPlaying(false); }} className="text-slate-300 hover:text-white transition" data-testid="replay-rewind-btn" aria-label="Rewind">
          <RotateCcw className="w-4 h-4" />
        </button>
        <button onClick={() => setStep(moves.length)} className="text-slate-300 hover:text-white transition" data-testid="replay-skip-btn" aria-label="Skip to end">
          <FastForward className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-1 ml-2">
          {[400, 700, 1200].map((s, i) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2 py-1 rounded text-[10px] uppercase tracking-widest ${speed === s ? "text-[#2B4FFF] border border-[#2B4FFF]/60" : "text-slate-500 border border-transparent hover:text-slate-200"}`}
              data-testid={`replay-speed-${i}`}
            >
              {i === 0 ? "Fast" : i === 1 ? "Med" : "Slow"}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

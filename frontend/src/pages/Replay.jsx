import { useCallback, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Board3D from "../components/Board3D";
import { useReplayState } from "../game/useReplayState";
import { motion } from "framer-motion";
import { Play as PlayIcon, Pause, RotateCcw, Home, FastForward } from "lucide-react";

const SPEED_OPTIONS = [
  { ms: 400,  label: "Fast" },
  { ms: 700,  label: "Med"  },
  { ms: 1200, label: "Slow" },
];

function ReplayInfo({ replay, N, step, total }) {
  const pct = (step / Math.max(total, 1)) * 100;
  return (
    <div className="absolute top-4 left-4 z-30 glass rounded-lg p-4 w-[280px] max-w-[80vw]" data-testid="replay-info">
      <div className="text-[10px] tracking-[0.3em] uppercase text-[#2B4FFF] mb-1">Replay</div>
      <div className="font-heading uppercase tracking-wider text-white">{replay.player_name}</div>
      <div className="font-mono text-[10px] text-slate-400 mt-1">
        {N}×{N}×{N} · {replay.mode?.replace("_", " ")}
        {replay.result === "win"  && <span className="ml-2 text-[#00E676]">WIN</span>}
        {replay.result === "loss" && <span className="ml-2 text-[#FF1744]">LOSS</span>}
        {replay.result === "draw" && <span className="ml-2 text-slate-300">DRAW</span>}
      </div>
      <div className="mt-3">
        <div className="h-1 bg-[#0A0A12] rounded overflow-hidden">
          <div className="h-full bg-[#2B4FFF]" style={{ width: `${pct}%`, boxShadow: "0 0 10px #2B4FFF" }} />
        </div>
        <div className="font-mono text-[10px] text-slate-500 mt-1">move {step} / {total}</div>
      </div>
    </div>
  );
}

function ReplayControls({ playing, isFinal, speed, setSpeed, togglePlay, rewind, skipToEnd }) {
  return (
    <motion.div
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 glass rounded-full px-4 py-2 flex items-center gap-3"
      data-testid="replay-controls"
    >
      <button
        onClick={togglePlay}
        className="text-[#2B4FFF] hover:glow-text transition"
        data-testid="replay-playpause-btn"
        aria-label="Play/Pause"
      >
        {playing && !isFinal ? <Pause className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
      </button>
      <button onClick={rewind} className="text-slate-300 hover:text-white transition" data-testid="replay-rewind-btn" aria-label="Rewind">
        <RotateCcw className="w-4 h-4" />
      </button>
      <button onClick={skipToEnd} className="text-slate-300 hover:text-white transition" data-testid="replay-skip-btn" aria-label="Skip to end">
        <FastForward className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-1 ml-2">
        {SPEED_OPTIONS.map((opt, i) => {
          const active = speed === opt.ms;
          return (
            <button
              key={`speed-${opt.ms}`}
              onClick={() => setSpeed(opt.ms)}
              className={`px-2 py-1 rounded text-[10px] uppercase tracking-widest ${active ? "text-[#2B4FFF] border border-[#2B4FFF]/60" : "text-slate-500 border border-transparent hover:text-slate-200"}`}
              data-testid={`replay-speed-${i}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

export default function Replay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [resetToken, setResetToken] = useState(0);

  const handleLoadError = useCallback(() => navigate("/", { replace: true }), [navigate]);
  const {
    replay, loading, step, moves, N, board, winInfo,
    playing, speed, isFinal,
    setSpeed, togglePlay, rewind, skipToEnd,
  } = useReplayState({ id, onLoadError: handleLoadError });

  if (loading) return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
      <div className="font-mono text-slate-400">Loading replay…</div>
    </div>
  );
  if (!replay) return null;

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

      <ReplayInfo replay={replay} N={N} step={step} total={moves.length} />

      <div className="absolute top-4 right-4 z-30 flex flex-col gap-2">
        <button onClick={() => setResetToken((t) => t + 1)} className="glass rounded px-3 py-2 text-xs text-slate-200 hover:text-[#2B4FFF] flex items-center gap-2" data-testid="replay-reset-view-btn">
          <RotateCcw className="w-3.5 h-3.5" /> Reset View
        </button>
        <Link to="/lobby" className="glass rounded px-3 py-2 text-xs text-slate-200 hover:text-[#2B4FFF] flex items-center gap-2" data-testid="replay-lobby-btn">
          <Home className="w-3.5 h-3.5" /> Lobby
        </Link>
      </div>

      <ReplayControls
        playing={playing}
        isFinal={isFinal}
        speed={speed}
        setSpeed={setSpeed}
        togglePlay={togglePlay}
        rewind={rewind}
        skipToEnd={skipToEnd}
      />
    </div>
  );
}

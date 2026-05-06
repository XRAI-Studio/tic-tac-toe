import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Board3D from "../components/Board3D";
import { cellNotation, PLAYER_COLORS } from "../game/logic";
import { useGameState } from "../game/useGameState";
import { useAuth } from "../contexts/AuthContext";
import { useSound } from "../contexts/SoundContext";
import { useIsMobile } from "../hooks/useIsMobile";
import api from "../api";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw, Layers, RotateCcw, Home, Trophy, Share2, Undo2,
  Check, Copy, Layers3, Menu, X, ListOrdered,
} from "lucide-react";

const PLAYER_NAMES = ["Blue", "Red", "Green"];
const MARK_SYMBOL  = ["╳", "⚫", "▲"];
const HUMAN_ID = 0;
const AI_ID    = 1;

function parseMode(mode) {
  if (mode?.startsWith("ai_")) return { isAI: true, difficulty: mode.slice(3), numPlayers: 2 };
  if (mode === "local_3p")     return { isAI: false, numPlayers: 3 };
  return { isAI: false, numPlayers: 2 };
}

function statusForPlayer(active, aiThinking, p) {
  if (!active) return "waiting";
  if (aiThinking && p === AI_ID) return "thinking…";
  return "your move";
}

/* ────────────────────────────── Desktop HUD panels ────────────────────────────── */

function PlayerPanel({ N, mode, numPlayers, turn, isAI, aiThinking, difficulty, result }) {
  return (
    <div className="absolute top-4 left-4 z-30 glass rounded-lg p-4 w-[260px] max-w-[80vw]" data-testid="player-panel">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[#2B4FFF]">Match</div>
        <div className="font-mono text-[10px] text-slate-400">{N}×{N}×{N} · {mode.replace("_", " ")}</div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: numPlayers }).map((_, p) => {
          const active = !result && turn === p;
          const name = isAI && p === AI_ID ? `AI · ${difficulty}` : PLAYER_NAMES[p];
          return (
            <div
              key={`player-${p}`}
              data-testid={`player-row-${p}`}
              className={`flex items-center gap-3 px-3 py-2 rounded border transition-all ${active ? "border-[#2B4FFF] bg-[#2B4FFF]/10" : "border-[#2B4FFF]/10"}`}
            >
              <div className="w-7 h-7 rounded flex items-center justify-center font-hud text-lg" style={{ color: PLAYER_COLORS[p], textShadow: `0 0 10px ${PLAYER_COLORS[p]}` }}>
                {MARK_SYMBOL[p]}
              </div>
              <div className="flex-1">
                <div className="font-heading uppercase text-xs tracking-wider text-white">{name}</div>
                <div className="font-mono text-[10px] text-slate-400">{statusForPlayer(active, aiThinking, p)}</div>
              </div>
              {active && <div className="w-2 h-2 rounded-full bg-[#2B4FFF] pulse-glow" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ControlsPanel({ canUndo, exploded, onResetView, onToggleExplode, onUndo, onReset }) {
  return (
    <div className="absolute top-4 right-4 z-30 flex flex-col gap-2" data-testid="controls-panel">
      <button onClick={onResetView} className="glass rounded px-3 py-2 text-xs text-slate-200 hover:text-[#2B4FFF] transition flex items-center gap-2" data-testid="reset-view-btn">
        <RotateCcw className="w-3.5 h-3.5" /> Reset View
      </button>
      <button onClick={onToggleExplode} className={`glass rounded px-3 py-2 text-xs hover:text-[#2B4FFF] transition flex items-center gap-2 ${exploded ? "text-[#2B4FFF]" : "text-slate-200"}`} data-testid="explode-toggle-btn">
        <Layers className="w-3.5 h-3.5" /> {exploded ? "Collapse" : "Exploded"}
      </button>
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className={`glass rounded px-3 py-2 text-xs transition flex items-center gap-2 ${canUndo ? "text-slate-200 hover:text-[#2B4FFF]" : "text-slate-600 opacity-50 cursor-not-allowed"}`}
        data-testid="undo-btn"
      >
        <Undo2 className="w-3.5 h-3.5" /> Undo
      </button>
      <button onClick={onReset} className="glass rounded px-3 py-2 text-xs text-slate-200 hover:text-[#2B4FFF] transition flex items-center gap-2" data-testid="new-game-btn">
        <RefreshCw className="w-3.5 h-3.5" /> New Game
      </button>
      <Link to="/lobby" className="glass rounded px-3 py-2 text-xs text-slate-200 hover:text-[#2B4FFF] transition flex items-center gap-2" data-testid="back-lobby-btn">
        <Home className="w-3.5 h-3.5" /> Lobby
      </Link>
    </div>
  );
}

function HistoryPanel({ history, N }) {
  return (
    <div className="absolute bottom-4 right-4 z-30 glass rounded-lg p-3 w-[260px] max-w-[80vw] max-h-[260px] flex flex-col" data-testid="history-panel">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] tracking-[0.3em] uppercase text-[#2B4FFF]">Move Log</div>
        <div className="font-mono text-[10px] text-slate-500">{history.length}</div>
      </div>
      <div className="flex-1 overflow-y-auto hide-scrollbar space-y-1">
        {history.length === 0 && <div className="text-xs text-slate-500 font-mono">No moves yet.</div>}
        {history.map((m, i) => {
          const notation = cellNotation(N, m.flat);
          return (
            <div key={`move-${i}-${m.flat}`} className="flex items-center justify-between text-xs font-mono" data-testid={`move-${i}`}>
              <span className="text-slate-500">#{i + 1}</span>
              <span style={{ color: PLAYER_COLORS[m.player] }}>{MARK_SYMBOL[m.player]}</span>
              <span className="text-slate-300">{notation.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LevelPicker({ N, activeLevel, onChange }) {
  const levels = Array.from({ length: N }, (_, i) => i);
  return (
    <div className="absolute top-[168px] left-4 z-30 glass rounded-lg p-3 flex flex-col gap-2" data-testid="level-picker">
      <div className="text-[10px] tracking-[0.3em] uppercase text-[#2B4FFF] flex items-center gap-1.5">
        <Layers3 className="w-3 h-3" /> Level
      </div>
      <div className="flex flex-col gap-1">
        <button
          onClick={() => onChange(null)}
          data-testid="level-all-btn"
          className={`px-3 py-1 rounded text-[11px] font-heading uppercase tracking-wider transition-all text-left ${
            activeLevel === null
              ? "text-[#2B4FFF] border border-[#2B4FFF]/60 bg-[#2B4FFF]/10"
              : "text-slate-300 border border-[#2B4FFF]/15 hover:border-[#2B4FFF]/40"
          }`}
        >
          All <span className="text-[9px] text-slate-500 ml-1">(0)</span>
        </button>
        {levels.map((L) => (
          <button
            key={`lvl-${L}`}
            onClick={() => onChange(L)}
            data-testid={`level-${L}-btn`}
            className={`px-3 py-1 rounded text-[11px] font-heading uppercase tracking-wider transition-all text-left ${
              activeLevel === L
                ? "text-[#2B4FFF] border border-[#2B4FFF]/60 bg-[#2B4FFF]/10"
                : "text-slate-300 border border-[#2B4FFF]/15 hover:border-[#2B4FFF]/40"
            }`}
          >
            L{L + 1} <span className="text-[9px] text-slate-500 ml-1">({L + 1})</span>
          </button>
        ))}
      </div>
      <div className="text-[9px] text-slate-500 font-mono leading-tight pt-1 border-t border-[#2B4FFF]/10 max-w-[140px]">
        Drag to rotate 3-axis · Scroll to zoom · Pick a level to click inner cells
      </div>
    </div>
  );
}

/* ────────────────────────────── Mobile HUD ────────────────────────────── */

function MobileTopBar({ numPlayers, turn, isAI, aiThinking, difficulty, result, onOpenMenu }) {
  return (
    <div
      className="absolute top-0 inset-x-0 z-30 glass safe-pt safe-pl safe-pr px-3 py-2 flex items-center gap-3 border-b border-[#2B4FFF]/10"
      data-testid="mobile-top-bar"
    >
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto hide-scrollbar">
        {Array.from({ length: numPlayers }).map((_, p) => {
          const active = !result && turn === p;
          const name = isAI && p === AI_ID ? `AI·${difficulty}` : PLAYER_NAMES[p];
          return (
            <div
              key={`mp-${p}`}
              data-testid={`mobile-player-${p}`}
              className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all flex-shrink-0 ${
                active ? "border-[#2B4FFF] bg-[#2B4FFF]/10" : "border-[#2B4FFF]/10"
              }`}
            >
              <span
                className="font-hud text-sm"
                style={{ color: PLAYER_COLORS[p], textShadow: `0 0 8px ${PLAYER_COLORS[p]}` }}
              >
                {MARK_SYMBOL[p]}
              </span>
              <span className="font-heading uppercase text-[10px] tracking-wider text-white">{name}</span>
              {active && aiThinking && p === AI_ID && (
                <span className="font-mono text-[9px] text-slate-400">…</span>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={onOpenMenu}
        className="tap-target rounded border border-[#2B4FFF]/30 text-slate-200 hover:text-[#2B4FFF] transition flex items-center justify-center"
        data-testid="mobile-menu-btn"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>
    </div>
  );
}

function MobileBottomBar({ N, activeLevel, setActiveLevel, canUndo, onUndo, onResetView, onShowHistory, historyCount }) {
  const levels = Array.from({ length: N }, (_, i) => i);
  return (
    <div
      className="absolute inset-x-0 z-30 glass safe-pl safe-pr border-t border-[#2B4FFF]/10"
      style={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }}
      data-testid="mobile-bottom-bar"
    >
      {/* Horizontal level chips */}
      <div className="px-3 pt-2 pb-1 flex items-center gap-1.5 overflow-x-auto hide-scrollbar">
        <span className="text-[9px] tracking-[0.25em] uppercase text-[#2B4FFF] flex-shrink-0 mr-1">Level</span>
        <button
          onClick={() => setActiveLevel(null)}
          data-testid="m-level-all-btn"
          className={`tap-target px-3 rounded text-[11px] font-heading uppercase tracking-wider flex-shrink-0 transition-all ${
            activeLevel === null ? "text-[#2B4FFF] border border-[#2B4FFF]/60 bg-[#2B4FFF]/10" : "text-slate-300 border border-[#2B4FFF]/20"
          }`}
        >
          All
        </button>
        {levels.map((L) => (
          <button
            key={`ml-${L}`}
            onClick={() => setActiveLevel(L)}
            data-testid={`m-level-${L}-btn`}
            className={`tap-target px-3 rounded text-[11px] font-heading uppercase tracking-wider flex-shrink-0 transition-all ${
              activeLevel === L ? "text-[#2B4FFF] border border-[#2B4FFF]/60 bg-[#2B4FFF]/10" : "text-slate-300 border border-[#2B4FFF]/20"
            }`}
          >
            L{L + 1}
          </button>
        ))}
      </div>

      {/* Action row */}
      <div className="px-3 pb-2 pt-1 flex items-center gap-2">
        <button
          onClick={onResetView}
          className="tap-target flex-1 rounded border border-[#2B4FFF]/20 text-slate-200 hover:text-[#2B4FFF] transition flex items-center justify-center gap-1.5 text-[11px] font-heading uppercase tracking-wider"
          data-testid="m-reset-view-btn"
        >
          <RotateCcw className="w-4 h-4" /> View
        </button>
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`tap-target flex-1 rounded border transition flex items-center justify-center gap-1.5 text-[11px] font-heading uppercase tracking-wider ${
            canUndo
              ? "border-[#2B4FFF]/20 text-slate-200 hover:text-[#2B4FFF]"
              : "border-slate-800 text-slate-600 opacity-50"
          }`}
          data-testid="m-undo-btn"
        >
          <Undo2 className="w-4 h-4" /> Undo
        </button>
        <button
          onClick={onShowHistory}
          className="tap-target flex-1 rounded border border-[#2B4FFF]/20 text-slate-200 hover:text-[#2B4FFF] transition flex items-center justify-center gap-1.5 text-[11px] font-heading uppercase tracking-wider relative"
          data-testid="m-history-btn"
        >
          <ListOrdered className="w-4 h-4" /> Log
          {historyCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-[#2B4FFF] text-white text-[9px] font-mono rounded-full w-4 h-4 flex items-center justify-center">
              {historyCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function MobileSheet({ open, onClose, title, children }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 z-40 flex items-end bg-black/50 backdrop-blur-sm"
          onClick={onClose}
          data-testid="mobile-sheet-backdrop"
        >
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full glass rounded-t-2xl safe-pb border-t border-[#2B4FFF]/30 max-h-[75vh] flex flex-col"
            data-testid="mobile-sheet"
          >
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <div className="text-[10px] tracking-[0.3em] uppercase text-[#2B4FFF]">{title}</div>
              <button
                onClick={onClose}
                className="tap-target rounded text-slate-300 hover:text-[#2B4FFF] transition flex items-center justify-center"
                data-testid="mobile-sheet-close"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 pb-4 overflow-y-auto hide-scrollbar flex-1">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ────────────────────────────── Shared: Result overlay ────────────────────────────── */

function winLabel(result, isAI) {
  if (isAI) return result.winner === HUMAN_ID ? "Victory" : "Defeat";
  return `${PLAYER_NAMES[result.winner]} wins`;
}

/** Result-overlay share button label: prefers "Shared!" → "Copied!" → CTA. */
function shareButtonLabel(shared, copied) {
  if (shared) return <><Check className="w-3.5 h-3.5" /> Shared!</>;
  if (copied) return <><Check className="w-3.5 h-3.5" /> Copied!</>;
  return <><Share2 className="w-3.5 h-3.5" /> Share replay</>;
}

/** Bottom turn-indicator copy: AI thinking, your turn (vs AI), or named player turn (local). */
function turnIndicatorText(isAI, turn) {
  if (isAI && turn === AI_ID) return "AI thinking";
  if (isAI) return "Your turn";
  return `${PLAYER_NAMES[turn]}'s turn`;
}

function ResultOverlay({ result, isAI, history, user, onReset, onShare, shareUrl, copied, shared, setCopied }) {
  const shareLabel = shareButtonLabel(shared, copied);
  return (
    <AnimatePresence>
      {result && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          data-testid="result-overlay"
        >
          <motion.div
            initial={{ scale: 0.88, y: 16, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: "spring", damping: 18 }}
            className="glass rounded-2xl p-6 sm:p-8 text-center w-full max-w-[460px] glow-box-lg"
          >
            {result.draw ? (
              <>
                <div className="font-heading uppercase tracking-[0.3em] text-xs text-slate-400">Result</div>
                <div className="font-heading font-black uppercase tracking-tighter text-4xl sm:text-5xl text-white mt-2">Draw</div>
                <p className="text-slate-400 text-sm mt-3 font-mono">No winning lines remaining.</p>
              </>
            ) : (
              <>
                <div className="font-heading uppercase tracking-[0.3em] text-xs" style={{ color: PLAYER_COLORS[result.winner] }}>
                  {MARK_SYMBOL[result.winner]} WINS
                </div>
                <div className="font-heading font-black uppercase tracking-tighter text-4xl sm:text-5xl text-white mt-2 glow-text-lg">
                  {winLabel(result, isAI)}
                </div>
                <p className="text-slate-400 text-sm mt-3 font-mono">in {history.length} moves</p>
              </>
            )}
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              <button onClick={onReset} className="btn-primary" data-testid="play-again-btn">Play again</button>
              <button onClick={onShare} className="btn-ghost inline-flex items-center gap-1.5" data-testid="share-btn">
                {shareLabel}
              </button>
              <Link to="/lobby" className="btn-ghost">New setup</Link>
              {user && <Link to="/profile" className="btn-ghost inline-flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" />Stats</Link>}
            </div>
            {shareUrl && (
              <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded border border-[#2B4FFF]/30 bg-[#2B4FFF]/5" data-testid="share-url">
                <input value={shareUrl} readOnly onClick={(e) => e.target.select()} className="flex-1 bg-transparent font-mono text-[11px] text-[#2B4FFF] outline-none" />
                <button onClick={() => { navigator.clipboard?.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="tap-target text-slate-300 hover:text-[#2B4FFF] transition flex items-center justify-center" data-testid="copy-url-btn" aria-label="Copy">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ────────────────────────────── Page ────────────────────────────── */

export default function Play() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const sound = useSound();
  const isMobile = useIsMobile();

  const size = parseInt(params.get("size") || "3", 10);
  const isDaily = params.get("daily") === "1";
  // Daily mode locks the configuration: 3×3×3, vs Hard AI, no resume.
  const mode = isDaily ? "ai_hard" : (params.get("mode") || "local_2p");
  const resume = !isDaily && params.get("resume") === "1";
  const { isAI, difficulty, numPlayers } = parseMode(mode);
  const N = isDaily ? 3 : (size === 4 ? 4 : 3);

  // Fetch daily config BEFORE useGameState mounts so the preset opening can be
  // injected as initial state (otherwise the AI-turn effect would race the preset).
  const [dailyConfig, setDailyConfig] = useState(null);
  const [dailyConfigLoaded, setDailyConfigLoaded] = useState(!isDaily);
  useEffect(() => {
    if (!isDaily) return;
    api.get("/daily/today")
      .then(({ data }) => { setDailyConfig(data); setDailyConfigLoaded(true); })
      .catch(() => setDailyConfigLoaded(true));
  }, [isDaily]);

  // Wait for daily config before mounting the game state — otherwise useGameState
  // initializes with empty board and the preset arrives too late (after AI moves).
  if (isDaily && !dailyConfigLoaded) {
    return <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center text-slate-500 font-mono">Loading today's cube…</div>;
  }
  return <PlayInner
    N={N} mode={mode} isAI={isAI} difficulty={difficulty} numPlayers={numPlayers}
    user={user} resume={resume} sound={sound} isMobile={isMobile}
    isDaily={isDaily} dailyConfig={dailyConfig}
  />;
}

function PlayInner({ N, mode, isAI, difficulty, numPlayers, user, resume, sound, isMobile, isDaily, dailyConfig }) {
  const game = useGameState({
    N, mode, isAI, difficulty, numPlayers, user, resume, sound,
    presetMoves: dailyConfig?.starting_moves,
  });
  const [exploded, setExploded]       = useState(false);
  const [resetToken, setResetToken]   = useState(0);
  const [activeLevel, setActiveLevel] = useState(null);
  const [sheet, setSheet]             = useState(null); // "menu" | "history" | null

  const [dailySubmitted, setDailySubmitted] = useState(false);

  // Submit daily result once the match concludes.
  useEffect(() => {
    if (!isDaily || !dailyConfig || !game.result || dailySubmitted || !user) return;
    setDailySubmitted(true);
    const won = !game.result.draw && game.result.winner === HUMAN_ID;
    api.post("/daily/submit", {
      date: dailyConfig.date,
      moves: game.history.length,
      won,
      duration_ms: null,
    }).catch((err) => {
      if (process.env.NODE_ENV !== "production") console.debug("[daily] submit failed:", err?.message);
    });
  }, [isDaily, dailyConfig, game.result, dailySubmitted, user, game.history.length]);

  // Keyboard shortcuts: 0 = All levels · 1-4 = lock to that level
  useEffect(() => {
    const handler = (e) => {
      if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA") return;
      if (e.key === "0") setActiveLevel(null);
      else if (["1", "2", "3", "4"].includes(e.key)) {
        const L = parseInt(e.key, 10) - 1;
        if (L < N) setActiveLevel(L);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [N]);

  const currentPlayer = game.result ? null : game.turn;
  const disabled = !!game.result || (isAI && game.turn === AI_ID);
  const canUndo  = !isAI && !game.result && game.history.length > 0;
  const onResetView = () => setResetToken((t) => t + 1);
  const onNewGame   = () => { game.reset(); setResetToken((t) => t + 1); setSheet(null); };

  return (
    <div className="relative h-[calc(100vh-3.5rem)] overflow-hidden no-select" data-testid="play-screen">
      <div className="absolute inset-0 touch-none">
        <Board3D
          N={N}
          board={game.board}
          currentPlayer={currentPlayer ?? 0}
          onPlay={game.play}
          winningLine={game.result?.line || null}
          disabled={disabled}
          exploded={exploded}
          resetToken={resetToken}
          activeLevel={activeLevel}
        />
      </div>

      {/* Desktop HUD */}
      {!isMobile && (
        <>
          <PlayerPanel
            N={N} mode={mode} numPlayers={numPlayers}
            turn={game.turn} isAI={isAI} aiThinking={game.aiThinking}
            difficulty={difficulty} result={game.result}
          />
          <LevelPicker N={N} activeLevel={activeLevel} onChange={setActiveLevel} />
          <ControlsPanel
            canUndo={canUndo} exploded={exploded}
            onResetView={onResetView}
            onToggleExplode={() => setExploded((x) => !x)}
            onUndo={game.undo}
            onReset={onNewGame}
          />
          <HistoryPanel history={game.history} N={N} />
          {!game.result && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 glass rounded-full px-5 py-2 flex items-center gap-3" data-testid="turn-indicator">
              <span className="font-hud text-xl" style={{ color: PLAYER_COLORS[game.turn], textShadow: `0 0 12px ${PLAYER_COLORS[game.turn]}` }}>{MARK_SYMBOL[game.turn]}</span>
              <span className="font-heading uppercase tracking-[0.2em] text-xs text-white">
                {turnIndicatorText(isAI, game.turn)}
              </span>
            </div>
          )}
        </>
      )}

      {/* Mobile HUD */}
      {isMobile && (
        <>
          <MobileTopBar
            numPlayers={numPlayers} turn={game.turn} isAI={isAI}
            aiThinking={game.aiThinking} difficulty={difficulty} result={game.result}
            onOpenMenu={() => setSheet("menu")}
          />
          <MobileBottomBar
            N={N}
            activeLevel={activeLevel}
            setActiveLevel={setActiveLevel}
            canUndo={canUndo}
            onUndo={game.undo}
            onResetView={onResetView}
            onShowHistory={() => setSheet("history")}
            historyCount={game.history.length}
          />

          <MobileSheet open={sheet === "menu"} onClose={() => setSheet(null)} title="Menu">
            <div className="space-y-2 font-mono text-xs text-slate-300">
              <div className="text-slate-500">{N}×{N}×{N} · {mode.replace("_", " ")}</div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => { setExploded((x) => !x); setSheet(null); }} className={`tap-target rounded border transition flex items-center justify-center gap-2 text-xs font-heading uppercase tracking-wider ${exploded ? "text-[#2B4FFF] border-[#2B4FFF]/60 bg-[#2B4FFF]/10" : "text-slate-200 border-[#2B4FFF]/20"}`} data-testid="m-explode-toggle-btn">
                <Layers className="w-4 h-4" /> {exploded ? "Collapse" : "Exploded"}
              </button>
              <button onClick={onNewGame} className="tap-target rounded border border-[#2B4FFF]/20 text-slate-200 hover:text-[#2B4FFF] transition flex items-center justify-center gap-2 text-xs font-heading uppercase tracking-wider" data-testid="m-new-game-btn">
                <RefreshCw className="w-4 h-4" /> New Game
              </button>
              <Link to="/lobby" className="tap-target rounded border border-[#2B4FFF]/20 text-slate-200 hover:text-[#2B4FFF] transition flex items-center justify-center gap-2 text-xs font-heading uppercase tracking-wider" data-testid="m-back-lobby-btn">
                <Home className="w-4 h-4" /> Lobby
              </Link>
              <Link to="/leaderboard" className="tap-target rounded border border-[#2B4FFF]/20 text-slate-200 hover:text-[#2B4FFF] transition flex items-center justify-center gap-2 text-xs font-heading uppercase tracking-wider">
                <Trophy className="w-4 h-4" /> Leaderboard
              </Link>
            </div>
          </MobileSheet>

          <MobileSheet open={sheet === "history"} onClose={() => setSheet(null)} title={`Move Log · ${game.history.length}`}>
            {game.history.length === 0 && <div className="text-xs text-slate-500 font-mono py-4 text-center">No moves yet.</div>}
            <div className="space-y-1">
              {game.history.map((m, i) => {
                const notation = cellNotation(N, m.flat);
                return (
                  <div key={`mhist-${i}-${m.flat}`} className="flex items-center justify-between text-xs font-mono px-2 py-1.5 rounded border border-[#2B4FFF]/10" data-testid={`m-move-${i}`}>
                    <span className="text-slate-500">#{i + 1}</span>
                    <span className="font-hud text-base" style={{ color: PLAYER_COLORS[m.player] }}>{MARK_SYMBOL[m.player]}</span>
                    <span className="text-slate-300">{notation.label}</span>
                  </div>
                );
              })}
            </div>
          </MobileSheet>
        </>
      )}

      <ResultOverlay
        result={game.result} isAI={isAI} history={game.history} user={user}
        onReset={game.reset} onShare={game.shareReplay}
        shareUrl={game.shareUrl} copied={game.copied} shared={game.shared} setCopied={game.setCopied}
      />
    </div>
  );
}

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Board3D from "../components/Board3D";
import { cellNotation, PLAYER_COLORS } from "../game/logic";
import { useGameState } from "../game/useGameState";
import { useAuth } from "../contexts/AuthContext";
import { useSound } from "../contexts/SoundContext";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Layers, RotateCcw, Home, Trophy, Share2, Undo2, Check, Copy } from "lucide-react";

const PLAYER_NAMES = ["Blue", "Red", "Green"];
const MARK_SYMBOL  = ["╳", "⚫", "▲"];
const HUMAN_ID = 0;
const AI_ID    = 1;

function parseMode(mode) {
  if (mode?.startsWith("ai_")) return { isAI: true, difficulty: mode.slice(3), numPlayers: 2 };
  if (mode === "local_3p")     return { isAI: false, numPlayers: 3 };
  return { isAI: false, numPlayers: 2 };
}

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
                <div className="font-mono text-[10px] text-slate-400">{active ? (aiThinking && p === AI_ID ? "thinking…" : "your move") : "waiting"}</div>
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

function ResultOverlay({ result, isAI, history, user, onReset, onShare, shareUrl, copied, setCopied }) {
  return (
    <AnimatePresence>
      {result && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          data-testid="result-overlay"
        >
          <motion.div
            initial={{ scale: 0.88, y: 16, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: "spring", damping: 18 }}
            className="glass rounded-2xl p-8 text-center w-[460px] max-w-[92vw] glow-box-lg"
          >
            {result.draw ? (
              <>
                <div className="font-heading uppercase tracking-[0.3em] text-xs text-slate-400">Result</div>
                <div className="font-heading font-black uppercase tracking-tighter text-5xl text-white mt-2">Draw</div>
                <p className="text-slate-400 text-sm mt-3 font-mono">No winning lines remaining.</p>
              </>
            ) : (
              <>
                <div className="font-heading uppercase tracking-[0.3em] text-xs" style={{ color: PLAYER_COLORS[result.winner] }}>
                  {MARK_SYMBOL[result.winner]} WINS
                </div>
                <div className="font-heading font-black uppercase tracking-tighter text-5xl text-white mt-2 glow-text-lg">
                  {isAI ? (result.winner === HUMAN_ID ? "Victory" : "Defeat") : `${PLAYER_NAMES[result.winner]} wins`}
                </div>
                <p className="text-slate-400 text-sm mt-3 font-mono">in {history.length} moves</p>
              </>
            )}
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              <button onClick={onReset} className="btn-primary" data-testid="play-again-btn">Play again</button>
              <button onClick={onShare} className="btn-ghost inline-flex items-center gap-1.5" data-testid="share-btn">
                {copied ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Share2 className="w-3.5 h-3.5" /> Share replay</>}
              </button>
              <Link to="/lobby" className="btn-ghost">New setup</Link>
              {user && <Link to="/profile" className="btn-ghost inline-flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" />Stats</Link>}
            </div>
            {shareUrl && (
              <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded border border-[#2B4FFF]/30 bg-[#2B4FFF]/5" data-testid="share-url">
                <input value={shareUrl} readOnly onClick={(e) => e.target.select()} className="flex-1 bg-transparent font-mono text-[11px] text-[#2B4FFF] outline-none" />
                <button onClick={() => { navigator.clipboard?.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="text-slate-300 hover:text-[#2B4FFF] transition" data-testid="copy-url-btn" aria-label="Copy">
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

export default function Play() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const sound = useSound();

  const size = parseInt(params.get("size") || "3", 10);
  const mode = params.get("mode") || "local_2p";
  const resume = params.get("resume") === "1";
  const { isAI, difficulty, numPlayers } = parseMode(mode);
  const N = size === 4 ? 4 : 3;

  const game = useGameState({ N, mode, isAI, difficulty, numPlayers, user, resume, sound });
  const [exploded, setExploded]     = useState(false);
  const [resetToken, setResetToken] = useState(0);

  const currentPlayer = game.result ? null : game.turn;
  const disabled = !!game.result || (isAI && game.turn === AI_ID);
  const canUndo  = !isAI && !game.result && game.history.length > 0;

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden" data-testid="play-screen">
      <div className="absolute inset-0">
        <Board3D
          N={N}
          board={game.board}
          currentPlayer={currentPlayer ?? 0}
          onPlay={game.play}
          winningLine={game.result?.line || null}
          disabled={disabled}
          exploded={exploded}
          resetToken={resetToken}
        />
      </div>

      <PlayerPanel
        N={N} mode={mode} numPlayers={numPlayers}
        turn={game.turn} isAI={isAI} aiThinking={game.aiThinking}
        difficulty={difficulty} result={game.result}
      />

      <ControlsPanel
        canUndo={canUndo} exploded={exploded}
        onResetView={() => setResetToken((t) => t + 1)}
        onToggleExplode={() => setExploded((x) => !x)}
        onUndo={game.undo}
        onReset={() => { game.reset(); setResetToken((t) => t + 1); }}
      />

      <HistoryPanel history={game.history} N={N} />

      {!game.result && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 glass rounded-full px-5 py-2 flex items-center gap-3" data-testid="turn-indicator">
          <span className="font-hud text-xl" style={{ color: PLAYER_COLORS[game.turn], textShadow: `0 0 12px ${PLAYER_COLORS[game.turn]}` }}>{MARK_SYMBOL[game.turn]}</span>
          <span className="font-heading uppercase tracking-[0.2em] text-xs text-white">
            {isAI && game.turn === AI_ID ? `AI thinking` : (isAI ? "Your turn" : `${PLAYER_NAMES[game.turn]}'s turn`)}
          </span>
        </div>
      )}

      <ResultOverlay
        result={game.result} isAI={isAI} history={game.history} user={user}
        onReset={game.reset} onShare={game.shareReplay}
        shareUrl={game.shareUrl} copied={game.copied} setCopied={game.setCopied}
      />
    </div>
  );
}

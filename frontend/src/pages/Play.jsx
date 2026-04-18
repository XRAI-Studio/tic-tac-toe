import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import Board3D from "../components/Board3D";
import { emptyBoard, generateLines, checkWinner, isDraw, cellNotation, PLAYER_COLORS } from "../game/logic";
import { pickAIMove } from "../game/ai";
import { useAuth } from "../contexts/AuthContext";
import api from "../api";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Layers, RotateCcw, Home, Trophy, Share2, ArrowRight } from "lucide-react";

const PLAYER_NAMES = ["Cyan", "Orange", "Green"];
const MARK_SYMBOL = ["╳", "⚫", "▲"];

function parseMode(mode) {
  if (mode?.startsWith("ai_")) return { isAI: true, difficulty: mode.slice(3), numPlayers: 2 };
  if (mode === "local_3p") return { isAI: false, numPlayers: 3 };
  return { isAI: false, numPlayers: 2 };
}

export default function Play() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const size = parseInt(params.get("size") || "3", 10);
  const mode = params.get("mode") || "local_2p";
  const { isAI, difficulty, numPlayers } = parseMode(mode);
  const N = size === 4 ? 4 : 3;

  const lines = useMemo(() => generateLines(N), [N]);
  const [board, setBoard] = useState(() => emptyBoard(N));
  const [turn, setTurn] = useState(0); // player index
  const [history, setHistory] = useState([]); // [{ player, flat }]
  const [result, setResult] = useState(null); // { winner, line } | 'draw' | null
  const [exploded, setExploded] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [aiThinking, setAiThinking] = useState(false);
  const startedAt = useRef(Date.now());
  const recordedRef = useRef(false);

  // In AI mode, human is player 0, AI is player 1.
  const humanId = 0;
  const aiId = 1;

  const play = useCallback((flat) => {
    if (result || board[flat] !== null) return;
    setBoard((prev) => {
      const next = prev.slice();
      next[flat] = turn;
      return next;
    });
    setHistory((h) => [...h, { player: turn, flat }]);
  }, [board, turn, result]);

  // After any board change, check winner/draw then rotate turn
  useEffect(() => {
    const res = checkWinner(board, lines);
    if (res.winner !== null) {
      setResult({ winner: res.winner, line: res.line });
      return;
    }
    if (isDraw(board, lines, numPlayers)) {
      setResult({ winner: null, line: null, draw: true });
      return;
    }
    // Advance turn only when a move was made - track via history length parity
    // We always recompute next turn from history to keep consistent.
  }, [board, lines, numPlayers]);

  // Derive whose turn from history length
  useEffect(() => {
    if (result) return;
    const next = history.length % numPlayers;
    setTurn(next);
  }, [history.length, numPlayers, result]);

  // AI plays when it's the AI's turn
  useEffect(() => {
    if (!isAI || result) return;
    if (turn !== aiId) return;
    setAiThinking(true);
    const t = setTimeout(() => {
      const move = pickAIMove(difficulty, board, lines, aiId, humanId, N);
      if (move !== undefined && move !== null) {
        setBoard((prev) => {
          const next = prev.slice();
          if (next[move] === null) next[move] = aiId;
          return next;
        });
        setHistory((h) => [...h, { player: aiId, flat: move }]);
      }
      setAiThinking(false);
    }, 400);
    return () => { clearTimeout(t); setAiThinking(false); };
  }, [turn, isAI, result, board, lines, difficulty, N]);

  // Record game result to backend
  useEffect(() => {
    if (!result || recordedRef.current) return;
    if (!user) return;
    recordedRef.current = true;
    let myResult;
    if (result.draw) myResult = "draw";
    else if (isAI) myResult = result.winner === humanId ? "win" : "loss";
    else myResult = "win"; // local games are recorded as a win for the account holder
    api.post("/games/record", {
      board_size: N,
      mode,
      result: myResult,
      moves: history.length,
      duration_ms: Date.now() - startedAt.current,
    }).catch(() => {});
  }, [result, user, isAI, N, mode, history.length]);

  const resetGame = () => {
    setBoard(emptyBoard(N));
    setHistory([]);
    setTurn(0);
    setResult(null);
    recordedRef.current = false;
    startedAt.current = Date.now();
  };

  const resetView = () => setResetToken((t) => t + 1);

  const currentPlayer = result ? null : turn;
  const disabled = !!result || (isAI && turn === aiId);

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden" data-testid="play-screen">
      {/* 3D board full-bleed */}
      <div className="absolute inset-0">
        <Board3D
          N={N}
          board={board}
          currentPlayer={currentPlayer ?? 0}
          onPlay={play}
          winningLine={result?.line || null}
          disabled={disabled}
          exploded={exploded}
          resetToken={resetToken}
        />
      </div>

      {/* HUD: Top-left player panel */}
      <div className="absolute top-4 left-4 z-30 glass rounded-lg p-4 w-[260px] max-w-[80vw]" data-testid="player-panel">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] tracking-[0.3em] uppercase text-[#00F0FF]">Match</div>
          <div className="font-mono text-[10px] text-slate-400">{N}×{N}×{N} · {mode.replace("_", " ")}</div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: numPlayers }).map((_, p) => {
            const active = !result && turn === p;
            const name = isAI && p === aiId ? `AI · ${difficulty}` : PLAYER_NAMES[p];
            return (
              <div
                key={p}
                data-testid={`player-row-${p}`}
                className={`flex items-center gap-3 px-3 py-2 rounded border transition-all ${
                  active ? "border-[#00F0FF] bg-[#00F0FF]/10" : "border-[#00F0FF]/10"
                }`}
              >
                <div className="w-7 h-7 rounded flex items-center justify-center font-hud text-lg" style={{ color: PLAYER_COLORS[p], textShadow: `0 0 10px ${PLAYER_COLORS[p]}` }}>
                  {MARK_SYMBOL[p]}
                </div>
                <div className="flex-1">
                  <div className="font-heading uppercase text-xs tracking-wider text-white">{name}</div>
                  <div className="font-mono text-[10px] text-slate-400">{active ? (aiThinking && p === aiId ? "thinking…" : "your move") : "waiting"}</div>
                </div>
                {active && <div className="w-2 h-2 rounded-full bg-[#00F0FF] pulse-glow" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* HUD: Top-right controls */}
      <div className="absolute top-4 right-4 z-30 flex flex-col gap-2" data-testid="controls-panel">
        <button onClick={resetView} className="glass rounded px-3 py-2 text-xs text-slate-200 hover:text-[#00F0FF] transition flex items-center gap-2" data-testid="reset-view-btn">
          <RotateCcw className="w-3.5 h-3.5" /> Reset View
        </button>
        <button onClick={() => setExploded((x) => !x)} className={`glass rounded px-3 py-2 text-xs hover:text-[#00F0FF] transition flex items-center gap-2 ${exploded ? "text-[#00F0FF]" : "text-slate-200"}`} data-testid="explode-toggle-btn">
          <Layers className="w-3.5 h-3.5" /> {exploded ? "Collapse" : "Exploded"}
        </button>
        <button onClick={resetGame} className="glass rounded px-3 py-2 text-xs text-slate-200 hover:text-[#00F0FF] transition flex items-center gap-2" data-testid="new-game-btn">
          <RefreshCw className="w-3.5 h-3.5" /> New Game
        </button>
        <Link to="/lobby" className="glass rounded px-3 py-2 text-xs text-slate-200 hover:text-[#00F0FF] transition flex items-center gap-2" data-testid="back-lobby-btn">
          <Home className="w-3.5 h-3.5" /> Lobby
        </Link>
      </div>

      {/* Move history bottom-right */}
      <div className="absolute bottom-4 right-4 z-30 glass rounded-lg p-3 w-[260px] max-w-[80vw] max-h-[260px] flex flex-col" data-testid="history-panel">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] tracking-[0.3em] uppercase text-[#00F0FF]">Move Log</div>
          <div className="font-mono text-[10px] text-slate-500">{history.length}</div>
        </div>
        <div className="flex-1 overflow-y-auto hide-scrollbar space-y-1">
          {history.length === 0 && <div className="text-xs text-slate-500 font-mono">No moves yet.</div>}
          {history.map((m, i) => {
            const notation = cellNotation(N, m.flat);
            return (
              <div key={i} className="flex items-center justify-between text-xs font-mono" data-testid={`move-${i}`}>
                <span className="text-slate-500">#{i + 1}</span>
                <span style={{ color: PLAYER_COLORS[m.player] }}>{MARK_SYMBOL[m.player]}</span>
                <span className="text-slate-300">{notation.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom-center turn indicator */}
      {!result && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 glass rounded-full px-5 py-2 flex items-center gap-3" data-testid="turn-indicator">
          <span className="font-hud text-xl" style={{ color: PLAYER_COLORS[turn], textShadow: `0 0 12px ${PLAYER_COLORS[turn]}` }}>{MARK_SYMBOL[turn]}</span>
          <span className="font-heading uppercase tracking-[0.2em] text-xs text-white">
            {isAI && turn === aiId ? `AI thinking` : (isAI ? "Your turn" : `${PLAYER_NAMES[turn]}'s turn`)}
          </span>
        </div>
      )}

      {/* Result overlay */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            data-testid="result-overlay"
          >
            <motion.div
              initial={{ scale: 0.88, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", damping: 18 }}
              className="glass rounded-2xl p-8 text-center w-[420px] max-w-[92vw] glow-box-lg"
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
                    {isAI ? (result.winner === humanId ? "Victory" : "Defeat") : `${PLAYER_NAMES[result.winner]} wins`}
                  </div>
                  <p className="text-slate-400 text-sm mt-3 font-mono">in {history.length} moves</p>
                </>
              )}
              <div className="mt-6 flex flex-wrap gap-2 justify-center">
                <button onClick={resetGame} className="btn-primary" data-testid="play-again-btn">
                  Play again
                </button>
                <Link to="/lobby" className="btn-ghost">New setup</Link>
                {user && <Link to="/profile" className="btn-ghost inline-flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" />Stats</Link>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

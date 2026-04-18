// Encapsulates Cube3 game state, AI turns, auto-save, result-recording and replay-sharing.
// Extracted from Play.jsx to keep the page component thin.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkWinner, cloneBoard, emptyBoard, generateLines, isDraw } from "./logic";
import { pickAIMove } from "./ai";
import api from "../api";

const HUMAN_ID = 0;
const AI_ID = 1;
const AUTOSAVE_DELAY_MS = 600;
const AI_THINK_DELAY_MS = 400;

function deriveResult(board, lines, numPlayers) {
  const win = checkWinner(board, lines);
  if (win.winner !== null) return { winner: win.winner, line: win.line };
  if (isDraw(board, lines, numPlayers)) return { winner: null, line: null, draw: true };
  return null;
}

function applyMove(board, flat, player) {
  const next = cloneBoard(board);
  next[flat] = player;
  return next;
}

export function useGameState({
  N,
  mode,
  isAI,
  difficulty,
  numPlayers,
  user,
  resume,
  sound,
}) {
  const lines = useMemo(() => generateLines(N), [N]);

  const [board, setBoard]       = useState(() => emptyBoard(N));
  const [history, setHistory]   = useState([]);
  const [result, setResult]     = useState(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [copied, setCopied]     = useState(false);

  const startedAt   = useRef(Date.now());
  const recordedRef = useRef(false);
  const playClickRef = useRef(sound?.playClick);
  const playWinRef   = useRef(sound?.playWin);
  const playDrawRef  = useRef(sound?.playDraw);
  useEffect(() => { playClickRef.current = sound?.playClick; }, [sound?.playClick]);
  useEffect(() => { playWinRef.current   = sound?.playWin;   }, [sound?.playWin]);
  useEffect(() => { playDrawRef.current  = sound?.playDraw;  }, [sound?.playDraw]);

  const turn = history.length % numPlayers;

  // 1) Resume on first render if asked.
  useEffect(() => {
    if (!resume || !user) return;
    let cancelled = false;
    api.get("/games/saved").then(({ data }) => {
      if (cancelled || !data || data.board_size !== N || data.mode !== mode) return;
      const moves = data.moves || [];
      let b = emptyBoard(N);
      for (const m of moves) b = applyMove(b, m.flat, m.player);
      setBoard(b);
      setHistory(moves);
    }).catch((err) => {
      if (process.env.NODE_ENV !== "production") console.debug("[game] resume failed:", err?.message);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  // 2) Detect end of game whenever board changes.
  useEffect(() => {
    const r = deriveResult(board, lines, numPlayers);
    if (!r) return;
    setResult(r);
    if (r.draw)  playDrawRef.current?.();
    else         playWinRef.current?.();
  }, [board, lines, numPlayers]);

  // 3) AI move when it is the AI's turn.
  useEffect(() => {
    if (!isAI || result || turn !== AI_ID) return;
    setAiThinking(true);
    const t = setTimeout(() => {
      const move = pickAIMove(difficulty, board, lines, AI_ID, HUMAN_ID, N);
      if (move !== undefined && move !== null) {
        setBoard((prev) => (prev[move] === null ? applyMove(prev, move, AI_ID) : prev));
        setHistory((h) => [...h, { player: AI_ID, flat: move }]);
        playClickRef.current?.();
      }
      setAiThinking(false);
    }, AI_THINK_DELAY_MS);
    return () => { clearTimeout(t); setAiThinking(false); };
  }, [turn, isAI, result, board, lines, difficulty, N]);

  // 4) Auto-save for signed-in local games in progress.
  useEffect(() => {
    if (!user || isAI || result || history.length === 0) return;
    const t = setTimeout(() => {
      api.post("/games/saved", { board_size: N, mode, moves: history }).catch((err) => {
        if (process.env.NODE_ENV !== "production") console.debug("[game] autosave failed:", err?.message);
      });
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [history, user, isAI, result, N, mode]);

  // 5) Record final result + clear saved slot.
  useEffect(() => {
    if (!result || recordedRef.current || !user) return;
    recordedRef.current = true;
    let myResult;
    if (result.draw) myResult = "draw";
    else if (isAI)   myResult = result.winner === HUMAN_ID ? "win" : "loss";
    else             myResult = "win";
    api.post("/games/record", {
      board_size: N, mode, result: myResult,
      moves: history.length, duration_ms: Date.now() - startedAt.current,
    }).catch((err) => {
      if (process.env.NODE_ENV !== "production") console.debug("[game] record failed:", err?.message);
    });
    api.delete("/games/saved").catch(() => {});
  }, [result, user, isAI, N, mode, history.length]);

  const play = useCallback((flat) => {
    if (result || board[flat] !== null) return;
    const current = history.length % numPlayers;
    setBoard((prev) => (prev[flat] === null ? applyMove(prev, flat, current) : prev));
    setHistory((h) => [...h, { player: current, flat }]);
    playClickRef.current?.();
  }, [board, history.length, numPlayers, result]);

  const undo = useCallback(() => {
    if (isAI || result || history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setBoard((prev) => {
      if (!last) return prev;
      const next = prev.slice();
      next[last.flat] = null;
      return next;
    });
    playClickRef.current?.();
  }, [isAI, result, history]);

  const reset = useCallback(() => {
    setBoard(emptyBoard(N));
    setHistory([]);
    setResult(null);
    setShareUrl(null);
    setCopied(false);
    recordedRef.current = false;
    startedAt.current = Date.now();
    if (user) api.delete("/games/saved").catch(() => {});
  }, [N, user]);

  const shareReplay = useCallback(async () => {
    try {
      const payload = {
        board_size: N, mode, moves: history,
        winner: result?.winner ?? null,
        result: result?.draw ? "draw" : (isAI ? (result?.winner === HUMAN_ID ? "win" : "loss") : "win"),
        player_name: user?.name || "Guest",
      };
      const { data } = await api.post("/replays", payload);
      const url = `${window.location.origin}/replay/${data.replay_id}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (clipErr) {
        if (process.env.NODE_ENV !== "production") console.debug("[share] clipboard blocked:", clipErr?.message);
      }
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.error("[share] create-replay failed:", err);
    }
  }, [N, mode, history, result, isAI, user]);

  return {
    board, history, turn, result, aiThinking,
    shareUrl, copied,
    play, undo, reset, shareReplay,
    setCopied, setShareUrl,
  };
}

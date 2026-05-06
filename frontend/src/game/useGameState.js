// Cube3 game-state orchestrator hook.
// Composes lifecycle (board/history/turn/result/AI) with persistence side-effects.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkWinner, cloneBoard, emptyBoard, generateLines, isDraw } from "./logic";
import { pickAIMove } from "./ai";
import api from "../api";
import { useAutoSave, useGameRecorder, useResume, useShareReplay } from "./persistenceHooks";

const HUMAN_ID = 0;
const AI_ID    = 1;
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

function useSoundRefs(sound) {
  const click = useRef(sound?.playClick);
  const win   = useRef(sound?.playWin);
  const draw  = useRef(sound?.playDraw);
  useEffect(() => { click.current = sound?.playClick; }, [sound?.playClick]);
  useEffect(() => { win.current   = sound?.playWin;   }, [sound?.playWin]);
  useEffect(() => { draw.current  = sound?.playDraw;  }, [sound?.playDraw]);
  return { click, win, draw };
}

export function useGameState({ N, mode, isAI, difficulty, numPlayers, user, resume, sound }) {
  const lines = useMemo(() => generateLines(N), [N]);
  const [board, setBoard]           = useState(() => emptyBoard(N));
  const [history, setHistory]       = useState([]);
  const [result, setResult]         = useState(null);
  const [aiThinking, setAiThinking] = useState(false);

  const startedAtRef = useRef(Date.now());
  const sounds = useSoundRefs(sound);
  const turn = history.length % numPlayers;

  // 1) Resume saved game on mount.
  useResume({ enabled: !!resume && !!user, N, mode, setBoard, setHistory });

  // 2) End-of-game detection.
  useEffect(() => {
    const r = deriveResult(board, lines, numPlayers);
    if (!r) return;
    setResult(r);
    if (r.draw) sounds.draw.current?.();
    else        sounds.win.current?.();
  }, [board, lines, numPlayers, sounds.draw, sounds.win]);

  // 3) AI turn.
  useEffect(() => {
    if (!isAI || result || turn !== AI_ID) return;
    setAiThinking(true);
    const t = setTimeout(() => {
      const move = pickAIMove(difficulty, board, lines, AI_ID, HUMAN_ID, N);
      if (move !== undefined && move !== null) {
        setBoard((prev) => (prev[move] === null ? applyMove(prev, move, AI_ID) : prev));
        setHistory((h) => [...h, { player: AI_ID, flat: move }]);
        sounds.click.current?.();
      }
      setAiThinking(false);
    }, AI_THINK_DELAY_MS);
    return () => { clearTimeout(t); setAiThinking(false); };
  }, [turn, isAI, result, board, lines, difficulty, N, sounds.click]);

  // 4) Persistence side-effects (autosave + record on finish + share replay).
  useAutoSave({ user, isAI, result, N, mode, history });
  const { recordedRef } = useGameRecorder({ user, isAI, result, N, mode, history, startedAtRef });
  const share = useShareReplay({ N, mode, isAI, history, result, user });

  // 5) Player actions.
  const play = useCallback((flat) => {
    if (result || board[flat] !== null) return;
    const current = history.length % numPlayers;
    setBoard((prev) => (prev[flat] === null ? applyMove(prev, flat, current) : prev));
    setHistory((h) => [...h, { player: current, flat }]);
    sounds.click.current?.();
  }, [board, history.length, numPlayers, result, sounds.click]);

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
    sounds.click.current?.();
  }, [isAI, result, history, sounds.click]);

  const reset = useCallback(() => {
    setBoard(emptyBoard(N));
    setHistory([]);
    setResult(null);
    share.setShareUrl(null);
    share.setCopied(false);
    recordedRef.current = false;
    startedAtRef.current = Date.now();
    if (user) api.delete("/games/saved").catch(() => {});
  }, [N, user, share, recordedRef]);

  return {
    board, history, turn, result, aiThinking,
    shareUrl: share.shareUrl,
    copied:   share.copied,
    setCopied: share.setCopied,
    setShareUrl: share.setShareUrl,
    shared:   share.shared,
    play, undo, reset,
    shareReplay: share.shareReplay,
  };
}

// Encapsulates replay fetching + auto-play timing.
// Extracted from Replay.jsx to mirror useGameState's pattern.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../api";
import { checkWinner, emptyBoard, generateLines } from "./logic";

const DEFAULT_SPEED_MS = 700;

export function useReplayState({ id, onLoadError }) {
  const [replay, setReplay]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep]       = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed]     = useState(DEFAULT_SPEED_MS);
  const timerRef = useRef(null);

  // Fetch replay once.
  useEffect(() => {
    let cancelled = false;
    api.get(`/replays/${id}`)
      .then(({ data }) => { if (!cancelled) setReplay(data); })
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") console.debug("[replay] fetch failed:", err?.message);
        if (!cancelled) onLoadError?.(err);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, onLoadError]);

  const N     = replay?.board_size || 3;
  const moves = useMemo(() => replay?.moves || [], [replay]);
  const lines = useMemo(() => generateLines(N), [N]);

  const board = useMemo(() => {
    const b = emptyBoard(N);
    for (let i = 0; i < step; i++) {
      const m = moves[i];
      if (m) b[m.flat] = m.player;
    }
    return b;
  }, [N, step, moves]);

  const winInfo = useMemo(() => checkWinner(board, lines), [board, lines]);
  const isFinal = step >= moves.length;

  // Auto-advance tick.
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!playing || !replay) return;
    if (step >= moves.length) { setPlaying(false); return; }
    timerRef.current = setTimeout(() => setStep((s) => s + 1), speed);
    return () => clearTimeout(timerRef.current);
  }, [step, playing, speed, replay, moves.length]);

  const togglePlay = useCallback(() => {
    if (isFinal) setStep(0);
    setPlaying((p) => !p);
  }, [isFinal]);

  const rewind    = useCallback(() => { setStep(0); setPlaying(false); }, []);
  const skipToEnd = useCallback(() => setStep(moves.length), [moves.length]);

  return {
    replay, loading, step, moves, N, board, winInfo,
    playing, speed, isFinal,
    setSpeed, togglePlay, rewind, skipToEnd,
  };
}

// Side-effect hooks for game-state persistence (resume, autosave, finish-record, replay-share).
// Extracted from useGameState.js to reduce that hook's complexity.
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api";
import { emptyBoard } from "./logic";

const AUTOSAVE_DELAY_MS = 600;
const HUMAN_ID = 0;

const debug = (...a) => {
  if (process.env.NODE_ENV !== "production") console.debug(...a);
};

function rebuildBoard(N, moves) {
  const b = emptyBoard(N);
  for (const m of (moves || [])) b[m.flat] = m.player;
  return b;
}

/** Loads a saved game once on mount and pushes its state into setBoard/setHistory. */
export function useResume({ enabled, N, mode, setBoard, setHistory }) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api.get("/games/saved").then(({ data }) => {
      if (cancelled || !data || data.board_size !== N || data.mode !== mode) return;
      const moves = data.moves || [];
      setBoard(rebuildBoard(N, moves));
      setHistory(moves);
    }).catch((err) => debug("[game] resume failed:", err?.message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);
}

/** Auto-saves the in-progress game (signed-in local games only) ~600ms after each move. */
export function useAutoSave({ user, isAI, result, N, mode, history }) {
  useEffect(() => {
    if (!user || isAI || result || history.length === 0) return;
    const t = setTimeout(() => {
      api.post("/games/saved", { board_size: N, mode, moves: history })
        .catch((err) => debug("[game] autosave failed:", err?.message));
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [history, user, isAI, result, N, mode]);
}

/** Records the finished game and clears the saved slot. Idempotent via internal ref. */
export function useGameRecorder({ user, isAI, result, N, mode, history, startedAtRef }) {
  const recordedRef = useRef(false);

  useEffect(() => {
    if (!result || recordedRef.current || !user) return;
    recordedRef.current = true;

    let myResult;
    if (result.draw)    myResult = "draw";
    else if (isAI)      myResult = result.winner === HUMAN_ID ? "win" : "loss";
    else                myResult = "win";

    api.post("/games/record", {
      board_size: N,
      mode,
      result: myResult,
      moves: history.length,
      duration_ms: Date.now() - startedAtRef.current,
    }).catch((err) => debug("[game] record failed:", err?.message));
    api.delete("/games/saved").catch(() => {});
  }, [result, user, isAI, N, mode, history.length, startedAtRef]);

  return { recordedRef };
}

/** Owns the share-replay flow + clipboard copy state. */
export function useShareReplay({ N, mode, isAI, history, result, user }) {
  const [shareUrl, setShareUrl] = useState(null);
  const [copied, setCopied]     = useState(false);

  const computeOutcome = () => {
    if (result?.draw) return "draw";
    if (isAI)         return result?.winner === HUMAN_ID ? "win" : "loss";
    return "win";
  };

  const shareReplay = useCallback(async () => {
    try {
      const payload = {
        board_size: N, mode, moves: history,
        winner: result?.winner ?? null,
        result: computeOutcome(),
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
        debug("[share] clipboard blocked:", clipErr?.message);
      }
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.error("[share] create-replay failed:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- computeOutcome is intentionally stable
  }, [N, mode, history, result, isAI, user]);

  return { shareUrl, copied, setCopied, setShareUrl, shareReplay };
}

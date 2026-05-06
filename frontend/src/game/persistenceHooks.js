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

/** Pre-seeds a starting opening (e.g., today's Daily challenge). One-shot, mount-only. */
export function usePresetOpening({ presetMoves, N, setBoard, setHistory }) {
  useEffect(() => {
    if (!presetMoves || presetMoves.length === 0) return;
    setBoard(rebuildBoard(N, presetMoves));
    setHistory(presetMoves);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only intentional
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

/** Owns the share-replay flow: native OS share sheet on mobile/PWA, clipboard fallback elsewhere. */
export function useShareReplay({ N, mode, isAI, history, result, user }) {
  const [shareUrl, setShareUrl] = useState(null);
  const [copied, setCopied]     = useState(false);
  const [shared, setShared]     = useState(false);

  const computeOutcome = () => {
    if (result?.draw) return "draw";
    if (isAI)         return result?.winner === HUMAN_ID ? "win" : "loss";
    return "win";
  };

  // Build a punchy share message tailored to the outcome. Pure presentation,
  // no PII (replay URL contains a non-guessable 10-char id only).
  const buildShareText = (outcome) => {
    const dim = `${N}×${N}×${N}`;
    if (outcome === "draw") return `Drew a ${dim} 3D Tic-Tac-Toe match in ${history.length} moves. Watch the replay 👇`;
    if (outcome === "loss") return `Lost a tense ${dim} 3D Tic-Tac-Toe match. Think you can do better? 👇`;
    return `Just won a ${dim} 3D Tic-Tac-Toe match in ${history.length} moves! 🎯`;
  };

  const shareReplay = useCallback(async () => {
    try {
      const outcome = computeOutcome();
      const payload = {
        board_size: N, mode, moves: history,
        winner: result?.winner ?? null,
        result: outcome,
        player_name: user?.name || "Guest",
      };
      const { data } = await api.post("/replays", payload);
      // Use the backend share-landing URL so social-media crawlers (Twitter, FB, WhatsApp,
      // Discord, Slack) get OG/Twitter meta tags + the SVG card. Humans get a 0s redirect
      // to the SPA replay route via <meta http-equiv="refresh">.
      const url = `${process.env.REACT_APP_BACKEND_URL}/api/share/${data.replay_id}`;
      setShareUrl(url);

      const shareData = {
        title: "Cube3 — 3D Tic-Tac-Toe",
        text:  buildShareText(outcome),
        url,
      };

      // Prefer the OS share sheet (Android Chrome, iOS Safari, installed PWAs).
      // canShare() guards against desktop browsers that expose share() but reject some payloads.
      if (typeof navigator !== "undefined"
          && navigator.share
          && (typeof navigator.canShare !== "function" || navigator.canShare(shareData))) {
        try {
          await navigator.share(shareData);
          setShared(true);
          setTimeout(() => setShared(false), 2200);
          return;
        } catch (shareErr) {
          // AbortError = user dismissed picker — silent. Other errors fall through to clipboard.
          if (shareErr?.name === "AbortError") return;
          debug("[share] native share failed, falling back to clipboard:", shareErr?.message);
        }
      }

      // Clipboard fallback (desktop, or browsers without Web Share API).
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

  return { shareUrl, copied, setCopied, setShareUrl, shared, shareReplay };
}

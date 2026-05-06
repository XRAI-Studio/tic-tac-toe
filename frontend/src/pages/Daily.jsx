import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Calendar, Trophy, Target, Crown, Medal, Share2, Check } from "lucide-react";
import api from "../api";
import { useAuth } from "../contexts/AuthContext";
import { PLAYER_COLORS } from "../game/logic";

const PLAYER_NAMES = ["Blue", "Red", "Green"];

/** Wordle-style scoring badge: ⭐⭐⭐ for "well under par", ⭐⭐ for ≤par, ⭐ for over par. */
function starsForScore(moves, par) {
  if (moves <= par - 2) return "⭐⭐⭐";
  if (moves <= par)     return "⭐⭐";
  return "⭐";
}

/** Map a player id (0/1/2) to its Wordle-emoji square; null cells are dark. */
function emojiCell(value) {
  if (value === 0) return "🟦";
  if (value === 1) return "🟥";
  if (value === 2) return "🟩";
  return "⬛";
}

/** Builds a Wordle-style emoji result string for sharing.
 *  Score line + a 3×3 grid summary of the board's center level (most representative). */
function buildEmojiResult({ dayNumber, moves, won, par, board }) {
  const verdict = won ? `${moves}/${par}` : "X/9";
  const stars = won ? starsForScore(moves, par) : "";
  const lines = [`Cube3 #${dayNumber} — ${verdict} ${stars}`.trimEnd()];

  // Render the middle level (L2) as a 3-line emoji grid (most central / informative).
  const N = 3;
  const midOffset = N * N; // L2 starts at index 9 in flat 0..26
  for (let r = 0; r < N; r++) {
    let row = "";
    for (let c = 0; c < N; c++) row += emojiCell(board[midOffset + r * N + c]);
    lines.push(row);
  }
  lines.push(`https://spatial-marks.preview.emergentagent.com/daily`);
  return lines.join("\n");
}

function StatPill({ label, value, accent }) {
  return (
    <div className="glass rounded-lg px-4 py-3 min-w-[100px]">
      <div className="text-[9px] uppercase tracking-[0.3em] text-slate-400">{label}</div>
      <div className={`mt-1 font-hud text-2xl ${accent ? "text-[#2B4FFF] glow-text" : "text-white"}`}>{value}</div>
    </div>
  );
}

/** Share-button label: shows the most recent positive feedback, otherwise the call-to-action. */
function renderShareLabel(shared, copied) {
  if (shared) return <><Check className="w-4 h-4" /> Shared!</>;
  if (copied) return <><Check className="w-4 h-4" /> Copied!</>;
  return <><Share2 className="w-4 h-4" /> Share result</>;
}

export default function Daily() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [config, setConfig]         = useState(null);
  const [myResult, setMyResult]     = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [shared, setShared]         = useState(false);
  const [copied, setCopied]         = useState(false);

  useEffect(() => {
    api.get("/daily/today").then(({ data }) => setConfig(data)).catch(() => {});
    api.get("/daily/leaderboard").then(({ data }) => setLeaderboard(data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) { setMyResult(null); return; }
    api.get("/daily/me").then(({ data }) => setMyResult(data)).catch(() => {});
  }, [user]);

  const startDaily = () => navigate("/play?daily=1");

  const shareResult = async () => {
    if (!myResult || !config) return;
    // Reconstruct final board from the moves we'd need to reload from the result; for
    // simplicity we just share the score line — the emoji grid mode is the win-state below.
    const text = buildEmojiResult({
      dayNumber: config.day_number,
      moves: myResult.moves,
      won: myResult.won,
      par: config.par,
      board: myResult.final_board || Array(27).fill(null),
    });
    const shareData = { title: "Cube3 Daily", text, url: `${window.location.origin}/daily` };
    if (typeof navigator !== "undefined" && navigator.share
        && (typeof navigator.canShare !== "function" || navigator.canShare(shareData))) {
      try {
        await navigator.share(shareData);
        setShared(true);
        setTimeout(() => setShared(false), 2200);
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.debug("[daily] clipboard blocked:", err?.message);
    }
  };

  if (!config) return <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center text-slate-500 font-mono">Loading today's cube…</div>;

  const myRank = myResult ? leaderboard.findIndex((r) => r.user_id === myResult.user_id) + 1 : 0;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] scanline" data-testid="daily-page">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="text-[#2B4FFF] text-xs uppercase tracking-[0.4em] font-heading mb-2 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" /> Today's Challenge
          </div>
          <h1 className="font-heading font-black uppercase tracking-tighter text-4xl sm:text-5xl lg:text-6xl text-white glow-text-lg">
            Cube3 <span className="text-[#2B4FFF]">#{config.day_number}</span>
          </h1>
          <p className="text-slate-400 mt-3 max-w-2xl font-mono text-sm">
            One puzzle. One attempt per day. Solve a 3×3×3 board against Hard AI from the same opening as everyone else. Lower move count wins.
          </p>
        </motion.div>

        {/* Status / CTA */}
        <div className="mt-8 flex flex-wrap items-center gap-3" data-testid="daily-cta-row">
          {!myResult && (
            <button onClick={startDaily} className="btn-primary pulse-glow" data-testid="daily-start-btn">
              <Target className="inline w-4 h-4 mr-2" /> Play today's cube
            </button>
          )}
          {myResult && (
            <>
              <div className="glass rounded-lg px-4 py-3 flex items-center gap-3" data-testid="my-result">
                {myResult.won
                  ? <Trophy className="w-5 h-5 text-[#FFD700]" />
                  : <span className="font-hud text-[#FF1744] text-xl">✗</span>}
                <div>
                  <div className="font-heading uppercase text-xs tracking-wider text-white">
                    {myResult.won ? `Solved in ${myResult.moves} moves` : "Did not solve"}
                  </div>
                  <div className="font-mono text-[10px] text-slate-400">
                    {myRank > 0 ? `#${myRank} on today's board` : "Result recorded"}
                  </div>
                </div>
              </div>
              <button onClick={shareResult} className="btn-ghost inline-flex items-center gap-2" data-testid="daily-share-btn">
                {renderShareLabel(shared, copied)}
              </button>
            </>
          )}
          <div className="flex gap-2 ml-auto">
            <StatPill label="Par" value={config.par} accent />
            <StatPill label="Players" value={leaderboard.length} />
          </div>
        </div>

        {/* Leaderboard */}
        <div className="mt-10">
          <div className="font-heading uppercase tracking-[0.3em] text-xs text-[#2B4FFF] mb-3">Today's leaderboard</div>
          <div className="glass rounded-lg overflow-hidden" data-testid="daily-leaderboard">
            <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[#2B4FFF]/15 text-[10px] uppercase tracking-[0.2em] text-[#2B4FFF]">
              <div className="col-span-1">#</div>
              <div className="col-span-7">Player</div>
              <div className="col-span-2 text-right">Moves</div>
              <div className="col-span-2 text-right">Result</div>
            </div>
            {leaderboard.length === 0 && (
              <div className="p-8 text-center font-mono text-sm text-slate-500">No solves yet today. Be first.</div>
            )}
            {leaderboard.map((r, i) => (
              <div key={r.user_id} className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[#2B4FFF]/10 items-center" data-testid={`daily-row-${i}`}>
                <div className="col-span-1 flex items-center">
                  {i === 0 && <Crown className="w-5 h-5 text-yellow-300" />}
                  {i === 1 && <Medal className="w-5 h-5 text-slate-300" />}
                  {i === 2 && <Medal className="w-5 h-5 text-amber-500" />}
                  {i > 2 && <span className="font-hud text-slate-400">{i + 1}</span>}
                </div>
                <div className="col-span-7 flex items-center gap-3 min-w-0">
                  {r.user_picture ? (
                    <img src={r.user_picture} alt="" className="w-8 h-8 rounded-full border border-[#2B4FFF]/30 flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#2B4FFF]/10 border border-[#2B4FFF]/30 flex items-center justify-center font-hud text-[#2B4FFF] flex-shrink-0">
                      {r.user_name?.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-heading uppercase tracking-wider text-white text-sm truncate">{r.user_name}</div>
                  </div>
                </div>
                <div className="col-span-2 text-right font-hud text-white">{r.moves}</div>
                <div className="col-span-2 text-right font-hud text-sm">
                  {r.won ? <span className="text-[#00E676]">SOLVED</span> : <span className="text-[#FF1744]">DNF</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link to="/lobby" className="btn-ghost">Or play a free match →</Link>
        </div>
      </div>
    </div>
  );
}

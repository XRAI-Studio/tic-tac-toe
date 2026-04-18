import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { motion } from "framer-motion";
import { Trophy, Medal, Crown } from "lucide-react";

const MODES = [
  { v: "all", label: "All" },
  { v: "ai", label: "vs AI" },
  { v: "local", label: "Local" },
];
const PERIODS = [
  { v: "all", label: "All time" },
  { v: "monthly", label: "Monthly" },
  { v: "weekly", label: "Weekly" },
];
const SIZES = [
  { v: 0, label: "Any" },
  { v: 3, label: "3×3×3" },
  { v: 4, label: "4×4×4" },
];

export default function Leaderboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [size, setSize] = useState(0);
  const [mode, setMode] = useState("all");
  const [period, setPeriod] = useState("all");

  useEffect(() => {
    const q = new URLSearchParams();
    if (size) q.set("board_size", String(size));
    if (mode !== "all") q.set("mode", mode);
    q.set("period", period);
    setLoading(true);
    api.get(`/leaderboard?${q.toString()}`)
      .then(({ data }) => setRows(data))
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") console.debug("[leaderboard] fetch failed:", err?.message);
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [size, mode, period]);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] scanline">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-[#2B4FFF] text-xs uppercase tracking-[0.4em] font-heading mb-2">Global Rankings</div>
          <h1 className="font-heading font-black uppercase tracking-tighter text-4xl sm:text-5xl lg:text-6xl text-white glow-text-lg">
            Leader<span className="text-[#2B4FFF]">board</span>
          </h1>
        </motion.div>

        <div className="mt-8 grid md:grid-cols-3 gap-3">
          <Filter label="Size" options={SIZES} value={size} onChange={setSize} testid="filter-size" />
          <Filter label="Mode" options={MODES} value={mode} onChange={setMode} testid="filter-mode" />
          <Filter label="Period" options={PERIODS} value={period} onChange={setPeriod} testid="filter-period" />
        </div>

        <div className="mt-8 glass rounded-lg overflow-hidden" data-testid="leaderboard-table">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[#2B4FFF]/15 text-[10px] uppercase tracking-[0.2em] text-[#2B4FFF]">
            <div className="col-span-1">#</div>
            <div className="col-span-5">Player</div>
            <div className="col-span-2 text-right">Wins</div>
            <div className="col-span-2 text-right">Win Rate</div>
            <div className="col-span-2 text-right">Score</div>
          </div>
          {loading && <div className="p-8 text-center text-slate-500 font-mono text-sm">Loading…</div>}
          {!loading && rows.length === 0 && (
            <div className="p-10 text-center">
              <div className="text-slate-400 font-mono text-sm">No games yet. Be the first to claim a spot.</div>
              <Link to="/lobby" className="btn-primary mt-4 inline-block">Play now →</Link>
            </div>
          )}
          {!loading && rows.map((r, i) => (
            <motion.div
              key={r.user_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[#2B4FFF]/10 hover:bg-[#2B4FFF]/5 transition items-center"
              data-testid={`lb-row-${i}`}
            >
              <div className="col-span-1 flex items-center">
                {i === 0 && <Crown className="w-5 h-5 text-yellow-300" />}
                {i === 1 && <Medal className="w-5 h-5 text-slate-300" />}
                {i === 2 && <Medal className="w-5 h-5 text-amber-500" />}
                {i > 2 && <span className="font-hud text-slate-400">{i + 1}</span>}
              </div>
              <div className="col-span-5 flex items-center gap-3">
                {r.picture ? (
                  <img src={r.picture} alt="" className="w-9 h-9 rounded-full object-cover border border-[#2B4FFF]/30" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#2B4FFF]/10 border border-[#2B4FFF]/30 flex items-center justify-center font-hud text-[#2B4FFF]">
                    {r.name?.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-heading uppercase tracking-wider text-white text-sm">{r.name}</div>
                  <div className="font-mono text-[10px] text-slate-500">{r.games_played} games</div>
                </div>
              </div>
              <div className="col-span-2 text-right font-hud text-white">{r.wins}</div>
              <div className="col-span-2 text-right font-hud text-[#2B4FFF]">{r.win_rate}%</div>
              <div className="col-span-2 text-right font-hud text-white">{r.score}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Filter({ label, options, value, onChange, testid }) {
  return (
    <div className="glass rounded-lg p-3" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-[0.3em] text-slate-400 mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value === o.v;
          return (
            <button
              key={o.v}
              onClick={() => onChange(o.v)}
              className={`px-3 py-1 rounded text-[11px] uppercase tracking-wider font-heading transition-all ${
                active ? "bg-[#2B4FFF]/15 text-[#2B4FFF] border border-[#2B4FFF]/60" : "text-slate-300 border border-[#2B4FFF]/15 hover:border-[#2B4FFF]/40"
              }`}
              data-testid={`${testid}-${o.v}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import { useAuth } from "../contexts/AuthContext";
import { motion } from "framer-motion";
import { Trophy, Target, TrendingUp, Award, Bot, Users } from "lucide-react";

function StatCard({ label, value, accent = false, testid }) {
  return (
    <div className="glass rounded-lg p-5" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-[0.3em] text-slate-400">{label}</div>
      <div className={`mt-2 font-hud text-3xl ${accent ? "text-[#00F0FF] glow-text" : "text-white"}`}>{value}</div>
    </div>
  );
}

export default function Profile() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/"); return; }
    api.get(`/users/stats/${user.user_id}`).then(({ data }) => setStats(data)).catch(() => {});
    api.get(`/games/history/${user.user_id}`).then(({ data }) => setHistory(data)).catch(() => {});
  }, [user, loading, navigate]);

  if (loading || !user) return null;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] scanline">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-5">
          {user.picture ? (
            <img src={user.picture} alt="" className="w-20 h-20 rounded-full border-2 border-[#00F0FF]/50 glow-box" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-[#00F0FF]/10 border-2 border-[#00F0FF]/50 flex items-center justify-center font-hud text-3xl text-[#00F0FF] glow-text">
              {user.name?.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-[#00F0FF] text-xs uppercase tracking-[0.4em] font-heading">Pilot</div>
            <h1 className="font-heading font-black uppercase tracking-tighter text-4xl sm:text-5xl text-white glow-text">
              {user.name}
            </h1>
            <div className="font-mono text-xs text-slate-400 mt-1">{user.email}</div>
          </div>
        </motion.div>

        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="profile-stats-grid">
          <StatCard label="Games" value={stats?.games_played ?? 0} testid="stat-games" />
          <StatCard label="Wins" value={stats?.wins ?? 0} accent testid="stat-wins" />
          <StatCard label="Win Rate" value={`${stats?.win_rate ?? 0}%`} accent testid="stat-winrate" />
          <StatCard label="Draws" value={stats?.draws ?? 0} testid="stat-draws" />
        </div>

        <div className="mt-10 grid md:grid-cols-2 gap-6">
          <section className="glass rounded-lg p-5">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#00F0FF] mb-3">By board size</div>
            <div className="space-y-2">
              {["3", "4"].map((b) => {
                const s = stats?.by_board?.[b] || { games: 0, wins: 0, losses: 0, draws: 0 };
                const wr = s.games ? Math.round((s.wins / s.games) * 100) : 0;
                return (
                  <div key={b} className="flex items-center gap-3" data-testid={`byboard-${b}`}>
                    <div className="w-16 font-heading uppercase text-xs tracking-wider text-white">{b}×{b}×{b}</div>
                    <div className="flex-1 h-2 rounded-full bg-[#0A0D14] overflow-hidden border border-[#00F0FF]/10">
                      <div className="h-full bg-[#00F0FF]" style={{ width: `${wr}%`, boxShadow: "0 0 12px #00F0FF" }} />
                    </div>
                    <div className="font-hud text-sm text-[#00F0FF] w-24 text-right">{s.games} · {wr}%</div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="glass rounded-lg p-5">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#00F0FF] mb-3">By mode</div>
            <div className="space-y-2">
              {["ai_easy", "ai_medium", "ai_hard", "local_2p", "local_3p"].map((m) => {
                const s = stats?.by_mode?.[m] || { games: 0, wins: 0, losses: 0, draws: 0 };
                const wr = s.games ? Math.round((s.wins / s.games) * 100) : 0;
                return (
                  <div key={m} className="flex items-center gap-3" data-testid={`bymode-${m}`}>
                    <div className="w-28 font-heading uppercase text-xs tracking-wider text-white">{m.replace("_", " ")}</div>
                    <div className="flex-1 h-2 rounded-full bg-[#0A0D14] overflow-hidden border border-[#00F0FF]/10">
                      <div className="h-full bg-[#00F0FF]" style={{ width: `${wr}%`, boxShadow: "0 0 12px #00F0FF" }} />
                    </div>
                    <div className="font-hud text-sm text-[#00F0FF] w-24 text-right">{s.games} · {wr}%</div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <section className="mt-10">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#00F0FF] mb-3">Recent games</div>
          <div className="glass rounded-lg overflow-hidden" data-testid="recent-games">
            {history.length === 0 && (
              <div className="p-8 text-center">
                <div className="font-mono text-sm text-slate-400">No games yet.</div>
                <Link to="/lobby" className="btn-primary mt-4 inline-block">Start playing</Link>
              </div>
            )}
            {history.map((g, i) => (
              <div key={g.game_id} className="grid grid-cols-12 px-4 py-3 border-b border-[#00F0FF]/10 items-center" data-testid={`recent-${i}`}>
                <div className="col-span-2 font-heading uppercase text-xs text-white tracking-wider">{g.board_size}×{g.board_size}×{g.board_size}</div>
                <div className="col-span-4 font-mono text-xs text-slate-400">{g.mode.replace("_", " ")}</div>
                <div className="col-span-3 font-hud text-sm">
                  {g.result === "win" && <span className="text-[#00FF66]">WIN</span>}
                  {g.result === "loss" && <span className="text-[#FF5500]">LOSS</span>}
                  {g.result === "draw" && <span className="text-slate-300">DRAW</span>}
                </div>
                <div className="col-span-3 text-right font-mono text-[11px] text-slate-500">{g.moves} moves</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

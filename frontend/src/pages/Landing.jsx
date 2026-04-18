import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import { Cuboid, Bot, Users, Trophy, Sparkles, ArrowRight } from "lucide-react";

export default function Landing() {
  const { user } = useAuth();

  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/lobby";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden scanline">
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 20% 10%, rgba(0,240,255,0.22) 0%, transparent 45%), radial-gradient(ellipse at 80% 90%, rgba(0,122,255,0.2) 0%, transparent 50%)",
        }}
      />
      <div className="relative max-w-7xl mx-auto px-6 pt-16 pb-24">
        <div className="grid md:grid-cols-12 gap-10 items-start">
          <div className="md:col-span-7">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="text-[#00F0FF] text-xs tracking-[0.4em] uppercase font-heading mb-4"
              data-testid="landing-kicker"
            >
              — 3D Strategy / Arcade
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.05 }}
              className="font-heading font-black uppercase tracking-tighter text-white text-5xl sm:text-6xl lg:text-7xl leading-[0.95] glow-text-lg"
              data-testid="landing-title"
            >
              Tic-Tac-Toe,<br />
              <span className="text-[#00F0FF]">rebuilt in 3D.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="mt-7 text-slate-300 max-w-xl text-base sm:text-lg leading-relaxed"
            >
              A luminous cube of cells. 49 winning lines on the classic board, 76 on the extended.
              Play against friends, or face off with an AI that thinks in three dimensions.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35 }}
              className="mt-10 flex flex-wrap gap-3"
            >
              <Link to="/lobby" className="btn-primary inline-flex items-center gap-2" data-testid="landing-play-btn">
                Play now <ArrowRight className="w-4 h-4" />
              </Link>
              {!user && (
                <button onClick={handleLogin} className="btn-ghost inline-flex items-center gap-2" data-testid="landing-signin-btn">
                  Sign in to track stats
                </button>
              )}
              <Link to="/leaderboard" className="btn-ghost inline-flex items-center gap-2" data-testid="landing-leaderboard-btn">
                <Trophy className="w-3.5 h-3.5" /> Leaderboard
              </Link>
            </motion.div>

            <div className="mt-14 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { k: "27", v: "Classic cells" },
                { k: "64", v: "Extended cells" },
                { k: "49", v: "Winning lines" },
                { k: "3", v: "AI difficulties" },
              ].map((s) => (
                <div key={s.v} className="glass rounded p-4">
                  <div className="font-hud text-3xl text-[#00F0FF] glow-text" data-testid={`stat-${s.v.replace(/\s/g,'-').toLowerCase()}`}>{s.k}</div>
                  <div className="text-[10px] tracking-[0.25em] uppercase text-slate-400 mt-2">{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="md:col-span-5">
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, delay: 0.15 }}
              className="relative float-y"
            >
              <div className="glass rounded-xl p-6 glow-box">
                <div className="flex items-center justify-between mb-4">
                  <div className="font-heading uppercase text-xs tracking-[0.3em] text-[#00F0FF]">Quickstart</div>
                  <Sparkles className="w-4 h-4 text-[#00F0FF]" />
                </div>
                <div className="space-y-3">
                  <QuickLink to="/lobby?mode=ai_hard&size=3" icon={<Bot />} title="Face the AI" desc="Hard · 3×3×3" testid="qs-ai" />
                  <QuickLink to="/lobby?mode=local_2p&size=3" icon={<Users />} title="Pass-and-play" desc="2 players · 3×3×3" testid="qs-2p" />
                  <QuickLink to="/lobby?mode=local_3p&size=4" icon={<Users />} title="3-Player chaos" desc="Extended · 4×4×4" testid="qs-3p" />
                </div>
              </div>
              <div className="absolute -inset-6 -z-10 rounded-xl pointer-events-none" style={{ background: "radial-gradient(circle, rgba(0,240,255,0.15), transparent 70%)" }} />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ to, icon, title, desc, testid }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3 rounded border border-[#00F0FF]/15 hover:border-[#00F0FF]/60 hover:bg-[#00F0FF]/5 transition-all group" data-testid={testid}>
      <div className="w-9 h-9 rounded border border-[#00F0FF]/30 text-[#00F0FF] flex items-center justify-center group-hover:bg-[#00F0FF]/10 transition">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm text-white font-heading font-semibold uppercase tracking-wider">{title}</div>
        <div className="text-xs text-slate-400 font-mono">{desc}</div>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-[#00F0FF] transition" />
    </Link>
  );
}

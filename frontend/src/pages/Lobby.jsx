import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bot, Users, Cuboid, Zap, Flame, Sparkles, Play as PlayIcon, X as XIcon } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import api from "../api";

export default function Lobby() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [size, setSize] = useState(parseInt(params.get("size") || "3", 10));
  const [mode, setMode] = useState(params.get("mode") || "ai_medium");
  const { user } = useAuth();
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    if (!user) { setSaved(null); return; }
    api.get("/games/saved")
      .then(({ data }) => setSaved(data))
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") console.debug("[lobby] saved-game fetch failed:", err?.message);
        setSaved(null);
      });
  }, [user]);

  const start = () => navigate(`/play?size=${size}&mode=${mode}`);
  const resume = () => {
    if (!saved) return;
    navigate(`/play?size=${saved.board_size}&mode=${saved.mode}&resume=1`);
  };
  const discardSaved = async () => {
    await api.delete("/games/saved").catch(() => {});
    setSaved(null);
  };

  const sizes = [
    { v: 3, label: "Classic", sub: "3×3×3 · 27 cells · 49 lines", icon: <Cuboid className="w-6 h-6" /> },
    { v: 4, label: "Extended", sub: "4×4×4 · 64 cells · 76 lines", icon: <Zap className="w-6 h-6" /> },
  ];

  const modes = [
    { v: "ai_easy",   label: "AI · Easy",    desc: "Random with a spark of logic", icon: <Bot className="w-5 h-5" /> },
    { v: "ai_medium", label: "AI · Medium",  desc: "Reads threats, claims center",  icon: <Bot className="w-5 h-5" /> },
    { v: "ai_hard",   label: "AI · Hard",    desc: "Deep alpha-beta · plans moves", icon: <Flame className="w-5 h-5" /> },
    { v: "local_2p",  label: "Local · 2P",   desc: "Blue ╳ vs Red ⚫",           icon: <Users className="w-5 h-5" /> },
    { v: "local_3p",  label: "Local · 3P",   desc: "Blue ╳ · Red ⚫ · Green ▲",   icon: <Users className="w-5 h-5" /> },
  ];

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] scanline">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="text-[#2B4FFF] text-xs uppercase tracking-[0.4em] font-heading mb-2">New Game</div>
          <h1 className="font-heading font-black uppercase tracking-tighter text-4xl sm:text-5xl lg:text-6xl text-white glow-text-lg">
            Configure your <span className="text-[#2B4FFF]">cube</span>
          </h1>
          <p className="text-slate-400 mt-3 max-w-2xl">Pick a board size and opponent. Matches are saved to your profile when signed in.</p>
        </motion.div>

        {saved && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 glass rounded-lg p-5 border-[#2B4FFF]/50 flex items-center gap-4 glow-box"
            data-testid="resume-banner"
          >
            <div className="w-11 h-11 rounded border border-[#2B4FFF] text-[#2B4FFF] flex items-center justify-center">
              <PlayIcon className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="font-heading uppercase tracking-wider text-white text-sm">Unfinished match</div>
              <div className="font-mono text-xs text-slate-400 mt-0.5">
                {saved.board_size}×{saved.board_size}×{saved.board_size} · {saved.mode?.replace("_", " ")} · {(saved.moves || []).length} moves in
              </div>
            </div>
            <button onClick={resume} className="btn-primary" data-testid="resume-btn">Resume</button>
            <button onClick={discardSaved} className="text-slate-500 hover:text-white transition" data-testid="discard-saved-btn" aria-label="Discard">
              <XIcon className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        <div className="mt-10 grid md:grid-cols-12 gap-6">
          <section className="md:col-span-6">
            <div className="font-heading uppercase tracking-[0.3em] text-xs text-[#2B4FFF] mb-3">Board</div>
            <div className="grid sm:grid-cols-2 gap-4">
              {sizes.map((s) => {
                const active = size === s.v;
                return (
                  <button
                    key={s.v}
                    onClick={() => setSize(s.v)}
                    data-testid={`size-${s.v}-btn`}
                    className={`text-left p-5 rounded-lg border transition-all ${active ? "border-[#2B4FFF] bg-[#2B4FFF]/5 glow-box" : "border-[#2B4FFF]/15 hover:border-[#2B4FFF]/50"}`}
                  >
                    <div className={`w-11 h-11 rounded border flex items-center justify-center mb-3 ${active ? "border-[#2B4FFF] text-[#2B4FFF]" : "border-[#2B4FFF]/30 text-slate-300"}`}>
                      {s.icon}
                    </div>
                    <div className="font-heading uppercase text-lg text-white tracking-wider">{s.label}</div>
                    <div className="font-mono text-xs text-slate-400 mt-1">{s.sub}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="md:col-span-6">
            <div className="font-heading uppercase tracking-[0.3em] text-xs text-[#2B4FFF] mb-3">Opponent</div>
            <div className="space-y-2.5">
              {modes.map((m) => {
                const active = mode === m.v;
                return (
                  <button
                    key={m.v}
                    onClick={() => setMode(m.v)}
                    data-testid={`mode-${m.v}-btn`}
                    className={`w-full text-left flex items-center gap-4 p-4 rounded border transition-all ${active ? "border-[#2B4FFF] bg-[#2B4FFF]/5" : "border-[#2B4FFF]/15 hover:border-[#2B4FFF]/40"}`}
                  >
                    <div className={`w-10 h-10 rounded border flex items-center justify-center ${active ? "border-[#2B4FFF] text-[#2B4FFF]" : "border-[#2B4FFF]/30 text-slate-300"}`}>
                      {m.icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-heading uppercase text-sm text-white tracking-wider">{m.label}</div>
                      <div className="font-mono text-xs text-slate-400 mt-0.5">{m.desc}</div>
                    </div>
                    {active && <Sparkles className="w-4 h-4 text-[#2B4FFF]" />}
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="mt-10 flex flex-wrap gap-3 items-center">
          <button onClick={start} className="btn-primary pulse-glow" data-testid="start-game-btn">Launch match →</button>
          <div className="font-mono text-xs text-slate-500">
            Starting a <span className="text-white">{size}×{size}×{size}</span> match —{" "}
            <span className="text-white">{modes.find((x) => x.v === mode)?.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

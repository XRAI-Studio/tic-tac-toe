import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bot, Users, Cuboid, Zap, Flame, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export default function Lobby() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [size, setSize] = useState(parseInt(params.get("size") || "3", 10));
  const [mode, setMode] = useState(params.get("mode") || "ai_medium");

  const start = () => {
    navigate(`/play?size=${size}&mode=${mode}`);
  };

  const sizes = [
    { v: 3, label: "Classic", sub: "3×3×3 · 27 cells · 49 lines", icon: <Cuboid className="w-6 h-6" /> },
    { v: 4, label: "Extended", sub: "4×4×4 · 64 cells · 76 lines", icon: <Zap className="w-6 h-6" /> },
  ];

  const modes = [
    { v: "ai_easy",   label: "AI · Easy",    desc: "Random with a spark of logic", icon: <Bot className="w-5 h-5" /> },
    { v: "ai_medium", label: "AI · Medium",  desc: "Reads threats, claims center",  icon: <Bot className="w-5 h-5" /> },
    { v: "ai_hard",   label: "AI · Hard",    desc: "Deep alpha-beta · plans moves", icon: <Flame className="w-5 h-5" /> },
    { v: "local_2p",  label: "Local · 2P",   desc: "Cyan ╳ vs Orange ⚫",           icon: <Users className="w-5 h-5" /> },
    { v: "local_3p",  label: "Local · 3P",   desc: "Cyan ╳ · Orange ⚫ · Green ▲",   icon: <Users className="w-5 h-5" /> },
  ];

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] scanline">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="text-[#00F0FF] text-xs uppercase tracking-[0.4em] font-heading mb-2">New Game</div>
          <h1 className="font-heading font-black uppercase tracking-tighter text-4xl sm:text-5xl lg:text-6xl text-white glow-text-lg">
            Configure your <span className="text-[#00F0FF]">cube</span>
          </h1>
          <p className="text-slate-400 mt-3 max-w-2xl">Pick a board size and opponent. Matches are saved to your profile when signed in.</p>
        </motion.div>

        <div className="mt-10 grid md:grid-cols-12 gap-6">
          <section className="md:col-span-6">
            <div className="font-heading uppercase tracking-[0.3em] text-xs text-[#00F0FF] mb-3">Board</div>
            <div className="grid sm:grid-cols-2 gap-4">
              {sizes.map((s) => {
                const active = size === s.v;
                return (
                  <button
                    key={s.v}
                    onClick={() => setSize(s.v)}
                    data-testid={`size-${s.v}-btn`}
                    className={`text-left p-5 rounded-lg border transition-all ${
                      active
                        ? "border-[#00F0FF] bg-[#00F0FF]/5 glow-box"
                        : "border-[#00F0FF]/15 hover:border-[#00F0FF]/50"
                    }`}
                  >
                    <div className={`w-11 h-11 rounded border flex items-center justify-center mb-3 ${active ? "border-[#00F0FF] text-[#00F0FF]" : "border-[#00F0FF]/30 text-slate-300"}`}>
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
            <div className="font-heading uppercase tracking-[0.3em] text-xs text-[#00F0FF] mb-3">Opponent</div>
            <div className="space-y-2.5">
              {modes.map((m) => {
                const active = mode === m.v;
                return (
                  <button
                    key={m.v}
                    onClick={() => setMode(m.v)}
                    data-testid={`mode-${m.v}-btn`}
                    className={`w-full text-left flex items-center gap-4 p-4 rounded border transition-all ${
                      active ? "border-[#00F0FF] bg-[#00F0FF]/5" : "border-[#00F0FF]/15 hover:border-[#00F0FF]/40"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded border flex items-center justify-center ${active ? "border-[#00F0FF] text-[#00F0FF]" : "border-[#00F0FF]/30 text-slate-300"}`}>
                      {m.icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-heading uppercase text-sm text-white tracking-wider">{m.label}</div>
                      <div className="font-mono text-xs text-slate-400 mt-0.5">{m.desc}</div>
                    </div>
                    {active && <Sparkles className="w-4 h-4 text-[#00F0FF]" />}
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

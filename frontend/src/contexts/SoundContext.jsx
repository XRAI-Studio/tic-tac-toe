import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

const KEY = "cube3_muted";
const SoundContext = createContext(null);

export function SoundProvider({ children }) {
  const [muted, setMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(KEY) === "true";
  });
  const ctxRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(KEY, String(muted));
  }, [muted]);

  const getCtx = useCallback(() => {
    if (muted) return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, [muted]);

  const tone = useCallback((freq, dur = 0.12, type = "sine", vol = 0.08, attack = 0.005) => {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }, [getCtx]);

  const playClick = useCallback(() => tone(540 + Math.random() * 60, 0.07, "triangle", 0.06), [tone]);
  const playWin = useCallback(() => {
    tone(520, 0.14, "sine", 0.12);
    setTimeout(() => tone(700, 0.14, "sine", 0.12), 110);
    setTimeout(() => tone(900, 0.32, "sine", 0.14), 230);
  }, [tone]);
  const playDraw = useCallback(() => {
    tone(360, 0.2, "sawtooth", 0.07);
    setTimeout(() => tone(240, 0.35, "sawtooth", 0.07), 180);
  }, [tone]);

  const toggleMute = () => setMuted((m) => !m);

  return (
    <SoundContext.Provider value={{ muted, toggleMute, playClick, playWin, playDraw }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  return useContext(SoundContext);
}

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api, { setAuthToken } from "../api";
import { useAuth } from "../contexts/AuthContext";

export default function AuthCallback() {
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const sessionId = params.get("session_id");
    if (!sessionId) {
      navigate("/", { replace: true });
      return;
    }
    api.post("/auth/session", { session_id: sessionId })
      .then(({ data }) => {
        if (data?.session_token) setAuthToken(data.session_token);
        setUser(data);
        window.history.replaceState(null, "", "/lobby");
        navigate("/lobby", { replace: true, state: { user: data } });
      })
      .catch(() => {
        navigate("/", { replace: true });
      });
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center" data-testid="auth-callback">
      <div className="glass rounded-lg px-8 py-6 text-center">
        <div className="font-heading uppercase tracking-[0.3em] text-xs text-[#00F0FF]">Authenticating</div>
        <div className="font-hud text-2xl text-white mt-2">Syncing session…</div>
      </div>
    </div>
  );
}

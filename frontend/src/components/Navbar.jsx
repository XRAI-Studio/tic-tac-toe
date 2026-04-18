import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Cuboid, Trophy, User, LogOut, LogIn } from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/lobby";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const linkCls = ({ isActive }) =>
    `px-3 py-2 rounded text-xs uppercase tracking-[0.2em] font-heading font-semibold transition-colors ${
      isActive ? "text-[#00F0FF] glow-text" : "text-slate-300 hover:text-white"
    }`;

  return (
    <nav className="sticky top-0 z-40 glass" data-testid="main-navbar">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group" data-testid="nav-logo">
          <Cuboid className="w-6 h-6 text-[#00F0FF] group-hover:rotate-45 transition-transform duration-500" />
          <span className="font-heading font-black tracking-[0.25em] text-white text-sm">CUBE<span className="text-[#00F0FF]">3</span></span>
        </Link>

        <div className="hidden sm:flex items-center gap-1">
          <NavLink to="/lobby" className={linkCls} data-testid="nav-lobby">Play</NavLink>
          <NavLink to="/leaderboard" className={linkCls} data-testid="nav-leaderboard">Leaderboard</NavLink>
          {user && <NavLink to="/profile" className={linkCls} data-testid="nav-profile">Profile</NavLink>}
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded border border-[#00F0FF]/20">
                {user.picture ? (
                  <img src={user.picture} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[#00F0FF]/20 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-[#00F0FF]" />
                  </div>
                )}
                <span className="font-mono text-xs text-white" data-testid="nav-user-name">{user.name}</span>
              </div>
              <button onClick={handleLogout} className="btn-ghost flex items-center gap-1.5" data-testid="nav-logout-btn">
                <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Sign out</span>
              </button>
            </>
          ) : (
            <button onClick={handleLogin} className="btn-primary flex items-center gap-2" data-testid="nav-login-btn">
              <LogIn className="w-4 h-4" /> Sign in
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { useSound } from "../contexts/SoundContext";
import { Cuboid, User, Sun, Moon, Volume2, VolumeX, Menu, X } from "lucide-react";

export default function Navbar() {
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const { muted, toggleMute } = useSound();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // The player's records live on this device — tapping the name pill opens the
  // profile, where the display name can be edited.
  const openProfile = () => {
    setMenuOpen(false);
    navigate("/profile");
  };

  const linkCls = ({ isActive }) =>
    `px-3 py-2 rounded text-xs uppercase tracking-[0.2em] font-heading font-semibold transition-colors ${
      isActive ? "text-[#2B4FFF] glow-text" : "text-slate-300 hover:text-white"
    }`;

  const mobileLinkCls = ({ isActive }) =>
    `tap-target px-4 py-3 rounded text-sm uppercase tracking-[0.2em] font-heading font-semibold transition-colors flex items-center ${
      isActive ? "text-[#2B4FFF] bg-[#2B4FFF]/10 border border-[#2B4FFF]/40" : "text-slate-200 border border-[#2B4FFF]/15"
    }`;

  return (
    <nav className="sticky top-0 z-40 glass safe-pt safe-pl safe-pr" data-testid="main-navbar">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group" data-testid="nav-logo" onClick={() => setMenuOpen(false)}>
          <Cuboid className="w-6 h-6 text-[#2B4FFF] group-hover:rotate-45 transition-transform duration-500" />
          <span className="font-heading font-black tracking-[0.25em] text-white text-sm">CUBE<span className="text-[#2B4FFF]">3</span></span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden sm:flex items-center gap-1">
          <NavLink to="/lobby" className={linkCls} data-testid="nav-lobby">Play</NavLink>
          <NavLink to="/daily" className={linkCls} data-testid="nav-daily">Daily</NavLink>
          <NavLink to="/leaderboard" className={linkCls} data-testid="nav-leaderboard">Leaderboard</NavLink>
          {user && <NavLink to="/profile" className={linkCls} data-testid="nav-profile">Profile</NavLink>}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={toggleMute} className="tap-target w-9 h-9 rounded border border-[#2B4FFF]/20 text-slate-300 hover:text-[#2B4FFF] hover:border-[#2B4FFF]/60 transition flex items-center justify-center" data-testid="nav-sound-toggle" aria-label="Toggle sound">
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button onClick={toggle} className="tap-target w-9 h-9 rounded border border-[#2B4FFF]/20 text-slate-300 hover:text-[#2B4FFF] hover:border-[#2B4FFF]/60 transition flex items-center justify-center" data-testid="nav-theme-toggle" aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button onClick={openProfile} className="hidden sm:flex items-center gap-2 px-2 py-1 rounded border border-[#2B4FFF]/20 hover:border-[#2B4FFF]/60 transition" data-testid="nav-user-pill" title="Your profile">
            {user?.picture ? (
              <img src={user.picture} alt="" className="w-6 h-6 rounded-full" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[#2B4FFF]/20 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-[#2B4FFF]" />
              </div>
            )}
            <span className="font-mono text-xs text-white" data-testid="nav-user-name">{user?.name || "Player"}</span>
          </button>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="sm:hidden tap-target w-9 h-9 rounded border border-[#2B4FFF]/20 text-slate-300 hover:text-[#2B4FFF] transition flex items-center justify-center"
            data-testid="nav-mobile-menu-btn"
            aria-label="Toggle navigation menu"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="sm:hidden border-t border-[#2B4FFF]/10 bg-[rgba(5,5,10,0.92)] backdrop-blur-xl safe-pb" data-testid="nav-mobile-drawer">
          <div className="px-4 py-3 flex flex-col gap-2">
            <NavLink to="/lobby" className={mobileLinkCls} onClick={() => setMenuOpen(false)} data-testid="nav-mobile-lobby">Play</NavLink>
            <NavLink to="/daily" className={mobileLinkCls} onClick={() => setMenuOpen(false)} data-testid="nav-mobile-daily">Daily</NavLink>
            <NavLink to="/leaderboard" className={mobileLinkCls} onClick={() => setMenuOpen(false)} data-testid="nav-mobile-leaderboard">Leaderboard</NavLink>
            <NavLink to="/profile" className={mobileLinkCls} onClick={() => setMenuOpen(false)} data-testid="nav-mobile-profile">Profile</NavLink>
            <div className="pt-2 mt-1 border-t border-[#2B4FFF]/10 flex items-center gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {user?.picture ? (
                  <img src={user.picture} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#2B4FFF]/20 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-[#2B4FFF]" />
                  </div>
                )}
                <span className="font-mono text-xs text-white truncate">{user?.name || "Player"}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

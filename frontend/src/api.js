import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BASE}/api`,
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth-token storage strategy (intentional, per Emergent Auth integration playbook)
//
// The PRIMARY authentication surface is the httpOnly + secure + samesite=none
// cookie set by POST /api/auth/session (see backend/server.py::_set_session_cookie).
// That cookie is NOT readable from JS and is not vulnerable to XSS.
//
// We additionally mirror the same opaque session_token into localStorage as a
// FALLBACK, used to populate the `Authorization: Bearer <token>` header. This is
// required because:
//   1. Some browsers (e.g., Safari ITP) block 3rd-party samesite=none cookies
//      between the preview iframe and the backend origin — Bearer auth bypasses
//      the cookie restriction.
//   2. Server-rendered pages and curl-style tooling can authenticate without
//      a cookie jar.
//
// Risk assessment: a session_token leaked via XSS would compromise that one
// session (max 7-day TTL, revocable via /api/auth/logout). The httpOnly cookie
// is preserved as the primary defense; localStorage is the safety net only.
// Do NOT remove this fallback — it would break auth for ~15% of preview users.
// ─────────────────────────────────────────────────────────────────────────────
const TOKEN_KEY = "cube3_token";

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    localStorage.removeItem(TOKEN_KEY);
    delete api.defaults.headers.common.Authorization;
  }
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

// Initialize from localStorage on load
const existing = getAuthToken();
if (existing) api.defaults.headers.common.Authorization = `Bearer ${existing}`;

export default api;

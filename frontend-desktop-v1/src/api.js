import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BASE}/api`,
});

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

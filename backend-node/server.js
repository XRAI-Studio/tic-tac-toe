// Cube3 — Node.js + Express + MySQL backend (runtime entrypoint).
// Hostinger Business compatible (LiteSpeed NodeJS / Passenger friendly).
// All routing/logic lives in app.js (createApp factory) so it stays unit-testable;
// this file only wires the real MySQL pool + Emergent auth fetcher and calls listen().
import 'dotenv/config';
import axios from 'axios';
import { pool } from './db.js';
import { createApp } from './app.js';

const EMERGENT_AUTH_URL = 'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data';

// Exchanges an Emergent session id for the user's profile + session token.
async function fetchEmergentSession(sessionId) {
  const r = await axios.get(EMERGENT_AUTH_URL, {
    headers: { 'X-Session-ID': sessionId },
    timeout: 20000,
  });
  return r.data;
}

const app = createApp({ pool, fetchEmergentSession });

const PORT = Number(process.env.PORT) || 8001;
app.listen(PORT, '0.0.0.0', () => console.log(`[server] listening on :${PORT}`));

export default app;

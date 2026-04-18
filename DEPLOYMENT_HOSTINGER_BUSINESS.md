# Deploying Cube3 to **Hostinger Business (shared) hosting**

This guide assumes you have a **Hostinger Business Web Hosting** plan (NOT a VPS). It uses:

- `backend-node/` (Express + MySQL) — runs under Hostinger's **Node.js** feature
- `frontend/build/` — static React bundle, dropped into `public_html/`
- **MySQL** — included with your plan (no Atlas / no external DB)

Both live on the same domain, so there's no CORS pain.

> Works on: Hostinger **Web Premium / Business / Cloud Startup / Cloud Professional** (any plan that has Node.js + MySQL in hPanel). **Does NOT work on Single / Starter** (no Node.js).

---

## 0. What you'll have when you're done

```
https://yourdomain.com/                →  React SPA (static files in public_html/)
https://yourdomain.com/api/*           →  Express/Node app (separate hPanel Node.js app, reverse-proxied)
MySQL database                         →  provided by Hostinger
```

---

## 1. Create the MySQL database

1. hPanel → **Databases → MySQL Databases**.
2. Click **Create a new MySQL database & user**. Hostinger prefixes everything with your account id. Result looks like:
   - Database: `u123456789_cube3`
   - User: `u123456789_cube3`
   - Password: (the one you set)
   - Host: `localhost` (from inside your hosting account)
3. **Save these four values** — you'll paste them into `.env` in step 3.

---

## 2. Enable Node.js for the backend

Hostinger Business has a **Node.js** feature (uses LiteSpeed `lsnode`, which is Passenger-compatible).

1. hPanel → **Advanced → Node.js**.
2. Click **Create Application**.
   - **Node.js version**: `20.x` (or the newest available)
   - **Application mode**: `Production`
   - **Application root**: `backend-node` (the folder you'll upload into)
   - **Application URL**: pick `yourdomain.com/api` **OR** a subdomain like `api.yourdomain.com`
     *Recommended: subdirectory `yourdomain.com/api`* — same origin, no CORS, matches the code defaults.
   - **Application startup file**: `server.js`
3. Click **Create**. Hostinger generates an `Application root` path (e.g. `/home/u123456789/backend-node`) — **write it down**.

---

## 3. Upload the backend code

Pick one of:

### 3a. File Manager (easiest)
1. On your computer, zip the `backend-node/` folder **without** `node_modules/` and **without** `.env`.
2. hPanel → **File Manager** → navigate to the Application root from step 2 → **Upload** → extract the zip.
3. In File Manager, **Create a new file** named `.env` in the same folder and paste:
   ```
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=u123456789_cube3
   DB_PASSWORD=your-password
   DB_NAME=u123456789_cube3
   PORT=3000
   CORS_ORIGIN_REGEX=^https://yourdomain\.com$
   INSECURE_COOKIES=false
   ```
   > The `PORT` value is ignored by Hostinger's Passenger — leaving it at `3000` is fine.

### 3b. Git (nicer for repeat deploys)
If you're using SSH (Business plan includes it):
```bash
ssh u123456789@yourdomain.com -p 65002        # credentials from hPanel → SSH Access
cd ~/backend-node                              # your Application root
git clone https://github.com/you/cube3.git tmp
cp -r tmp/backend-node/. .
rm -rf tmp
nano .env                                      # paste the values above
```

---

## 4. Install dependencies, migrate schema, (optional) seed

Still in hPanel → **Advanced → Node.js** → your app → **Run NPM Install** (button). Or via SSH:
```bash
cd ~/backend-node
npm install --omit=dev
node migrate.js          # creates the 5 MySQL tables
node seed.js             # (optional) demo leaderboard rows
```

In hPanel Node.js page click **Restart**. Your backend is now live at the Application URL (e.g. `https://yourdomain.com/api/` returns the welcome JSON). Verify:
```bash
curl https://yourdomain.com/api/
# {"message":"Cube3 Tic-Tac-Toe API"}
```

---

## 5. Build and upload the React frontend

On your computer:

```bash
cd frontend
echo "REACT_APP_BACKEND_URL=https://yourdomain.com" > .env
echo "WDS_SOCKET_PORT=443" >> .env
yarn install --frozen-lockfile
yarn build
```

This produces `frontend/build/`. Upload its **contents** (not the folder itself) to `public_html/`:

- hPanel → **File Manager** → open `public_html/` → delete any placeholder `default.html` → upload the entire contents of `build/`.

At minimum you should now see in `public_html/`:
```
index.html
asset-manifest.json
static/css/...
static/js/...
```

---

## 6. SPA routing (so `/lobby`, `/play`, `/replay/:id` don't 404)

React uses client-side routing; Hostinger's Apache needs an htaccess rule to send every non-asset URL to `index.html`.

hPanel → **File Manager** → `public_html/` → create file `.htaccess` with:

```apache
RewriteEngine On

# Do NOT rewrite /api/* — let Hostinger's Node proxy handle it
RewriteRule ^api(/.*)?$ - [L]

# Serve existing files/dirs as-is
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

# Everything else → SPA entry point
RewriteRule ^ index.html [L]
```

Visit `https://yourdomain.com/lobby` — you should see the game lobby. `https://yourdomain.com/api/leaderboard` returns JSON.

---

## 7. Free HTTPS

hPanel → **Websites** → your domain → **Security → SSL**. Click **Install SSL** (Let's Encrypt). It renews automatically. Force HTTPS in the same panel.

---

## 8. Sign-in flow sanity check

1. Visit `https://yourdomain.com/` in an incognito window.
2. Click **Sign in** (Emergent-managed Google OAuth). After Google, you should bounce to `/lobby` logged in.
3. Play a game against the AI — on the result screen, click **Share replay**. Open the copied URL in a new tab to confirm the replay plays back.

If step 2 loops, re-check `CORS_ORIGIN_REGEX` in `backend-node/.env` — it must match your exact HTTPS origin.

---

## 9. Updating the app later

**Backend**: change files → in hPanel **Node.js → Restart**. (Or via SSH: `git pull && npm install --omit=dev && touch tmp/restart.txt`.)

**Frontend**: run `yarn build` locally, upload the new `build/` contents to `public_html/` (overwrite). No restart needed.

**Schema change**: edit `schema.sql`, run `node migrate.js` (the script is idempotent — it only creates tables that don't exist, so for column changes you'll add those as new statements).

---

## 10. Troubleshooting

| Symptom                                           | Fix |
|---------------------------------------------------|-----|
| `500 Internal Server Error` on `/api/*`           | hPanel → Node.js → **Logs**. Usually wrong DB creds in `.env`. |
| `ER_ACCESS_DENIED_ERROR`                          | Recreate the DB user in hPanel → MySQL Databases and redo step 1. |
| `/lobby` returns 404                              | `.htaccess` is missing or wrong in `public_html/`. Redo step 6. |
| Login redirects to `https://.../#session_id=...` blank screen | `CORS_ORIGIN_REGEX` doesn't match your real origin; see step 8 note. |
| Node.js "unable to find module mysql2"            | You skipped **Run NPM Install** in step 4. Click it and restart. |
| Replays work but stats don't save                 | Check that you're signed in — guests are intentionally not tracked. |
| Very slow first request                           | LiteSpeed cold-starts lsnode; subsequent requests are fast. Enable **Always On** in hPanel → Node.js if available on your plan. |

---

## 11. FAQ

**Do I need to rebuild the Python/FastAPI backend?** No — the `backend-node/` folder is a drop-in replacement exposing the exact same `/api/*` routes and request/response shapes as the Python version. The React frontend doesn't know the difference.

**Can I keep MongoDB instead of MySQL?** Not on Hostinger Business — MongoDB isn't supported. MySQL is what's included with your plan.

**How many games/users will this handle?** With Hostinger's default Node.js limits (~128 MB RAM for the lsnode app, 25 connections pool in `db.js`), expect comfortably several hundred concurrent users and tens of thousands of recorded games. Upgrade to a higher plan or a VPS if you outgrow it.

**Can I SSH in?** Yes — Business plans include SSH (`ssh u123456789@yourdomain.com -p 65002`, password in hPanel → SSH Access).

---

**That's it — your app is live on your current Hostinger Business plan with zero additional hosting costs.** 🎉

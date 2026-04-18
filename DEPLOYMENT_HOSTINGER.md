# Deploying Cube3 to Hostinger

This guide walks you through deploying Cube3 (React frontend + FastAPI backend + MongoDB) onto Hostinger.

> **TL;DR — which Hostinger plan do I need?**
>
> Cube3's backend is **Python/FastAPI**, which requires a real Linux process supervisor (systemd) and a reverse proxy (nginx). That is only possible on a **Hostinger VPS plan** (KVM 1 / KVM 2 / KVM 4 / Cloud VPS). Shared hosting and Business plans *can* serve the React static build, but they **cannot** run the FastAPI backend. We recommend a single **KVM 1 VPS** (1 vCPU, 4 GB RAM) for a small production deployment.
>
> MongoDB is provided by **MongoDB Atlas** (free M0 cluster) — Hostinger does not offer managed MongoDB.

---

## Table of contents
1. [Architecture](#1-architecture)
2. [Domain & DNS on Hostinger](#2-domain--dns-on-hostinger)
3. [Provision a Hostinger VPS](#3-provision-a-hostinger-vps)
4. [Set up MongoDB Atlas](#4-set-up-mongodb-atlas-free)
5. [Server bootstrap](#5-server-bootstrap)
6. [Deploy the backend](#6-deploy-the-backend-fastapi)
7. [Deploy the frontend](#7-deploy-the-frontend-react-static-build)
8. [nginx configuration](#8-nginx-reverse-proxy--static-hosting)
9. [HTTPS with Let's Encrypt](#9-https-with-lets-encrypt)
10. [Updating the app (future deploys)](#10-updating-the-app-future-deploys)
11. [Troubleshooting](#11-troubleshooting)
12. [Alternative: split hosting (frontend on shared)](#12-alternative-split-hosting-frontend-on-shared)

---

## 1. Architecture

A single VPS running:

```
Internet
   │
   ▼
nginx :443  (TLS via Let's Encrypt)
   ├── /                 →  /var/www/cube3/frontend/build/   (React static files)
   └── /api/*            →  http://127.0.0.1:8001            (uvicorn/gunicorn)
                                         │
                                         ▼
                                 MongoDB Atlas (external)
```

Recommended: serve frontend and `/api/*` from the **same subdomain** (e.g. `cube3.yourdomain.com`). This avoids CORS entirely and is what the code is designed for — no subdomain/subdirectory gymnastics required.

---

## 2. Domain & DNS on Hostinger

1. In Hostinger hPanel → **Domains** → select your domain.
2. Go to **DNS / Nameservers → DNS Zone**.
3. Add (or edit) an **A record**:
   - **Name/Host**: `cube3` (or `@` for root, or `www`)
   - **Points to**: the public IPv4 of the VPS you'll create in step 3
   - **TTL**: 3600
4. (Optional) Add an AAAA record for IPv6 if your VPS has one.

DNS propagation typically takes 5–30 minutes.

---

## 3. Provision a Hostinger VPS

1. In hPanel → **VPS** → **Buy VPS** → pick **KVM 1** (1 vCPU / 4 GB RAM / 50 GB NVMe — enough for Cube3).
2. **OS template**: `Ubuntu 22.04 LTS` (or 24.04). The commands below assume Ubuntu 22.04.
3. Once provisioned, note:
   - **Public IP** (use in DNS A-record above)
   - **Root password** (set via hPanel → Security)
4. Log in over SSH:
   ```bash
   ssh root@<your-vps-ip>
   ```
5. Create a non-root user (recommended):
   ```bash
   adduser cube3
   usermod -aG sudo cube3
   rsync --archive --chown=cube3:cube3 ~/.ssh /home/cube3    # copy SSH keys
   ```
   From now on log in as `cube3@<vps-ip>`.

---

## 4. Set up MongoDB Atlas (free)

1. Create an account at <https://www.mongodb.com/cloud/atlas/register>.
2. Create a new project → **Build a Database** → **M0 Free**.
3. Pick the region closest to your Hostinger VPS (check VPS data center location).
4. Under **Security → Database Access** create a DB user: `cube3` with a strong password.
5. Under **Security → Network Access** add your VPS's **public IP**. For testing you can use `0.0.0.0/0` but **lock it down** to the VPS IP for production.
6. Click **Connect → Drivers → Python/Node** and copy the connection string. It looks like:
   ```
   mongodb+srv://cube3:<password>@cluster0.abcd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```
7. Save this as `MONGO_URL` — you'll paste it into `backend/.env`.

---

## 5. Server bootstrap

Run everything in this section as the `cube3` user on the VPS.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx curl build-essential ufw \
    python3.11 python3.11-venv python3-pip

# Node 20 + Yarn (for building the React bundle on the server)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g yarn

# Firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# Clone your code (GitHub example)
sudo mkdir -p /var/www
sudo chown $USER:$USER /var/www
cd /var/www
git clone https://github.com/<your-org>/cube3.git
cd cube3
```

> If you don't have a git remote, `scp -r ./` the `backend/` and `frontend/` directories up.

---

## 6. Deploy the backend (FastAPI)

### 6.1 Python environment + dependencies
```bash
cd /var/www/cube3/backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt gunicorn
```

### 6.2 Configure environment
```bash
cp .env.example .env
nano .env
```
Fill in:
```
MONGO_URL=mongodb+srv://cube3:<password>@cluster0.abcd.mongodb.net/?retryWrites=true&w=majority
DB_NAME=cube3
CORS_ORIGIN_REGEX=^https://cube3\.yourdomain\.com$
```

### 6.3 (Optional) seed demo leaderboard
```bash
python seed.py
```

### 6.4 Create a systemd service
```bash
sudo nano /etc/systemd/system/cube3-backend.service
```
Paste:
```ini
[Unit]
Description=Cube3 FastAPI backend
After=network.target

[Service]
Type=simple
User=cube3
Group=cube3
WorkingDirectory=/var/www/cube3/backend
EnvironmentFile=/var/www/cube3/backend/.env
ExecStart=/var/www/cube3/backend/.venv/bin/gunicorn \
    -k uvicorn.workers.UvicornWorker \
    -w 2 \
    -b 127.0.0.1:8001 \
    --timeout 90 \
    --access-logfile - \
    --error-logfile - \
    server:app
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```
Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cube3-backend
sudo systemctl status cube3-backend              # should show active (running)
curl http://127.0.0.1:8001/api/                  # {"message":"Cube3 Tic-Tac-Toe API"}
```

---

## 7. Deploy the frontend (React static build)

```bash
cd /var/www/cube3/frontend
cp .env.example .env
nano .env
```
Set:
```
REACT_APP_BACKEND_URL=https://cube3.yourdomain.com
WDS_SOCKET_PORT=443
```

Build it:
```bash
yarn install --frozen-lockfile
yarn build
# Produces /var/www/cube3/frontend/build/
```

---

## 8. nginx reverse proxy + static hosting

```bash
sudo nano /etc/nginx/sites-available/cube3
```
Paste (replace `cube3.yourdomain.com` with your subdomain):
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name cube3.yourdomain.com;

    # React static bundle
    root /var/www/cube3/frontend/build;
    index index.html;

    # Long-cache hashed assets
    location /static/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Proxy backend
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
    }

    # SPA fallback: every non-asset route returns index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    client_max_body_size 2m;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript application/octet-stream image/svg+xml;
}
```

Enable it:
```bash
sudo ln -sf /etc/nginx/sites-available/cube3 /etc/nginx/sites-enabled/cube3
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Visit `http://cube3.yourdomain.com` — the landing page should load, and `http://cube3.yourdomain.com/api/` should return the welcome JSON.

---

## 9. HTTPS with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d cube3.yourdomain.com
# Follow prompts; certbot rewrites your nginx config and reloads.
```

Verify auto-renewal:
```bash
sudo certbot renew --dry-run
```

Your site is now live at `https://cube3.yourdomain.com`. 🎉

---

## 10. Updating the app (future deploys)

```bash
cd /var/www/cube3
git pull
# Backend changes?
cd backend
source .venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart cube3-backend
# Frontend changes?
cd ../frontend
yarn install --frozen-lockfile
yarn build
# Nginx automatically serves the new build — no reload needed.
```

For faster deploys, commit a simple `deploy.sh` that chains the above.

---

## 11. Troubleshooting

| Symptom                                             | Fix |
|-----------------------------------------------------|-----|
| **502 Bad Gateway** on `/api/*`                     | `sudo systemctl status cube3-backend` and `sudo journalctl -u cube3-backend -n 100` |
| **401 on /api/auth/me** after Google login         | Re-check `CORS_ORIGIN_REGEX` matches your real HTTPS origin exactly. |
| **MongoServerSelectionError**                       | Add the VPS's public IP to Atlas Network Access allowlist. |
| **Assets 404**                                      | Confirm `yarn build` produced `/var/www/cube3/frontend/build/index.html`. |
| **SPA routes 404 on refresh**                       | Ensure the `try_files $uri $uri/ /index.html;` line is in nginx. |
| **Google OAuth redirect loops**                     | Make sure the site is served over **HTTPS** (step 9). Emergent Auth requires it. |
| **High CPU / slow 4×4 AI**                          | Scale up to KVM 2, or reduce `maxDepth` in `src/game/ai.js`. |

Check logs:
```bash
sudo journalctl -u cube3-backend -f          # backend logs (live)
sudo tail -f /var/log/nginx/error.log        # nginx errors
```

---

## 12. Alternative: split hosting (frontend on shared)

If you already own a Hostinger shared/Business plan and want to avoid paying for a VPS:

1. **Frontend** — `yarn build` locally, then upload the contents of `frontend/build/` to `public_html/` on the shared plan. In Hostinger hPanel, enable "SPA routing" by adding an `.htaccess`:
   ```apache
   RewriteEngine On
   RewriteBase /
   RewriteRule ^index\.html$ - [L]
   RewriteCond %{REQUEST_FILENAME} !-f
   RewriteCond %{REQUEST_FILENAME} !-d
   RewriteRule . /index.html [L]
   ```
2. **Backend** — still goes on a Hostinger VPS (or any VPS / Render / Fly.io), exposed at e.g. `api.yourdomain.com`.
3. Set `REACT_APP_BACKEND_URL=https://api.yourdomain.com` **before** running `yarn build`.
4. On the backend, set `CORS_ORIGIN_REGEX=^https://yourdomain\.com$`.

This setup works but has more moving parts; the single-VPS approach in sections 3–9 is simpler and recommended.

---

**That's it — you're deployed.** For any bugs or issues, open an issue in the repo and include the output of `sudo journalctl -u cube3-backend -n 200`.

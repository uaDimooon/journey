# Journey — Deployment

Status: **Home + Tailscale (personal)**
Last updated: 2026-07-30

> Run Journey on a machine you own and reach it privately from your laptop and
> phone over Tailscale. This is the "personal" stage; the public path (Turso/
> Postgres + object storage) is described at the end. See ADR-0005 for why the
> data + file backends are swappable.

---

## What Journey needs

- **Node 26+** (uses the built-in `node:sqlite`).
- A **persistent disk** for the SQLite DB + attachments (they live under
  `~/.journey/` by default; override with `JOURNEY_DB_PATH`).
- A **single always-on instance** (SQLite is one file, one process — do not run
  multiple instances against the same DB).
- **HTTPS** for the login cookie — provided here by `tailscale serve`.

The same Express server serves both the API and the built SPA (same origin), so
sessions work across devices with no CORS setup.

---

## 1. Build & run (bare metal)

```sh
git clone https://github.com/uaDimooon/journey.git
cd journey
npm ci
npm run build          # builds the SPA into dist/
npm start              # JOURNEY_ENV=production node server/index.mjs (port 8787)
```

Visit `http://localhost:8787` on the box to confirm it serves the app, and
`http://localhost:8787/api/health` returns `{"ok":true}`.

### Environment variables

| Var | Purpose | Default |
|---|---|---|
| `JOURNEY_ENV` | `production` enables SPA serving + secure cookies | `development` |
| `JOURNEY_DB_PATH` | DB file path (attachments go in a sibling `attachments/`) | `~/.journey/journey.db` |
| `PORT` | HTTP port | `8787` |
| `JOURNEY_COOKIE_SECURE` | `true`/`false` override for the Secure cookie flag | on in prod |
| `JOURNEY_TRUST_PROXY` | trust an upstream HTTPS proxy for req IP/proto | on in prod |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | optional AI enrichment | unset (disabled) |
| `TELEGRAM_BOT_TOKEN` | optional Telegram ingestion | unset (disabled) |

Put secrets in a gitignored `.env` in the project root, or export them in the
service unit (below).

---

## 2. Run as a service (systemd), so it survives reboots

Create `/etc/systemd/system/journey.service`:

```ini
[Unit]
Description=Journey
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/you/journey
Environment=JOURNEY_ENV=production
Environment=PORT=8787
# Optional secrets:
# Environment=OPENAI_API_KEY=sk-...
# Environment=TELEGRAM_BOT_TOKEN=...
ExecStart=/usr/bin/node server/start.mjs
Restart=always
User=you

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now journey
systemctl status journey
```

> **macOS host?** systemd is Linux-only. Keep it alive with **pm2**:
>
> ```sh
> npm i -g pm2                                          # no sudo (Homebrew node)
> JOURNEY_ENV=production pm2 start server/start.mjs --name journey
> pm2 save                                             # remember it across restarts
> pm2 startup                                          # prints a `sudo ...` line — run it once for start-on-boot
> ```
>
> pm2 restarts the app if it crashes and (after `pm2 startup`) relaunches it on
> reboot. Use `server/start.mjs` — not `"npm start"` — so pm2 tracks the node
> process directly. `pm2 logs journey` tails output; `pm2 restart journey`
> after pulling updates (rebuild `dist/` first).

---

## 3. Reach it from anywhere with Tailscale

Tailscale is a private mesh VPN — only your devices can see the service.

**Install the CLI on the host:**

```sh
# Linux:
curl -fsSL https://tailscale.com/install.sh | sh

# macOS (Homebrew) — the formula gives the `tailscale` CLI + daemon:
brew install tailscale
sudo brew services start tailscale      # starts tailscaled
```

> The Linux `install.sh` one-liner does NOT work on macOS. On macOS you can
> alternatively install the menu-bar app with `brew install --cask tailscale`,
> but the Homebrew formula above keeps the `tailscale` CLI on your PATH, which
> `tailscale serve` needs.

**Connect and expose the app over HTTPS:**

```sh
sudo tailscale up                        # opens a browser to sign in
sudo tailscale serve --bg 8787           # HTTPS proxy -> your app
```

`tailscale serve` needs HTTPS certificates enabled for your tailnet: in the
[admin console](https://login.tailscale.com/admin/dns) turn on **MagicDNS** and
**HTTPS Certificates** (one-time).

Then install the **Tailscale app** on your laptop and phone, sign in to the same
tailnet, and open `https://<machine-name>.<your-tailnet>.ts.net`. Because that's
HTTPS, the Secure session cookie works and you stay logged in.

> Prefer a plain-HTTP tailnet address instead of `tailscale serve`? Set
> `JOURNEY_COOKIE_SECURE=false` (login cookies can't be Secure over HTTP).

> **Always-on note:** a laptop that sleeps is offline as a server. For 24/7
> access use an always-on machine (Mac mini, Raspberry Pi, or a small Linux box).

---

## 4. Backups (do this — it's one file)

The DB (`journey.db`) and `attachments/` under `~/.journey/` are all your data.

- **Simple:** a nightly copy via cron:
  ```sh
  0 3 * * *  cp -a ~/.journey ~/backups/journey-$(date +\%F)
  ```
- **Continuous (recommended if you value the data):** [Litestream](https://litestream.io)
  streams the SQLite file to cloud storage (S3/R2) in near-real-time.

---

## 5. Updating

```sh
cd journey
git pull
npm ci
npm run build
sudo systemctl restart journey
```

---

## Optional: Docker

A `Dockerfile` is included for a container path (bind a volume to `/data`):

```sh
docker build -t journey .
docker run -d --name journey -p 8787:8787 -v journey-data:/data journey
```

Run Tailscale on the **host** and `tailscale serve 8787` as above.

---

## Later: going public (web + mobile)

Because config, DB, and file storage are isolated (ADR-0005), the public jump is
contained:

- **Database:** swap `server/db.mjs` for **Turso/libSQL** (SQLite-compatible,
  minimal change) or **Postgres** (Neon/Supabase).
- **Files:** swap `server/storage.mjs` for **S3 / Cloudflare R2**.
- **Host:** Fly.io / Render (persistent volume) or a VPS + Caddy.
- **Mobile:** the app is already a web app; add a PWA, and later wrap the same
  SPA with Capacitor for the app stores.
- **Add for public:** email verification + password reset, rate limiting,
  monitoring/error tracking, and managed backups.

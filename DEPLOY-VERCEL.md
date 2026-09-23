# 🚀 Deploying Thor-EN-Dashboard to Vercel (+ your own domain)

> **Target setup** (what this guide produces):
>
> ```
> Browser ──https──▶ Vercel (thormarket.site)        ← the Next.js dashboard
>                       │
>                       │ DASH_API_URL + DASH_API_TOKEN
>                       ▼
>                 cloudflared tunnel (public HTTPS)
>                       │
>                       ▼
>           Termux / VPS — Thor-EN bot (DASH API on 127.0.0.1:8788)
>
> Vercel ──postgres://──▶ Neon (the dashboard's user database)
> ```
>
> **The bot NEVER runs on Vercel** — Discord bots are long-running processes;
> Vercel is serverless. Only the dashboard is deployed there. The bot stays on
> Termux (or a VPS) and is reached through a public HTTPS tunnel.

---

## 0. Prerequisites

| What | Where | Cost |
|---|---|---|
| GitHub account with the `Thor-EN-Dashboard` repo pushed | github.com | free |
| Vercel account (sign up **with GitHub**) | vercel.com | Hobby plan: free¹ |
| A Postgres database (this guide uses **Neon**) | neon.tech | free tier |
| Your domain (`thormarket.site`, bought at Domainesia) | domainesia.id | already paid |
| The Thor-EN bot running (Termux/VPS) with its DASH API enabled | — | — |

¹ Vercel Hobby is free for personal/non-commercial projects and **does allow
custom domains**. If thormarket.site turns commercial, upgrade to Vercel Pro.

Also prepare, before starting:

- `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` — Discord Developer Portal →
  your application → **OAuth2** (the same application the bot token belongs to).
- A strong `SESSION_SECRET` — generate one:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- A strong `DASH_API_TOKEN` — generate one the same way, then set the SAME
  value in the **bot's** `.env` (`DASH_API_TOKEN=...`) and later in Vercel.
- Your Discord user ID (Developer Mode in Discord → right-click your name →
  Copy User ID) → becomes `ADMIN_DISCORD_IDS`.

---

## 1. Create the database (Neon Postgres)

SQLite (the local default) **cannot survive on serverless hosting** — Vercel's
filesystem is wiped on every cold start, so every login would be forgotten.
The dashboard's user database must live in the cloud. Neon's free tier is more
than enough (the dashboard stores one small `User` table).

1. Go to **https://neon.tech** → sign up (free) → **Create project**
   (name it e.g. `thor-dashboard`, pick the region closest to your users —
   e.g. Singapore).
2. Open the project → **Dashboard** → the **Connection string** panel.
   You get **two** URLs — know the difference:
   - **Pooled** connection (host contains `-pooler`) → for the **Vercel
     runtime** (`DATABASE_URL` in Vercel). Pooled = many short-lived serverless
     connections share it. This is the one Vercel will use.
   - **Direct** connection (no `-pooler`) → for one-off schema pushes
     (`db push` in step 2).
3. Copy both somewhere safe (they include the password).

Example shapes:

```
pooled:  postgres://user:pass@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
direct:  postgres://user:pass@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

---

## 2. Push the schema (create the User table)

From your PC/Termux clone of `Thor-EN-Dashboard` (one-time, using the
**direct** URL):

```bash
cd Thor-EN-Dashboard
npm install
DATABASE_URL="postgres://user:pass@ep-xxxx....neon.tech/neondb?sslmode=require" npm run db:push
```

`scripts/db.mjs` sees the `postgres://` URL and automatically uses
`prisma/schema.postgres.prisma` (the Postgres flavour of the schema — added in
v4.2.0). You should see the `User` table being created.

> Local development is unchanged: with no `postgres://` URL set, everything
> keeps using SQLite (`file:db/custom.db`) exactly as before.

---

## 3. Import the project into Vercel

1. **https://vercel.com** → sign up / log in **with GitHub** (important: this
   is what lets Vercel read your private repo).
2. **Add New… → Project** → find **Thor-EN-Dashboard** → **Import**.
3. Vercel auto-detects **Next.js** — leave Framework Preset / Build Command /
   Output Directory **as detected**. The build command runs
   `npm run build` → `scripts/build.mjs` → `prisma generate` (auto-picking the
   Postgres schema, because `DATABASE_URL` will be a `postgres://` URL) →
   `next build`. Nothing to configure.
4. Open **Environment Variables** and add ALL of these (Environment: *All*):

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon **pooled** URL | ends with `?sslmode=require` |
| `SESSION_SECRET` | long random hex | generated in step 0 |
| `DISCORD_CLIENT_ID` | Application ID | Discord Developer Portal → OAuth2 |
| `DISCORD_CLIENT_SECRET` | Client secret | same page |
| `PUBLIC_ORIGIN` | `https://thormarket.site` | pins OAuth redirects — **no trailing slash** |
| `ADMIN_DISCORD_IDS` | your Discord user ID | auto-grants admin on first login |
| `DASH_API_URL` | tunnel URL from step 5 | e.g. `https://xxxx.trycloudflare.com` |
| `DASH_API_TOKEN` | the token from step 0 | must MATCH the bot's `.env` |
| `DEMO_MODE` | `false` | demo auto-off anyway once OAuth is set |

5. **Deploy**. First build takes a few minutes. The `*.vercel.app` preview URL
   now serves the dashboard (login will fail OAuth until steps 4–5 are done —
   that's expected).

---

## 4. Custom domain `thormarket.site` (Vercel + Domainesia DNS)

### 4a. Add the domain in Vercel

1. Project → **Settings → Domains** → enter `thormarket.site` → **Add**.
2. Also add `www.thormarket.site`, then (when offered) set it to
   **"Redirect to thormarket.site"** so both spellings work.
3. Vercel now displays the exact DNS records it wants — **keep that page
   open** and copy the values EXACTLY as shown (the examples below are the
   usual ones, but Vercel's page is the source of truth):

| Type | Name / Host | Value | TTL |
|---|---|---|---|
| `A` | `@` | `76.76.21.21` | default / 3600 |
| `CNAME` | `www` | `cname.vercel-dns.com` | default / 3600 |

### 4b. Create those records at Domainesia

1. Log in to the Domainesia client area (**https://my.domainesia.com/** — or
   the "Member Area" link on domainesia.id).
2. **Layanan / My Domains → thormarket.site → Kelola DNS / DNS Management**.
3. Add the two records from the table above (Domainesia's panel usually
   pre-fills the domain for `@`/apex — enter exactly the values Vercel
   showed; delete any conflicting default `A`/`CNAME` records for `@` or
   `www` first, e.g. a parking-page record).
4. Save. DNS propagation usually takes **5 minutes – 1 hour** (rarely up to
   24h for some resolvers). Vercel's Domains page flips to
   **"Valid Configuration"** automatically once the records resolve.
5. Vercel then issues the **HTTPS certificate** for you automatically —
   nothing to buy or configure.

> If Domainesia's panel shows the domain using **custom/other nameservers**
> (not Domainesia's own), the DNS records must be added at that other DNS
> provider instead — the record values stay the same.

---

## 5. Expose the bot's DASH API (the bridge)

The dashboard on Vercel calls the bot's DASH API over the public internet.
The bot on Termux is behind NAT — give it a public HTTPS URL with a
**cloudflared quick tunnel** (free, no Cloudflare account, no DNS changes):

1. On the **bot's host** (Termux), install cloudflared:
   ```bash
   pkg install cloudflared      # Termux
   # (on a Linux VPS: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
   ```
2. Make sure the bot's `.env` has the DASH API enabled with the token from
   step 0 (defaults are fine — the API stays bound to localhost, which is
   SAFE: only the tunnel can reach it):
   ```bash
   DASH_API_HOST=127.0.0.1
   DASH_API_PORT=8788
   DASH_API_TOKEN=<the-same-random-token>
   ```
3. Start the tunnel:
   ```bash
   cloudflared tunnel --url http://127.0.0.1:8788
   ```
   It prints something like:
   `https://random-words-here.trycloudflare.com`
4. Put that URL into Vercel → Settings → Environment Variables →
   `DASH_API_URL` (no trailing slash), then **Redeploy** the project
   (Deployments → ⋯ → Redeploy) so the new value is picked up.
5. Keep the tunnel running (`termux-wake-lock` helps). Consider a `tmux`
   session or pm2 so both bot and tunnel survive.

> ⚠️ **Quick-tunnel URLs change when the tunnel restarts.** If the bot URL
> changes, update `DASH_API_URL` in Vercel + Redeploy. For a permanent URL,
> run the bot on a VPS behind a fixed hostname instead.
> The tunnel is public, but every DASH API request requires the
> `DASH_API_TOKEN` — never remove that token, and keep it long and random.

---

## 6. Register the OAuth2 redirect URI (Discord)

1. **https://discord.com/developers/applications** → your application →
   **OAuth2**.
2. **Redirects → Add Redirect**:
   ```
   https://thormarket.site/api/auth/discord/callback
   ```
   (keep your existing localhost redirect for development).
3. **Save Changes** — the exact URI is shown on the dashboard's login page
   (the "Bot owner setup" box) whenever you're unsure.

---

## 7. Verify — the 5-point checklist

Open **https://thormarket.site** and confirm, in order:

1. ✅ The login page loads over HTTPS (certificate OK).
2. ✅ "Login with Discord" redirects to Discord and back — no
   `invalid redirect_uri` error (step 6 done + `PUBLIC_ORIGIN` correct).
3. ✅ After login you land on the dashboard with your servers listed
   (`DATABASE_URL` + Neon working).
4. ✅ The header shows the **bot as Online** (tunnel + `DASH_API_TOKEN`
   match — step 5).
5. ✅ You have admin rights (`ADMIN_DISCORD_IDS` correct).

---

## Troubleshooting

| Symptom | Cause → Fix |
|---|---|
| Build fails: `Error: datasource url must start with file:` | `DATABASE_URL` missing/SQLite-shaped in Vercel → set the Neon pooled URL, redeploy. |
| Build fails during `prisma generate` | Schema drift — `prisma/schema.postgres.prisma` must mirror `schema.prisma`. |
| Deploy OK, but page "reverts to demo login" | `DISCORD_CLIENT_ID`/`SECRET` not set in Vercel (or app redeploys without them). |
| OAuth error `invalid redirect_uri` | URI not saved in the Developer Portal, or `PUBLIC_ORIGIN` mismatch/trailing slash. |
| Login works, servers list empty | Discord OAuth scopes — re-login once; check the User row exists in Neon. |
| Everything loads but "Bot offline" banner | Tunnel down (restart cloudflared), wrong `DASH_API_URL`, or token mismatch with the bot's `.env`. |
| Randomly logged out | `SESSION_SECRET` changed/missing — set it once and never rotate casually. |
| Domain stuck on "Invalid Configuration" | DNS not propagated yet — wait, then recheck the records at Domainesia. |
| `502/504` from the tunnel | Bot not running or DASH API port changed — check the bot is up on 8788. |

---

## Security notes

- **Never** commit `.env` files; Vercel env vars are the single source of
  truth in production.
- `DASH_API_TOKEN` is the only thing standing between the public tunnel and
  your bot's config API — keep it long, random, and identical on both sides.
- Rotate `SESSION_SECRET` only when you accept that all users re-login.
- If you used a personal access token to push these repos from a machine,
  **revoke it** on GitHub when finished (Settings → Developer settings →
  Tokens).

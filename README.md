# 🌐 Thor-EN-Dashboard — Web Dashboard for the Thor Discord Bot

The **standalone web dashboard repository** for the **Thor** Discord bot — configure every bot feature straight from your browser, no commands needed. The bot itself lives in the separate **[Thor-EN](https://github.com/dwisetyabudi15581/Thor-EN)** repository; this repository was **cut & moved** out of it in **v4.1.0** (repository split) and is fully self-contained: its own `package.json` (**web-only dependencies — no discord.js, no bot handlers**), its own `.env` (`DATABASE_URL`, OAuth, session secret), its own CI and pm2 app.

> **v4.1.0** · 22 configuration modules · Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui + Prisma (SQLite) · Node.js 20+
>
> 🤖 **Bot repository: [Thor-EN](https://github.com/dwisetyabudi15581/Thor-EN)** · 📜 **Full project changelog (v3.x–v4.1.0): [Thor-EN/CHANGELOG.md](https://github.com/dwisetyabudi15581/Thor-EN/blob/main/CHANGELOG.md)** · 🚀 **Production guide: [Thor-EN/DEPLOY.md](https://github.com/dwisetyabudi15581/Thor-EN/blob/main/DEPLOY.md)**

## How It Works

```
Browser ──> Next.js Dashboard :3000 (this repo — Discord OAuth2 login)
                │  3-tier access: Admin / Staff / Member (same resolver as the bot)
                ▼
           Thor bot DASH API (http://127.0.0.1:8788, secret token)   ← the Thor-EN repo
                │  business validation stays inside the bot
                ▼
           bot's data/ (config/<guildId>.json + managers)  ← ONE data source
```

- **Two ways to control the bot**: slash commands right inside Discord **or** this web dashboard — both write to the SAME single data source (the bot's persistence, reached through the DASH API), so they never conflict.
- **Live two-way sync** — the dashboard auto-refreshes every 15 s (member joins, channel/role deletions and guild changes surface automatically); every save applies to the running bot instantly (hot-apply, no restart).
- **Access is enforced by the same 3-tier resolver the bot uses** — Super Admin sees everything, Staff get the moderation pack, Members see their own read-only profile. Users only reach servers where they hold the Owner / **Manage Server** permission or a staff/member role granted by the bot.
- **Every write is validated by the bot** (section whitelist + types + anti prototype pollution) and records who the actor was (audit).
- `DATABASE_URL` (this repo) stores only the dashboard's own login users — the bot's data stays in the bot repository. The **only** values that must match between the two repositories' `.env` files are the `DASH_API_*` pair.

## Features

- **Discord login (OAuth2)** — sign in with your Discord account, no password
- **Server picker** — every server you can reach, with Admin/Staff/Member tier badges + bot status
- **Discord-style dark UI** — live status header (online/ping/guild count), sidebar server switcher + profile card, Overview with summary cards and **instant module quick-toggles** (Auto-Mod, Welcome, Economy, Auto-Role)
- **Pixel-honest live previews** — the welcome/goodbye embed and the embed builder render exactly as Discord will show them, before you save
- **22 configuration modules**: **Quick Start** (a 6-step server setup checklist), Overview, General, Tickets & Products, AutoMod, Leveling, Middleman, Auto-Responder, Self-Roles, Announcements, Temp Voice, Server Stats, Command Manager (enable/disable each slash command per server), **Custom Command** (build your own slash command on the web → automatically registered on Discord), **Embed Builder** (full builder + live preview), Backup, Moderation (warn + modlog), VIP Keys, Giveaway, Poll, **Access Control** (the 3-tier admin/staff grant table), and the member profile view
- **Direct CRUD** — add/remove responders, self-role panels, and scheduled announcements without restarting the bot
- **Bot invite** — invite button with least-privilege permissions

## Running

This repository is self-contained:

```bash
git clone https://github.com/dwisetyabudi15581/Thor-EN-Dashboard.git
cd Thor-EN-Dashboard
./setup.sh          # npm install + prisma generate + .env from the example
npm run build
npm run start       # :3000
```

Or by hand:

```bash
npm install
npx prisma generate
cp .env.example .env      # then fill it in (see the table below)
npm run build
npm run start             # :3000
```

> Without the bot running (start it from the **Thor-EN** repository), the dashboard still works but shows a "Bot offline" banner. To try the UI without the bot at all: `npm run mock` (a fake DASH API with demo data on 127.0.0.1:8788).
>
> 24/7 production (pm2): `pm2 start ecosystem.config.cjs` — app name `thor-dash`. Full guide: [Thor-EN/DEPLOY.md](https://github.com/dwisetyabudi15581/Thor-EN/blob/main/DEPLOY.md).

### Production on Vercel (free, with your own domain)

The dashboard deploys natively to **Vercel** (Next.js + serverless): import the repo,
set the environment variables, attach the domain — done. Two things change in that world:

- **Database:** SQLite cannot persist on serverless hosting → `DATABASE_URL` becomes a
  cloud **Postgres** URL (Neon free tier). The build/db scripts detect a `postgres://`
  URL and automatically switch to `prisma/schema.postgres.prisma` — local SQLite dev is
  unaffected.
- **Bot bridge:** the dashboard on Vercel can no longer reach `127.0.0.1` → the bot's
  DASH API is exposed through a public **cloudflared tunnel** on the bot's host.

Full step-by-step (Neon → Vercel → domain DNS → OAuth redirect → tunnel → checklist):
**[DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md)**

### Important variables (`.env`)

| Variable                                      | Description                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | SQLite (`file:db/custom.db`) locally, or a cloud Postgres URL on Vercel — see [DEPLOY-VERCEL.md](./DEPLOY-VERCEL.md) |
| `SESSION_SECRET`                              | Random string (`openssl rand -hex 32`)                                                              |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | OAuth2 from the Developer Portal (same application as the bot)                                      |
| `PUBLIC_ORIGIN`                               | Production domain, e.g. `https://thor.yourdomain.com`                                               |
| `ADMIN_DISCORD_IDS`                           | Discord IDs (comma-separated) that become admins                                                    |
| `DASH_API_URL` / `DASH_API_TOKEN`             | Must MATCH the Thor-EN bot repository's `.env` — the only coupling point with the bot               |

The OAuth redirect URI to register in the Developer Portal (built from `PUBLIC_ORIGIN`):
`https://<dashboard-domain>/api/auth/discord/callback`

## Development

| Script                 | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `npm run dev`          | Dev server (next dev, hot-reload)                                  |
| `npm run build`        | Production build (prisma generate + next build)                    |
| `npm run start`        | Start the production server (:3000)                                |
| `npm run mock`         | Fake DASH API with demo data — explore the UI without the bot      |
| `npm run lint`         | ESLint check                                                       |
| `npm run db:push`      | Apply the Prisma schema (SQLite locally; auto-switches to the Postgres schema for `postgres://` URLs) |
| `npm run db:studio`    | Prisma Studio (browse the users table)                             |

CI (GitHub Actions) runs the production build on every push (Node 22).

## License

MIT — see [LICENSE](./LICENSE). The bot repository ([Thor-EN](https://github.com/dwisetyabudi15581/Thor-EN)) carries the project's full changelog and admin documentation.

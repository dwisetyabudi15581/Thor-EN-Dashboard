# Changelog

All notable changes to this repository are documented in this file. Format based on [Keep a Changelog](https://keepachangelog.com/id/1.1.0/).

Legend: 🔴 critical · 🟠 high · 🟡 medium · 🟢 improvement

> **History note.** This repository was born in **v4.1.0**, when the Thor-EN project was split into two separate repositories (CUT & MOVE — no cloning). The FULL project history (v3.9.0 – v4.1.0, including every change that shaped this dashboard before the split) lives in the [Thor-EN bot repository's CHANGELOG](https://github.com/dwisetyabudi15581/Thor-EN/blob/main/CHANGELOG.md).

## [4.1.0] — 2026-09-23

### Born — 🏗️ REPOSITORY SPLIT: THE DASHBOARD BECOMES ITS OWN REPOSITORY

Per the owner's directive, the web dashboard was **cut & moved** out of the Thor-EN repository (where it lived as the `dashboard/` module since the project began) into this standalone repository — **Thor-EN-Dashboard**. The move was a physical `mv` of the entire folder: zero copies, zero duplication, zero changes to feature logic, routes, components, or the Prisma schema. The dashboard's file history up to the split remains visible in the Thor-EN repository's git history; from v4.1.0 onward it is tracked here.

- 🟠 **Self-contained web repository.** Its `package.json` carries **web-only dependencies** (next, react, tailwind, prisma, lucide-react, radix, framer-motion, typescript — **no discord.js, no bot handlers**), exactly as specified. Installs, builds, and runs standalone: `npm install && npx prisma generate && cp .env.example .env && npm run build && npm run start`.
- 🟠 **Connection to the bot = the DASH API only.** The dashboard reaches the Discord bot (the separate [Thor-EN](https://github.com/dwisetyabudi15581/Thor-EN) repository) exclusively through `DASH_API_URL` + `DASH_API_TOKEN` (HTTP, localhost :8788 by default) — the token must be **exactly the same** in both repositories' `.env` files. `DATABASE_URL` (SQLite, `file:db/custom.db`) remains this repo's own store for dashboard login users (Discord OAuth mapping) — the bot's server data stays in the bot repository, so the two can never conflict.
- 🟡 **New repo scaffolding.** `README.md` rewritten for the standalone repo (architecture diagram across the two repos, run/dev scripts, env table, pm2), a fresh `CHANGELOG.md` (this file), `LICENSE` (MIT — same holder as Thor-EN), `setup.sh` (Node ≥ 20 check, install, prisma generate, `.env` from the example), `ecosystem.config.cjs` (pm2 app **thor-dash**), and `.github/workflows/ci.yml` (production build on Node 22, ported from the old monorepo CI's dashboard job).
- 🟢 **Docs cross-links updated.** `.env.example` header and inline notes now point to the Thor-EN bot repository (was: `../bot/.env`); the welcome-preview code comment now cites the bot repo for the mirrored builder; README links to the Thor-EN repo's CHANGELOG and DEPLOY guide.

**Compatibility:** byte-identical to the v4.0.0 `dashboard/` module — same endpoints, same UI, same Prisma schema, same smoke/mock scripts. Existing installs copy their `dashboard/db/custom.db` and `.env` into this repository and run as before (exact steps in the Thor-EN repo's DEPLOY.md, section "Migrating to the v4.1.0 layout"). Version: 4.0.0 → **4.1.0** (in lockstep with the Thor-EN bot repository).

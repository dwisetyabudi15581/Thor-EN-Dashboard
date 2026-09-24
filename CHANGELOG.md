# Changelog

All notable changes to this repository are documented in this file. Format based on [Keep a Changelog](https://keepachangelog.com/id/1.1.0/).

Legend: 🔴 critical · 🟠 high · 🟡 medium · 🟢 improvement

> **History note.** This repository was born in **v4.1.0**, when the Thor-EN project was split into two separate repositories (CUT & MOVE — no cloning). The FULL project history (v3.9.0 – v4.1.0, including every change that shaped this dashboard before the split) lives in the [Thor-EN bot repository's CHANGELOG](https://github.com/dwisetyabudi15581/Thor-EN/blob/main/CHANGELOG.md).

## [4.5.0] — 2026-09-24

### 🗑️ CHRONOS PARITY (TAHAP 3, SISI DASHBOARD): MODUL AUTO-ROLE DIHAPUS · PENANDA UNVERIFIED KLASIK DIPULIHKAN

Mengikuti bot **v4.3.0** (owner: *"Auto rolenya delete saja soalnya ga terlalu butuh samain kaya di CHRONOS"*): seluruh UI join auto-role dihapus dan digantikan penanda klasik — **satu role**, diberikan saat join, hilang otomatis saat member verifikasi.

- 🔴 **Modul General: editor "Auto-Role on Join" DIHAPUS** (chips list + picker + toggle "remove on a new role"). Penggantinya: field **"Unverified Role (new-member marker)"** di bagian Key Roles — kembaran `/set-role tipe:unverified`, satu picker role, tanpa list/toggle. Draft/wire split khusus autorole (`setAutoroleRoleIds`) ikut dihapus — tidak lagi dibutuhkan karena `roles.unverified` adalah path config biasa.
- 🔴 **Quick Start: Step 2 "Auto-Role on Join" → "Unverified Role (new-member marker)"** — dropdown role + field ID manual → apply langsung (`roles.unverified`), dengan catatan memasangkannya dengan panel verifikasi. Progress 6 langkah tetap, `done` key berganti `unverified`.
- 🟠 **Overview: Quick Toggle "Auto-Role on Join" → "Unverified Marker"** — flip ON memunculkan picker role (apply instan `roles.unverified`), OFF menghapus dengan konfirmasi + restore satu-klik pada kunjungan yang sama. Status label menampilkan nama role + "removed on verify".
- 🟡 **Tipe `GuildConfig.autorole` dihapus dari `bot-api.ts`** (v4.3.0 bot menghapus section-nya + membersihkan config lama saat load). Landing page: kartu fitur "Auto-Role" menjadi "Verification" (tombol verifikasi satu arah + penanda klasik).
- 🟢 **Catatan versi bot minimum**: butuh bot **v4.3.0+** (`roles.unverified` diterima API; `PUT autorole` dijawab 422 "Unknown section"). Bot v4.2.x + dashboard v4.5.0 = field Verified tetap jalan, editor Unverified tersimpan tanpa efek sampai bot di-update.

**Compatibility:** kontrak API tidak berubah bentuk — hanya section `autorole` yang hilang (bot lama tetap aman dipakai; toggle/hint yang menyentuhnya sudah bersih). Versi: 4.4.0 → **4.5.0**.

## [4.4.0] — 2026-09-24

### 🌐 CHRONOS PARITY (TAHAP 2, SISI DASHBOARD): VERIFIKASI DIATUR PENUH DARI WEB

Melengkapi bot v4.2.0/v4.2.1 (verifikasi klasik dipulihkan + DASH API `PUT selfroles` menerima `roles`): dashboard kini punya kembaran lengkap kedua command klasik itu.

- 🟠 **Restyle tombol verifikasi dari web** (modul Self Roles): saat panel verifikasi terpasang, kartu ✅ Verification kini menampilkan **tombol live** (emoji · label · style saat ini) + tombol **"Restyle button"** — form Label / Emoji / Style (Blue/Gray/Green/Red) yang tersimpan via `PUT selfroles/:id` dengan array `roles`, dan panel di Discord **langsung ter-render ulang**. Kembaran `/set-verify-button`: ganti tampilan tanpa hapus + pasang ulang; role target tombol tidak pernah berubah. Validasi client (label 1–80, emoji ≤64) + validasi ulang di bot (400 presisi).
- 🟡 **Field "Verified Role" di modul General** (bagian Key Roles): set/hapus `roles.verified` langsung dari web — kembaran `/set-role verified`. Catatan di hint: selama terisi, ticket & escrow hanya menerima member terverifikasi.
- 🟢 **Catatan versi bot minimum**: restyle tombol butuh bot **v4.2.1+** (field `roles` di PUT selfroles). Bot lama menolak dengan pesan 400 yang jelas — tidak ada crash, hanya toast error.

**Compatibility:** tidak ada perubahan kontrak API; hanya field body baru yang opsional. Versi: 4.3.1 → **4.4.0**.

## [4.3.1] — 2026-09-24

### 🔧 Invite button fix — a blank NEXT_PUBLIC_INVITE_URL opened a duplicate tab

**Symptom (production):** clicking **Invite** on the Server Picker opened a new tab showing the dashboard itself (a duplicate of the current page) instead of the Discord authorization flow.

- 🔴 **Root cause: `config.ts` used `??` for `NEXT_PUBLIC_INVITE_URL`.** An env var that was *created but left blank* in Vercel resolves to the empty string — which is **not** `undefined`, so the nullish-coalescing operator did NOT fall back to the built-in invite URL. The API then shipped `inviteUrl: ""`, and `<a href="" target="_blank">` resolves to the *current* page URL — hence the duplicate tab. Fixed by routing the value through the existing `envOr()` helper (empty/whitespace string ⇒ fallback), the same convention every other env value in `config.ts` already follows.
- 🟡 **Belt-and-suspenders in `app/page.tsx`:** the Invite anchor now uses `data?.inviteUrl || "#"` (logical OR, catching empty strings too) instead of `??` — even a future regression in the API can no longer produce a self-duplicating link.
- 🟢 **Verified before shipping:** the default URL's `client_id` resolves to the real public "Thor" application (`bot_public: true`, scopes `bot+applications.commands`) — the link is valid as-is.

**Compatibility:** no API/route/schema changes. If you had set `NEXT_PUBLIC_INVITE_URL` in Vercel, it may now be deleted — the built-in default is correct. Version: 4.3.0 → **4.3.1**.

## [4.3.0] — 2026-09-23

### ⚡ Response caching — dashboard latency over the cloudflared tunnel

Production measured the full chain (browser → Vercel HKG → Cloudflare tunnel → the bot on a phone over mobile data) at ~0.3–1s per bot round trip, and the UI polls `/api/bot-status` every 15s in step with data auto-refresh — so the same rarely-changing data was re-fetched over the tunnel again and again. This release adds a server-side response cache so most reads now answer in ~0ms without touching the tunnel, while writes stay always-fresh.

- 🟠 **TTL cache + single-flight in `bot-api.ts`.** GETs to the DASH API now flow through a cache layer: `/health` (10s), the bot's `/guilds` list (20s), and per-user `/users/{id}/guilds` membership (30s) are TTL-cached; concurrent identical GETs share ONE in-flight request (single-flight) instead of queuing separate tunnel round trips; and a `BotOfflineError` is negative-cached for 4s so the 15s poll cannot hammer the tunnel while the bot is down. Mutations (POST/PUT/DELETE) bypass the cache and CLEAR it on success — the read after a save always reflects the just-written state. The cache lives in module memory (per serverless instance, bounded at 200 keys) — no external state, no invalidation coordination needed.
- 🟡 **Per-user cache for the OAuth guild list (`discord-guilds.ts`).** `getManageableGuilds` hit Discord REST (+ possible token refresh) on every `/api/guilds` call; ok:true results are now cached 30s per user. Only successful results are cached — error reasons (`no-token` / `relogin`) surface immediately.
- 🟢 **Zero API changes.** Same routes, same response shapes, same `.env` — the cache is invisible to the UI. Users on localhost/VPS get the same benefit when the dashboard and bot talk over a real network.

**Compatibility:** no schema, route, or UI changes — server internals only. Local SQLite workflows unaffected. Version: 4.2.0 → **4.3.0**.

## [4.2.0] — 2026-09-23

### 🚀 Vercel-ready — deploy the dashboard to the cloud with your own domain

Prepared the repository for production hosting on **Vercel** (serverless Next.js) with the owner's domain `thormarket.site` (registrar: Domainesia). The dashboard deploys natively — no `vercel.json`, no framework adapters — and **local/VPS/Termux workflows are completely unchanged**.

- 🟠 **Postgres support (cloud database).** SQLite cannot persist on serverless hosting (ephemeral filesystem — wiped on every cold start), so the user database must live in the cloud when hosted on Vercel. Added `prisma/schema.postgres.prisma` — the Postgres flavour of the schema (Prisma's provider is a schema literal and cannot be switched via env). `scripts/build.mjs` and `scripts/db.mjs` now detect a `postgres://` DATABASE_URL and automatically pass `--schema prisma/schema.postgres.prisma`; SQLite (unset/`file:` URL) keeps the default schema, so CI, local dev and the VPS flow behave exactly as before.
- 🟠 **DEPLOY-VERCEL.md (new).** The complete production guide: Neon Postgres setup (pooled vs direct connection strings), one-time `db push`, Vercel project import + the full environment-variable table, custom-domain attach with the exact DNS records for Domainesia (A `@` + CNAME `www`), the Discord OAuth2 redirect registration, exposing the bot's DASH API through a cloudflared tunnel, a 5-point verification checklist, a troubleshooting table, and security notes.
- 🟡 **README + `.env.example` updated.** New "Production on Vercel" section (why Postgres, why the tunnel, link to the guide); the env template now documents both DATABASE_URL shapes (SQLite local / Postgres cloud), the `PUBLIC_ORIGIN=https://thormarket.site` example, and the tunnel form of `DASH_API_URL`.
- 🟢 **Bridge note made explicit.** On Vercel the dashboard can no longer reach `127.0.0.1` — the bot's DASH API (Thor-EN repo, default `127.0.0.1:8788`) is reached through a public cloudflared tunnel while still being protected by the shared `DASH_API_TOKEN`. The bot itself NEVER runs on Vercel (long-running process) — only the dashboard does.

**Compatibility:** zero changes to app code, routes, or UI — only build/tooling scripts gained an automatic Postgres branch, plus new docs. SQLite users: nothing to do. Version: 4.1.0 → **4.2.0**.

## [4.1.0] — 2026-09-23

### Born — 🏗️ REPOSITORY SPLIT: THE DASHBOARD BECOMES ITS OWN REPOSITORY

Per the owner's directive, the web dashboard was **cut & moved** out of the Thor-EN repository (where it lived as the `dashboard/` module since the project began) into this standalone repository — **Thor-EN-Dashboard**. The move was a physical `mv` of the entire folder: zero copies, zero duplication, zero changes to feature logic, routes, components, or the Prisma schema. The dashboard's file history up to the split remains visible in the Thor-EN repository's git history; from v4.1.0 onward it is tracked here.

- 🟠 **Self-contained web repository.** Its `package.json` carries **web-only dependencies** (next, react, tailwind, prisma, lucide-react, radix, framer-motion, typescript — **no discord.js, no bot handlers**), exactly as specified. Installs, builds, and runs standalone: `npm install && npx prisma generate && cp .env.example .env && npm run build && npm run start`.
- 🟠 **Connection to the bot = the DASH API only.** The dashboard reaches the Discord bot (the separate [Thor-EN](https://github.com/dwisetyabudi15581/Thor-EN) repository) exclusively through `DASH_API_URL` + `DASH_API_TOKEN` (HTTP, localhost :8788 by default) — the token must be **exactly the same** in both repositories' `.env` files. `DATABASE_URL` (SQLite, `file:db/custom.db`) remains this repo's own store for dashboard login users (Discord OAuth mapping) — the bot's server data stays in the bot repository, so the two can never conflict.
- 🟡 **New repo scaffolding.** `README.md` rewritten for the standalone repo (architecture diagram across the two repos, run/dev scripts, env table, pm2), a fresh `CHANGELOG.md` (this file), `LICENSE` (MIT — same holder as Thor-EN), `setup.sh` (Node ≥ 20 check, install, prisma generate, `.env` from the example), `ecosystem.config.cjs` (pm2 app **thor-dash**), and `.github/workflows/ci.yml` (production build on Node 22, ported from the old monorepo CI's dashboard job).
- 🟢 **Docs cross-links updated.** `.env.example` header and inline notes now point to the Thor-EN bot repository (was: `../bot/.env`); the welcome-preview code comment now cites the bot repo for the mirrored builder; README links to the Thor-EN repo's CHANGELOG and DEPLOY guide.

**Compatibility:** byte-identical to the v4.0.0 `dashboard/` module — same endpoints, same UI, same Prisma schema, same smoke/mock scripts. Existing installs copy their `dashboard/db/custom.db` and `.env` into this repository and run as before (exact steps in the Thor-EN repo's DEPLOY.md, section "Migrating to the v4.1.0 layout"). Version: 4.0.0 → **4.1.0** (in lockstep with the Thor-EN bot repository).

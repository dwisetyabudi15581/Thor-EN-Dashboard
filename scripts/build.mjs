#!/usr/bin/env node
/**
 * build.mjs — portable production build of the dashboard.
 *
 * Replaces the old shell script
 * (`prisma generate && next build && cp -r .next/static ... && cp -r public ...`)
 * for two reasons:
 *   1. Android/Termux: Turbopack (the Next 16 default builder) needs native
 *      binaries that are not available for android/arm64 — there the build
 *      MUST use `--webpack` (official advice from Next.js: "use Webpack
 *      instead").
 *   2. `cp -r` only works in a Unix shell — replaced with plain fs.cpSync.
 *
 * Steps (identical to the old script on Linux/VPS):
 *   prisma generate → next build → copy .next/static + public into
 *   .next/standalone/ so `npm run start` (standalone server.js) is ready.
 */
import { execSync } from "node:child_process";
import { cpSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const isAndroid = process.platform === "android";

// Put node_modules/.bin first so `node scripts/build.mjs` (without npm run)
// still finds the prisma/next binaries.
const PATH = `${path.join(root, "node_modules", ".bin")}${path.delimiter}${process.env.PATH ?? ""}`;

function run(command) {
  console.log(`\n$ ${command}`);
  execSync(command, { stdio: "inherit", cwd: root, env: { ...process.env, PATH } });
}

// v4.2.0 — Postgres (cloud hosting: Vercel + Neon/Supabase): when
// DATABASE_URL is a postgres:// URL the client MUST be generated from the
// Postgres flavour of the schema (prisma/schema.postgres.prisma) — a client
// generated from the SQLite schema cannot talk to Postgres. SQLite stays the
// default (unset/empty/file: URL) so CI and local/VPS dev are unchanged.
const rawDbUrl = process.env.DATABASE_URL ?? "";
const usePostgres =
  /^postgres(ql)?:\/\//.test(rawDbUrl) || rawDbUrl.startsWith("postgres:");
if (usePostgres) {
  console.log("Postgres DATABASE_URL detected — generating the client from prisma/schema.postgres.prisma");
}

run(
  usePostgres
    ? "prisma generate --schema prisma/schema.postgres.prisma"
    : "prisma generate",
);

if (isAndroid) {
  console.log("Android (Termux) detected — building with Webpack (Turbopack is unavailable on Android).");
  run("next build --webpack");
} else {
  run("next build");
}

const nextDir = path.join(root, ".next");
const standalone = path.join(nextDir, "standalone");
cpSync(path.join(nextDir, "static"), path.join(standalone, ".next", "static"), { recursive: true, force: true });
cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true, force: true });

console.log("\nBuild complete — dashboard/.next/standalone/server.js is ready to run.");

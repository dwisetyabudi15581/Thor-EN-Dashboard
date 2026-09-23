// DASH API client — the bridge between the Next.js dashboard and the Thor
// bot (v3.16.0, ).
//
// The bot runs a small HTTP API (src/infra/dashServer.js, default
// 127.0.0.1:8788). The dashboard NEVER writes bot files directly — every
// read/write goes through here so that:
//   1. Business validation stays in ONE place (inside the bot — shared with
//      slash commands); rules can never diverge between web vs Discord.
//   2. Hot-reload: the bot reads fresh config per operation; changes from
//      the web take effect immediately, no restart.
//   3. The secret DASH_API_TOKEN never leaves the server.

import { cfg } from "./config";

export class BotOfflineError extends Error {
  constructor(message = "The bot is not connected.") {
    super(message);
    this.name = "BotOfflineError";
  }
}

export class BotApiError extends Error {
  status: number;
  details?: string[];

  constructor(message: string, status: number, details?: string[]) {
    super(message);
    this.name = "BotApiError";
    this.status = status;
    this.details = details;
  }
}

type BotApiOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
};

// ----------------------------------------------------------------------------
// v4.3.0: response cache + single-flight for GET calls.
//
// WHY: in the production topology (Vercel → cloudflared tunnel → the bot on
// the owner's phone) every botApi() GET is a ~0.3–1s round trip over a mobile
// link. The UI polls /api/bot-status every 15s AND auto-refreshes data in
// step with it, so the same endpoints were re-fetched over the tunnel again
// and again. Three mechanisms, all server-side only (the browser never sees
// stale data older than the TTLs below):
//   1. TTL cache for rarely-changing reads (/health, /guilds, user guild
//      lists) — a cache HIT answers in ~0ms without touching the tunnel.
//   2. Single-flight: concurrent identical GETs (e.g. /health from
//      /api/bot-status and /api/guilds firing together) share ONE in-flight
//      request instead of queuing two tunnel round trips.
//   3. Negative cache: a BotOfflineError is remembered for a few seconds so
//      a poll storm cannot hammer the tunnel while the bot is down.
// Mutations (POST/PUT/DELETE) bypass the cache and CLEAR it on success — a
// successful write means every cached read is now stale, so the next read
// always reflects the just-saved state. The cache is per serverless
// instance (module memory) — safe by construction, bounded by CACHE_MAX_KEYS.
// ----------------------------------------------------------------------------

const CACHE_TTL_MS = {
  /** Bot health — polled every 15s; pingMs/uptime are cosmetic, 10s staleness is invisible. */
  health: 10_000,
  /** The bot's guild list — changes only when the bot joins/leaves a server. */
  botGuilds: 20_000,
  /** Per-user guild membership (RBAC tiers) — changes only on role/leave events. */
  userGuilds: 30_000,
  /** How long a BotOfflineError is replayed before retrying the tunnel. */
  offline: 4_000,
} as const;

const CACHE_MAX_KEYS = 200;

type CachedRead =
  | { kind: "value"; expiresAt: number; value: unknown }
  | { kind: "offline"; expiresAt: number };

const valueCache = new Map<string, CachedRead>();
const inflight = new Map<string, Promise<unknown>>();

/** Which GET paths are TTL-cacheable, and for how long. null = not cached. */
function cacheKeyFor(pathname: string): { key: string; ttlMs: number } | null {
  if (pathname === "/health") return { key: pathname, ttlMs: CACHE_TTL_MS.health };
  if (pathname === "/guilds") return { key: pathname, ttlMs: CACHE_TTL_MS.botGuilds };
  if (/^\/users\/[^/]+\/guilds$/.test(pathname)) return { key: pathname, ttlMs: CACHE_TTL_MS.userGuilds };
  return null;
}

function pruneValueCache(): void {
  if (valueCache.size <= CACHE_MAX_KEYS) return;
  const now = Date.now();
  for (const [k, entry] of valueCache) {
    if (entry.expiresAt <= now) valueCache.delete(k);
  }
  if (valueCache.size > CACHE_MAX_KEYS) valueCache.clear(); // hard cap fallback
}

/** The raw single call — the pre-v4.3.0 botApi body, unchanged. */
async function rawBotApi<T>(
  pathname: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body: unknown,
  timeoutMs: number
): Promise<T> {
  // v3.28.3: an unconfigured DASH_API_URL makes fetch() throw a cryptic
  // "Failed to parse URL" — classify it as offline up front (the same state
  // the rest of the code already handles gracefully).
  if (!cfg.dashApiUrl) throw new BotOfflineError();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.dashApiUrl}${pathname}`, {
      method,
      headers: {
        "x-dash-token": cfg.dashApiToken,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await res.text();
    const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!res.ok) {
      const message = typeof data.error === "string" ? data.error : `Bot API error ${res.status}`;
      throw new BotApiError(message, res.status, Array.isArray(data.details) ? (data.details as string[]) : undefined);
    }
    return data as T;
  } catch (err) {
    if (err instanceof BotApiError) throw err;
    // v3.28.3: classify offline by the error's STRUCTURE (cause code / abort
    // name / offline message), not just fragile message substrings — an
    // unexpected message shape (e.g. "Failed to parse URL from /health") must
    // not leak an internal error to the browser when the bot is simply down.
    const causeCode = (err as { cause?: { code?: string } })?.cause?.code;
    // v3.30.0: catch variables are `unknown` — read the name via a typed cast
    // instead of `err?.name` (a stray tsc --noEmit error that had been living
    // here since v3.28.3; Next's bundler never surfaced it).
    const errName = (err as { name?: string })?.name;
    const isOffline =
      err instanceof BotOfflineError ||
      errName === "AbortError" ||
      causeCode === "ECONNREFUSED" ||
      causeCode === "ENOTFOUND" ||
      causeCode === "ECONNRESET" ||
      causeCode === "ETIMEDOUT" ||
      causeCode === "EHOSTUNREACH" ||
      causeCode === "EAI_AGAIN" ||
      (err instanceof Error &&
        (err.message.includes("fetch failed") ||
          err.message.includes("ECONNREFUSED") ||
          err.message.includes("abort") ||
          err.message.includes("aborted") ||
          err.message.includes("Failed to parse URL")));
    if (isOffline) throw new BotOfflineError();
    throw new BotApiError(err instanceof Error ? err.message : String(err), 500);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call the bot DASH API (v4.3.0 caching wrapper over rawBotApi).
 * GETs: TTL cache + single-flight (see the cache block above for the design).
 * Writes: pass through, then clear the read cache — post-save reads must see
 * the just-written state.
 * Throws BotOfflineError when unreachable.
 */
export async function botApi<T = unknown>(pathname: string, opts: BotApiOptions = {}): Promise<T> {
  const { method = "GET", body, timeoutMs = 8000 } = opts;

  if (method !== "GET" || body !== undefined) {
    const result = await rawBotApi<T>(pathname, method, body, timeoutMs);
    // A successful write invalidates every cached read — bot state changed.
    valueCache.clear();
    return result;
  }

  const cacheable = cacheKeyFor(pathname);
  if (cacheable) {
    pruneValueCache();
    const hit = valueCache.get(cacheable.key);
    if (hit && hit.expiresAt > Date.now()) {
      if (hit.kind === "value") return hit.value as T;
      throw new BotOfflineError(); // negative-cached offline (fresh retry soon)
    }
  }

  // Single-flight: an identical GET already in flight is awaited, not re-fired.
  const existing = inflight.get(pathname);
  if (existing) return existing as Promise<T>;

  const promise = rawBotApi<T>(pathname, "GET", undefined, timeoutMs)
    .then((value) => {
      if (cacheable) {
        valueCache.set(cacheable.key, {
          kind: "value",
          expiresAt: Date.now() + cacheable.ttlMs,
          value,
        });
      }
      return value;
    })
    .catch((err) => {
      if (cacheable && err instanceof BotOfflineError) {
        // Negative cache — replay "offline" for a few seconds instead of
        // hammering the tunnel on every 15s poll while the bot is down.
        valueCache.set(cacheable.key, {
          kind: "offline",
          expiresAt: Date.now() + CACHE_TTL_MS.offline,
        });
      }
      throw err;
    })
    .finally(() => {
      inflight.delete(pathname);
    });

  inflight.set(pathname, promise as Promise<unknown>);
  return promise;
}

/** Check bot health without throwing (for the status banner). */
export async function botHealth(): Promise<{ online: boolean; guildCount?: number; version?: string }> {
  try {
    const data = await botApi<{ ok: boolean; guildCount: number; version: string }>("/health", { timeoutMs: 4000 });
    return { online: true, guildCount: data.guildCount, version: data.version };
  } catch {
    return { online: false };
  }
}

// v3.31.0: live bot health shape consumed by the dashboard header
// (polled via /api/bot-status every 15s, in step with the data auto-refresh).
export type BotStatus = {
  online: boolean;
  pingMs?: number;
  guildCount?: number;
  uptimeSec?: number;
  version?: string;
};

// === Bot data shapes (the subset used by the UI) ===

export type BotGuild = {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number | null;
  ownerId: string | null;
};

export type BotChannel = { id: string; name: string; type: number; position: number };
export type BotRole = { id: string; name: string; color: number; position: number };

export type TicketCategory = {
  id: string;
  label: string;
  emoji: string;
  style: string;
  requiresKey: boolean;
  isDefault?: boolean;
};

export type Product = {
  label: string;
  value: string;
  price: string;
  duration?: string;
  category: string;
  requiresKey: boolean;
  /** v3.19.0: auto-role mapping from /set-product-role — preserved when saved from the web. */
  roleId?: string;
  days?: number;
};

export type LevelRole = { level: number; roleId: string };

export type GuildConfig = {
  roles: Record<string, string | null>;
  channels: Record<string, string | null>;
  messages: Record<string, string>;
  colors: Record<string, number>;
  // v3.22.0: verifyButton REMOVED — verification is now a self-role panel.
  // v3.23.0: the Unverified role concept removed — autorole = the join role
  // list + the removeOnNewRole toggle (join roles removed on another role).
  autorole: { roleIds: string[]; removeOnNewRole: boolean };
  ticketCategories: TicketCategory[];
  leveling: {
    enabled: boolean;
    xpPerMessage: number;
    cooldownMs: number;
    announceLevelUp: boolean;
    levelUpChannel: string | null;
  };
  levelRoles: LevelRole[];
  midman: { feeMode: "percent" | "flat"; feeValue: number; category: string };
  products: Product[];
  // v3.30.0 RBAC: the three-tier access lists (Access Control module /
  // /set-role staff). Absent on older bots — always read via optional access.
  access?: {
    adminRoleIds?: string[];
    staffRoleIds?: string[];
    adminUserIds?: string[];
    staffUserIds?: string[];
  };
};

export type WordRule = { word: string; action: string | null; addedBy?: string; addedAt?: number };

export type AutoModConfig = {
  enabled: boolean;
  spamThreshold: number;
  spamWindowMs: number;
  spamAction: string;
  blockLinks: boolean;
  linkAllowedChannels: string[];
  linkAllowedRoles: string[];
  wordRules: WordRule[];
  exemptWords: string[];
  wordMatchMode: string;
  wordAction: string;
  maxMentions: number;
  mentionAction: string;
};

export type Responder = {
  id: string;
  trigger: string;
  matchMode: string;
  reply: string;
  replyType: string;
  cooldownMs: number;
  useCount?: number;
};

export type SelfRolePanel = {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  title: string;
  description: string;
  type: string;
  exclusive: boolean;
  /** v3.27.0: one-way (verification) panel — clicking only GIVES the role. */
  once?: boolean;
  roles: Array<{ roleId: string; label: string; emoji?: string; description?: string; style?: string }>;
};

export type Announcement = {
  id: string;
  guildId: string;
  channelId: string;
  sendAt: number;
  sent: boolean;
  sentAt: number | null;
  recurring: string | null;
  data: {
    title: string;
    description: string;
    color?: number;
    image?: string | null;
    thumbnail?: string | null;
    mention?: string | null;
    authorId?: string;
    authorTag?: string;
  };
};

// ==== v3.19.0: new modules (Command Manager, Giveaway, Poll, Backup, Moderation, Keys) ====

export type CommandInfo = { name: string; description: string; domain: string; custom?: boolean };

export type CommandsSection = {
  list: CommandInfo[];
  disabled: string[];
  protected: string[];
};

export type Giveaway = {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  prize: string;
  winnersCount: number;
  endsAt: number;
  ended: boolean;
  winnerIds: string[];
  participantIds: string[];
  hostId: string;
  hostTag: string;
  requiredRoleId: string | null;
  createdAt: number;
};

export type Poll = {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string | null;
  question: string;
  options: Array<{ label: string; emoji: string; votes: string[] }>;
  multiple: boolean;
  closed: boolean;
  createdAt: number;
  closedAt: number | null;
  creatorId: string;
  creatorTag: string;
};

export type BackupEntry = { name: string; size: number; fileCount: number; mtime: number };

export type WarnRecord = {
  id: string;
  reason: string;
  warnedBy: string;
  warnedByTag: string;
  guildId: string;
  userId: string;
  createdAt: number;
  actionTaken: string | null;
};

export type ModLogRecord = {
  id: string;
  type: string;
  reason: string;
  durationMs: number | null;
  moderatorId: string;
  moderatorTag: string;
  guildId: string;
  userId: string;
  createdAt: number;
};

export type KeyRecord = {
  id: string;
  key: string;
  userId: string;
  username: string;
  roleId: string;
  productName: string;
  days: number;
  expireAt: number | null;
  createdAt: number;
  guildId: string;
};

// ==== v3.20.0: Custom Commands + full Embed Builder ====

/** Normalized embed def — the same shape the bot uses (embedPayload.js). */
export type EmbedDef = {
  title: string;
  description: string;
  color: number;
  authorName: string;
  authorIconURL: string;
  thumbnail: string;
  image: string;
  footerText: string;
  footerIconURL: string;
  timestamp: boolean;
  fields: Array<{ name: string; value: string; inline: boolean }>;
};

/** Admin-made custom command (created on the web -> real slash command on the server). */
export type CustomCommand = {
  name: string;
  description: string;
  ephemeral: boolean;
  content: string;
  embed: EmbedDef;
  createdBy: string | null;
  createdByTag: string | null;
  createdAt: number;
  updatedAt: number;
  useCount?: number;
};

// ==== v3.21.0: Quick Start — installed ticket panels (checklist status) ====

/** Installed ticket panel (slim shape — no big body; used for the checklist). */
export type TicketPanelInfo = {
  id: string;
  channelId: string;
  messageId: string | null;
  title: string | null;
  categoryIds: string[];
  useDropdown: boolean;
  createdAt: number | null;
  /** v3.28.3: presence flags — which style overrides exist on this panel (values stay bot-side to keep the payload slim). */
  hasBody?: boolean;
  hasColor?: boolean;
  hasImage?: boolean;
  hasThumbnail?: boolean;
  hasFooter?: boolean;
};

export type DashboardPayload = {
  config: GuildConfig;
  automod: AutoModConfig;
  responders: Responder[];
  selfroles: SelfRolePanel[];
  tempvoice: { creatorChannelId: string | null; categoryId: string | null; activeChannels: number } | null;
  announces: Announcement[];
  serverstats: { enabled: boolean; config: unknown };
  commands: CommandsSection;
  giveaways: Giveaway[];
  polls: Poll[];
  backups: BackupEntry[];
  warns: WarnRecord[];
  modlogs: ModLogRecord[];
  keys: KeyRecord[];
  // v3.20.0
  customCommands: CustomCommand[];
  // v3.21.0: installed ticket panels — status of the "install ticket panel" step.
  panels: TicketPanelInfo[];
  // v3.24.0: full feature parity — VIEW data that used to be Discord-only
  // now ships with the payload (read-only; write actions go through their
  // own endpoints). All fields are defensively normalized in GuildDashboard
  // so an older bot (without these fields) never crashes the web UI.
  stats?: StatsSection;
  levelTop?: LevelTopRow[];
  afk?: AfkRow[];
  midmanDeals?: MidmanDealInfo[];
  boosters?: BoostersSection;
  // v3.30.0 RBAC: the caller's tier as resolved by the bot (3=admin full
  // payload, 2=staff moderation subset). Absent = an older bot → treat as 3.
  tier?: number;
};

// v3.30.0 RBAC: the MEMBER tier's personal profile — what a regular member
// sees on the dashboard instead of the server configuration.
export type MemberProfile = {
  tier: 1;
  userId: string;
  tag: string | null;
  joinedAt: number | null;
  boostingSince: number | null;
  stats: { messages: number; vipPurchases: number; totalSpent: number; giveawaysWon: number };
  level: { level: number; xp: number; totalXp: number; xpToNext: number | null; rank: number | null };
  warns: WarnRecord[];
  warnCount: number;
  modlogs: ModLogRecord[];
  afk: { since: number | null; note: string | null } | null;
};

// v3.24.0: server statistics + leaderboards (parity with /stats & /leaderboard).
export type StatsSection = {
  server: {
    totalUsers: number;
    totalMessages: number;
    totalPurchases: number;
    totalRevenue: number;
    totalGiveawaysWon: number;
    /** v3.31.0: total slash-command executions on this server (commandStats). */
    commandsExecuted?: number;
  };
  top: {
    messages: StatRow[];
    purchases: StatRow[];
    spends: StatRow[];
    wins: StatRow[];
  };
};

export type StatRow = { userId: string; value: number };

// v3.24.0: leveling leaderboard (parity with /leaderboard-level).
export type LevelTopRow = { userId: string; level: number; totalXp: number; xp: number };

// v3.24.0: the AFK members list (parity with /afk-list).
export type AfkRow = { userId: string; reason: string; since: number; guildId?: string };

// v3.24.0: active midman deals, slim shape (parity with /midman-deals).
export type MidmanDealInfo = {
  id: string;
  channelId: string;
  state: string;
  stateLabel: string;
  buyerId: string;
  sellerId: string;
  item: string;
  buyerPays: number;
  sellerGets: number;
  fee: number;
  createdAt: number | null;
};

// v3.24.0: live boosters + recent activity (parity with /boosters).
export type BoostersSection = {
  live: Array<{ userId: string; tag: string | null; since: number }>;
  recent: Array<{ userId: string; event: string; at: number; boostedAt?: number | null }>;
};

export type GuildMeta = {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number | null;
  channels: BotChannel[];
  roles: BotRole[];
};

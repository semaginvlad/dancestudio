import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

export function getTelegramEnv() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const session = process.env.TELEGRAM_SESSION;

  if (!apiId || !apiHash || !session) {
    throw new Error("Missing Telegram environment variables");
  }

  return { apiId, apiHash, session };
}

export async function withTelegramClient(run) {
  const { apiId, apiHash, session } = getTelegramEnv();
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    await client.connect();
    return await run(client);
  } finally {
    try {
      await client.disconnect();
    } catch {
      // no-op
    }
  }
}

export function normalizePeerId(entity) {
  if (!entity?.id) return null;
  return String(entity.id);
}

export function getPeerTitle(entity) {
  if (!entity) return "Без назви";
  return (
    entity.title ||
    [entity.firstName, entity.lastName].filter(Boolean).join(" ") ||
    entity.username ||
    "Без назви"
  );
}

const trimAt = (value = "") => String(value || "").replace(/^@+/, "").trim();

const buildIdCandidates = (chatId) => {
  const raw = String(chatId || "").trim();
  if (!raw) return [];
  const out = new Set([raw]);
  const numeric = /^-?\d+$/.test(raw);
  if (!numeric) return Array.from(out);

  const abs = raw.startsWith("-") ? raw.slice(1) : raw;
  out.add(abs);

  if (raw.startsWith("-100")) {
    const channelId = raw.slice(4);
    if (channelId) {
      out.add(channelId);
      out.add(`-${channelId}`);
    }
  } else if (raw.startsWith("-")) {
    out.add(`-100${abs}`);
  } else {
    out.add(`-${abs}`);
    out.add(`-100${abs}`);
  }

  return Array.from(out);
};

const entityIdVariants = (entity) => {
  if (!entity?.id) return [];
  const id = String(entity.id);
  const out = new Set([id]);
  const className = String(entity?.className || "").toLowerCase();
  if (className.includes("channel")) out.add(`-100${id}`);
  if (className.includes("chat")) out.add(`-${id}`);
  return Array.from(out);
};

const isPeerNotFound = (error) => {
  const msg = String(error?.message || error || "").toLowerCase();
  return (
    msg.includes("cannot find any entity corresponding") ||
    msg.includes("no user has") ||
    msg.includes("invalid peer") ||
    msg.includes("could not find the input entity")
  );
};

export async function resolveTelegramPeer(client, { chatId, username, context = "telegram" } = {}) {
  const usernameClean = trimAt(username);
  const chatCandidates = buildIdCandidates(chatId);
  const attempted = [];
  const errors = [];

  if (usernameClean) {
    const usernameCandidates = [`@${usernameClean}`, usernameClean];
    for (const candidate of usernameCandidates) {
      attempted.push(candidate);
      try {
        return await client.getEntity(candidate);
      } catch (error) {
        errors.push(`${candidate}: ${String(error?.message || error)}`);
        if (!isPeerNotFound(error)) break;
      }
    }
  }

  for (const candidate of chatCandidates) {
    attempted.push(candidate);
    try {
      return await client.getEntity(candidate);
    } catch (error) {
      errors.push(`${candidate}: ${String(error?.message || error)}`);
      if (!isPeerNotFound(error)) break;
    }
  }

  if (chatCandidates.length) {
    try {
      const dialogs = await client.getDialogs({ limit: 300 });
      const want = new Set(chatCandidates);
      const found = dialogs
        .map((d) => d?.entity)
        .find((entity) => entityIdVariants(entity).some((v) => want.has(v)));
      if (found) return found;
    } catch (error) {
      errors.push(`dialogs_lookup: ${String(error?.message || error)}`);
    }
  }

  const msg = [
    `[${context}] failed to resolve Telegram peer`,
    `chatId=${chatId ?? ""}`,
    `username=${username ?? ""}`,
    `attempted=${attempted.join(", ") || "none"}`,
    `errors=${errors.join(" | ") || "none"}`,
  ].join("; ");
  throw new Error(msg);
}

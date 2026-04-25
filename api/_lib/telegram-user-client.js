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

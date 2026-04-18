import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const DEFAULT_CONNECTION_RETRIES = 5;

export function getTelegramUserEnv() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const session = process.env.TELEGRAM_SESSION;

  if (!apiId || !apiHash || !session) {
    const error = new Error("Missing Telegram environment variables");
    error.statusCode = 500;
    error.details = {
      hasApiId: Boolean(apiId),
      hasApiHash: Boolean(apiHash),
      hasSession: Boolean(session),
    };
    throw error;
  }

  return { apiId, apiHash, session };
}

export function createTelegramUserClient(options = {}) {
  const { apiId, apiHash, session } = getTelegramUserEnv();

  return new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: DEFAULT_CONNECTION_RETRIES,
    ...options,
  });
}

export async function withTelegramUserClient(handler, options = {}) {
  const client = createTelegramUserClient(options);

  try {
    await client.connect();
    return await handler(client);
  } finally {
    try {
      await client.disconnect();
    } catch {
      // ignore disconnect errors to keep response stable
    }
  }
}

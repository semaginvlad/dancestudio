import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

export function createTelegramUserClient() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const session = process.env.TELEGRAM_SESSION;

  if (!apiId || !apiHash || !session) {
    const error = new Error("Missing Telegram environment variables");
    error.statusCode = 500;
    throw error;
  }

  return new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 5,
  });
}

export async function withTelegramUserClient(handler) {
  const client = createTelegramUserClient();

  try {
    await client.connect();
    return await handler(client);
  } finally {
    try {
      await client.disconnect();
    } catch {
      // ignore disconnect errors
    }
  }
}

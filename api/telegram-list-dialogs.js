import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const apiId = Number(process.env.TELEGRAM_API_ID);
    const apiHash = process.env.TELEGRAM_API_HASH;
    const session = process.env.TELEGRAM_SESSION;

    if (!apiId || !apiHash || !session) {
      return res.status(500).json({ error: "Missing Telegram environment variables" });
    }

    const client = new TelegramClient(
      new StringSession(session),
      apiId,
      apiHash,
      {

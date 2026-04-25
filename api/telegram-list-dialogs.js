import { getPeerTitle, normalizePeerId, withTelegramClient } from "./_lib/telegram-user-client.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const dialogs = await withTelegramClient(async (client) => {
      const rows = await client.getDialogs({ limit: 100 });
      return rows
        .map((d) => {
          const entity = d?.entity;
          const id = normalizePeerId(entity);
          if (!id) return null;

          return {
            id,
            title: getPeerTitle(entity),
            username: entity?.username ? `@${entity.username}` : null,
            unreadCount: Number(d?.unreadCount || 0),
            lastMessageDate: d?.message?.date ? new Date(d.message.date * 1000).toISOString() : null,
            lastMessageText: d?.message?.message || "",
          };
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.lastMessageDate || 0).getTime() - new Date(a.lastMessageDate || 0).getTime());
    });

    return res.status(200).json({ success: true, dialogs, count: dialogs.length });
  } catch (error) {
    console.error("telegram-list-dialogs error:", error);
    return res.status(500).json({
      error: "Failed to list dialogs",
      details: String(error?.message || error),
    });
  }
}

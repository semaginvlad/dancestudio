import { withTelegramUserClient } from "./_lib/telegram-user-client.js";

function sendJsonError(res, status, error, details) {
  return res.status(status).json({
    success: false,
    error,
    ...(details ? { details: String(details) } : {}),
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJsonError(res, 405, "Method not allowed");
  }

  try {
    const payload = await withTelegramUserClient(async (client) => {
      const dialogs = await client.getDialogs({ limit: 100 });
      const result = [];

      for (const d of dialogs) {
        const entity = d?.entity;
        if (!entity || !entity.id) continue;

        const title =
          entity.title ||
          [entity.firstName, entity.lastName].filter(Boolean).join(" ") ||
          entity.username ||
          "Без назви";

        result.push({
          id: String(entity.id),
          title,
          username: entity.username ? `@${entity.username}` : null,
        });
      }

      return {
        success: true,
        count: result.length,
        dialogs: result,
      };
    });

    return res.status(200).json(payload);
  } catch (error) {
    console.error("telegram-list-dialogs error:", error);
    return sendJsonError(
      res,
      error?.statusCode || 500,
      "Failed to list dialogs",
      error?.message || error,
    );
  }
}

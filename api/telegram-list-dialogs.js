import { withTelegramUserClient } from "./_lib/telegram-user-client.js";

function sendJsonError(res, status, error, details) {
  return res.status(status).json({
    success: false,
    error,
    ...(details ? { details: String(details) } : {}),
  });
}

function normalizeDialogActivity(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;

  if (rawValue instanceof Date) {
    return Number.isNaN(rawValue.getTime()) ? null : rawValue.toISOString();
  }

  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    const normalized = rawValue < 1e12 ? rawValue * 1000 : rawValue;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;

    if (/^\d+$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        const normalized = numeric < 1e12 ? numeric * 1000 : numeric;
        const date = new Date(normalized);
        if (!Number.isNaN(date.getTime())) return date.toISOString();
      }
    }

    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  return null;
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
          lastActivityAt: normalizeDialogActivity(
            d?.date || d?.message?.date || d?.dialog?.topMessageDate || d?.dialog?.date || d?.entity?.date,
          ),
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

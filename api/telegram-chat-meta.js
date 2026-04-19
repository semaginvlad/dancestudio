import { createClient } from "@supabase/supabase-js";

function sendJsonError(res, status, error, details) {
  return res.status(status).json({
    success: false,
    error,
    ...(details ? { details: String(details) } : {}),
  });
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error("Missing Supabase server environment variables");
    error.statusCode = 500;
    throw error;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();

    if (req.method === "GET") {
      const rawChatIds = String(req.query.chatIds || "");
      const chatIds = rawChatIds
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

      let query = supabase
        .from("telegram_chat_meta")
        .select("chat_id, is_favorite, needs_reply, internal_note, updated_at")
        .order("updated_at", { ascending: false });

      if (chatIds.length > 0) {
        query = query.in("chat_id", chatIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      return res.status(200).json({ success: true, items: data || [] });
    }

    if (req.method === "POST") {
      const { chatId, isFavorite, needsReply, internalNote } = req.body || {};

      if (!chatId) {
        return sendJsonError(res, 400, "chatId is required");
      }

      const payload = {
        chat_id: String(chatId),
        is_favorite: Boolean(isFavorite),
        needs_reply: Boolean(needsReply),
        internal_note: internalNote || "",
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("telegram_chat_meta")
        .upsert(payload, { onConflict: "chat_id" })
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({ success: true, item: data });
    }

    return sendJsonError(res, 405, "Method not allowed");
  } catch (error) {
    return sendJsonError(
      res,
      error?.statusCode || 500,
      "Failed to process telegram chat metadata",
      error?.message || error,
    );
  }
}

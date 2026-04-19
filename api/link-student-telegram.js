import { createClient } from "@supabase/supabase-js";

function sendJsonError(res, status, error, details) {
  return res.status(status).json({
    success: false,
    error,
    ...(details ? { details: String(details) } : {}),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJsonError(res, 405, "Method not allowed");
  }

  try {
    const { studentId, telegramUserId, telegramDisplayName, unlink } = req.body || {};

    if (!studentId) {
      return sendJsonError(res, 400, "studentId is required");
    }

    if (!unlink && !telegramUserId) {
      return sendJsonError(res, 400, "telegramUserId is required for link action");
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return sendJsonError(
        res,
        500,
        "Missing Supabase server environment variables",
        "Required: SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY",
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const updatePayload = unlink
      ? {
          telegram_user_id: null,
          telegram_display_name: null,
          telegram_linked_at: null,
        }
      : {
          telegram_user_id: String(telegramUserId),
          telegram_display_name: telegramDisplayName || null,
          telegram_linked_at: new Date().toISOString(),
        };

    const { data, error } = await supabase
      .from("students")
      .update(updatePayload)
      .eq("id", studentId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      mode: unlink ? "unlink" : "link",
      updated: data,
    });
  } catch (error) {
    console.error("link-student-telegram error:", error);
    return sendJsonError(
      res,
      500,
      "Failed to update telegram link for student",
      error?.message || error,
    );
  }
}

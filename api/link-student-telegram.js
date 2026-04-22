import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { studentId, chatId } = req.body || {};
    if (!studentId || !chatId) {
      return res.status(400).json({ error: "studentId and chatId are required" });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: "Missing Supabase server environment variables" });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase
      .from("telegram_chat_meta")
      .upsert(
        {
          chat_id: String(chatId),
          student_id: studentId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "chat_id" }
      )
      .select("*")
      .single();

    if (error) throw error;

    return res.status(200).json({ success: true, meta: data });
  } catch (error) {
    console.error("link-student-telegram error:", error);
    return res.status(500).json({
      error: "Failed to link telegram to student",
      details: String(error?.message || error),
    });
  }
}

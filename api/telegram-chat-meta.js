import { createClient } from "@supabase/supabase-js";

const buildSupabase = () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server environment variables");
  return createClient(supabaseUrl, serviceRoleKey);
};

export default async function handler(req, res) {
  const supabase = buildSupabase();

  if (req.method === "GET") {
    const chatId = req.query.chatId;
    if (!chatId) return res.status(400).json({ error: "chatId is required" });

    const { data, error } = await supabase
      .from("telegram_chat_meta")
      .select("*")
      .eq("chat_id", String(chatId))
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: "Failed to load chat meta", details: String(error.message || error) });
    }

    return res.status(200).json({ success: true, meta: data || null });
  }

  if (req.method === "POST") {
    const { chatId, studentId, internalNote, customTemplate } = req.body || {};
    if (!chatId) return res.status(400).json({ error: "chatId is required" });

    const payload = {
      chat_id: String(chatId),
      student_id: studentId || null,
      internal_note: internalNote || null,
      custom_template: customTemplate || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("telegram_chat_meta")
      .upsert(payload, { onConflict: "chat_id" })
      .select("*")
      .single();

    if (error) {
      return res.status(500).json({ error: "Failed to save chat meta", details: String(error.message || error) });
    }

    return res.status(200).json({ success: true, meta: data });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

import { createClient } from "@supabase/supabase-js";

const GRAPH_BASE = "https://graph.instagram.com";
const FB_GRAPH_BASE = "https://graph.facebook.com/v21.0";
const CONNECTION_ID = "primary";

const buildSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server environment variables");
  return createClient(supabaseUrl, serviceRoleKey);
};

const getOp = (req) => String(req.query?.op || req.body?.op || "").trim();

const applyNoStore = (res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
};

const fetchJson = async (url) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || data?.error) {
    const message = data?.error?.message || data?.error_message || JSON.stringify(data);
    throw new Error(message || `HTTP ${res.status}`);
  }
  return data;
};

const readConnection = async (supabase) => {
  const { data, error } = await supabase
    .from("instagram_oauth_connections")
    .select("id, connected, access_token, ig_user_id, ig_username, expires_at, refreshed_at")
    .eq("id", CONNECTION_ID)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

const fetchConversationsFromMeta = async ({ accessToken, igUserId }) => {
  const fields = "id,updated_time,participants{id,username,name},messages.limit(1){id,message,from,created_time}";
  const paths = [
    `${GRAPH_BASE}/me/conversations?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}`,
    igUserId ? `${GRAPH_BASE}/${encodeURIComponent(igUserId)}/conversations?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}` : "",
    igUserId ? `${FB_GRAPH_BASE}/${encodeURIComponent(igUserId)}/conversations?platform=instagram&fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}` : "",
  ].filter(Boolean);

  const attempts = [];
  for (const path of paths) {
    try {
      const payload = await fetchJson(path);
      attempts.push({
        endpoint: path,
        ok: true,
        topLevelKeys: Object.keys(payload || {}),
        rawDataCount: Array.isArray(payload?.data) ? payload.data.length : null,
        hasPaging: !!payload?.paging,
      });
      return { payload, endpoint: path, attempts };
    } catch (error) {
      attempts.push({ endpoint: path, ok: false, error: String(error?.message || error) });
    }
  }
  const details = attempts.map((a) => `${a.endpoint} -> ${a.error}`).join(" | ");
  const err = new Error(`Instagram inbox endpoints failed. ${details}`);
  err.attempts = attempts;
  throw err;
};

const extractRows = (payload) => {
  const data = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.conversations?.data)
      ? payload.conversations.data
      : [];
  return data.map((row) => {
    const participants = Array.isArray(row?.participants?.data) ? row.participants.data : [];
    const messages = Array.isArray(row?.messages?.data) ? row.messages.data : [];
    const last = messages[0] || null;
    const remoteParticipant = participants[0] || null;
    return {
      threadId: String(row?.id || ""),
      updatedTime: row?.updated_time || last?.created_time || "",
      participantId: remoteParticipant?.id ? String(remoteParticipant.id) : "",
      participantUsername: remoteParticipant?.username || remoteParticipant?.name || "",
      lastMessageText: last?.message || "",
      lastMessageAt: last?.created_time || row?.updated_time || "",
      raw: row,
    };
  }).filter((row) => !!row.threadId);
};

const upsertFoundationRows = async (supabase, rows) => {
  let upserted = 0;

  for (const row of rows) {
    const externalUserId = row.participantId || `thread:${row.threadId}`;
    const username = row.participantUsername || `instagram_thread_${row.threadId.slice(-6)}`;
    const { data: existingChannel } = await supabase
      .from("crm_contact_channels")
      .select("id, contact_id")
      .eq("channel_type", "instagram")
      .eq("external_user_id", externalUserId)
      .maybeSingle();

    let contactId = existingChannel?.contact_id || "";
    if (!contactId) {
      const { data: contact, error: contactError } = await supabase
        .from("crm_contacts")
        .insert({
          full_name: username,
          contact_type: "lead",
        })
        .select("id")
        .single();
      if (contactError) continue;
      contactId = contact?.id || "";
    }
    if (!contactId) continue;

    const { data: channel, error: channelError } = await supabase
      .from("crm_contact_channels")
      .upsert({
        contact_id: contactId,
        channel_type: "instagram",
        external_user_id: externalUserId,
        external_username: username,
        external_thread_id: row.threadId,
        is_primary: true,
        is_connected: true,
        metadata: {
          source: "instagram_inbox_sync",
        },
      }, { onConflict: "channel_type,external_user_id" })
      .select("id")
      .single();
    if (channelError || !channel?.id) continue;

    const { error: threadError } = await supabase
      .from("crm_conversation_threads")
      .upsert({
        channel_id: channel.id,
        thread_external_id: row.threadId,
        title: username,
        last_message_at: row.lastMessageAt || row.updatedTime || null,
        state: "open",
        metadata: {
          preview: row.lastMessageText || "",
          participant_id: row.participantId || null,
          participant_username: row.participantUsername || null,
          synced_at: new Date().toISOString(),
        },
      }, { onConflict: "channel_id,thread_external_id" });

    if (!threadError) upserted += 1;
  }

  return { upserted };
};

const handleSync = async (res) => {
  applyNoStore(res);
  const supabase = buildSupabase();
  const connection = await readConnection(supabase);
  if (!connection?.connected || !connection?.access_token) {
    return res.status(400).json({
      error: "instagram_not_connected",
      details: "No connected Instagram OAuth token found",
    });
  }

  try {
    const { payload, endpoint, attempts } = await fetchConversationsFromMeta({
      accessToken: connection.access_token,
      igUserId: connection.ig_user_id || "",
    });
    const rows = extractRows(payload);
    const persisted = await upsertFoundationRows(supabase, rows);
    const rawDataCount = Array.isArray(payload?.data) ? payload.data.length : null;
    const topLevelKeys = Object.keys(payload || {});
    const firstDataShape = Array.isArray(payload?.data) && payload.data[0] ? Object.keys(payload.data[0] || {}) : [];
    const emptyReason = rows.length
      ? ""
      : rawDataCount === 0
        ? "Meta endpoint returned data=[] for conversations."
        : "Meta response does not contain expected conversations data array.";
    const permissionHint = attempts.some((a) => String(a?.error || "").toLowerCase().includes("permission"))
      ? "Meta permissions/token type likely do not allow inbox conversations for this endpoint."
      : "";

    return res.status(200).json({
      success: true,
      syncedAt: new Date().toISOString(),
      sourceEndpoint: endpoint,
      attempts,
      rawMeta: {
        topLevelKeys,
        rawDataCount,
        dataIsArray: Array.isArray(payload?.data),
        hasPaging: !!payload?.paging,
        firstDataShape,
      },
      fetchedThreads: rows.length,
      persistedThreads: persisted.upserted,
      emptyReason,
      permissionHint,
    });
  } catch (error) {
    return res.status(502).json({
      error: "instagram_inbox_sync_failed",
      details: String(error?.message || error),
      attempts: error?.attempts || [],
      note: "Conversation endpoints may require additional Meta messaging permissions/page linkage for this token.",
    });
  }
};

const handleList = async (res) => {
  applyNoStore(res);
  const supabase = buildSupabase();
  const { data, error } = await supabase
    .from("crm_conversation_threads")
    .select("id, channel_id, thread_external_id, title, last_message_at, state, metadata, updated_at")
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (error) {
    return res.status(503).json({
      error: "instagram_inbox_storage_not_ready",
      details: String(error?.message || error),
      requiredTables: ["crm_contacts", "crm_contact_channels", "crm_conversation_threads"],
      requiredSql: ["sql/instagram_crm_foundation.sql"],
    });
  }

  const rows = (data || []).map((row) => ({
    id: row.id,
    channelId: row.channel_id,
    threadId: row.thread_external_id,
    title: row.title || "",
    lastMessageAt: row.last_message_at || "",
    state: row.state || "open",
    preview: row?.metadata?.preview || "",
    participantUsername: row?.metadata?.participant_username || "",
    participantId: row?.metadata?.participant_id || "",
    updatedAt: row.updated_at || "",
  }));

  return res.status(200).json({
    success: true,
    rows,
    fetchedAt: new Date().toISOString(),
    emptyReason: rows.length ? "" : "No synced Instagram threads yet. Use Sync Instagram inbox.",
  });
};

export default async function handler(req, res) {
  const op = getOp(req);
  try {
    if (req.method === "POST" && op === "sync") return await handleSync(res);
    if (req.method === "GET" && op === "list") return await handleList(res);
    return res.status(400).json({ error: "Unknown instagram inbox op", allowedOps: ["sync", "list"] });
  } catch (error) {
    return res.status(500).json({ error: "Instagram inbox operation failed", details: String(error?.message || error), op });
  }
}

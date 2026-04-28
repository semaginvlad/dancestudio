import { createClient } from "@supabase/supabase-js";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const AUTH_BASE = "https://www.facebook.com/v21.0/dialog/oauth";
const CONNECTION_ID = "primary";

const buildSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server environment variables");
  return createClient(supabaseUrl, serviceRoleKey);
};

const applyNoStore = (res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
};

const getOp = (req) => String(req.query?.op || req.body?.op || "").trim();
const stripUrlParams = (value = "") => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const queryIndex = trimmed.indexOf("?");
  const hashIndex = trimmed.indexOf("#");
  const indexes = [queryIndex, hashIndex].filter((idx) => idx >= 0);
  if (!indexes.length) return trimmed;
  return trimmed.slice(0, Math.min(...indexes));
};

const getConfig = () => {
  const appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID || "";
  const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET || "";
  const redirectUri = stripUrlParams(process.env.FACEBOOK_REDIRECT_URI || "");
  const scope = process.env.FACEBOOK_OAUTH_SCOPE || "pages_show_list,pages_read_engagement,pages_manage_metadata,instagram_manage_messages,business_management";
  return { appId, appSecret, redirectUri, scope };
};

const fetchJson = async (url) => {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || data?.error) {
    const message = data?.error?.message || data?.error_description || JSON.stringify(data);
    throw new Error(message || `HTTP ${res.status}`);
  }
  return data;
};

const toExpiryIso = (expiresInSeconds = 0) => new Date(Date.now() + Math.max(0, Number(expiresInSeconds || 0)) * 1000).toISOString();

const sanitize = (row) => {
  if (!row) return { connected: false };
  return {
    connected: !!row.connected,
    fbUserId: row.fb_user_id || "",
    fbUserName: row.fb_user_name || "",
    selectedPageId: row.selected_page_id || "",
    selectedPageName: row.selected_page_name || "",
    igBusinessId: row.ig_business_id || "",
    igBusinessUsername: row.ig_business_username || "",
    userTokenExpiresAt: row.user_token_expires_at || "",
    refreshedAt: row.refreshed_at || "",
    lastError: row.last_error || "",
    pagesCount: Number(row?.metadata?.pages_count || 0),
  };
};

const upsertConnection = async (supabase, payload) => {
  const { data, error } = await supabase
    .from("facebook_oauth_connections")
    .upsert({ id: CONNECTION_ID, updated_at: new Date().toISOString(), ...payload }, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
};

const handleStatus = async (res) => {
  applyNoStore(res);
  const supabase = buildSupabase();
  const { data, error } = await supabase
    .from("facebook_oauth_connections")
    .select("*")
    .eq("id", CONNECTION_ID)
    .maybeSingle();
  if (error) {
    return res.status(503).json({
      error: "facebook_oauth_storage_not_ready",
      details: String(error?.message || error),
      requiredTables: ["facebook_oauth_connections"],
      requiredSql: ["sql/facebook_oauth_connections.sql"],
    });
  }
  return res.status(200).json({ success: true, connection: sanitize(data) });
};

const handleStart = async (res) => {
  applyNoStore(res);
  const { appId, redirectUri, scope } = getConfig();
  if (!appId || !redirectUri) return res.status(400).json({ error: "Missing FACEBOOK_APP_ID/META_APP_ID or FACEBOOK_REDIRECT_URI" });
  const state = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const params = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, response_type: "code", scope, state });
  return res.status(200).json({ success: true, authUrl: `${AUTH_BASE}?${params.toString()}`, state, redirectUri });
};

const handleExchange = async (req, res) => {
  applyNoStore(res);
  const code = String(req.body?.code || req.query?.code || "").trim();
  if (!code) return res.status(400).json({ error: "code is required" });
  const { appId, appSecret, redirectUri } = getConfig();
  if (!appId || !appSecret || !redirectUri) return res.status(400).json({ error: "Missing FACEBOOK_APP_ID/META_APP_ID, FACEBOOK_APP_SECRET/META_APP_SECRET, or FACEBOOK_REDIRECT_URI" });

  const supabase = buildSupabase();
  try {
    const tokenPayload = await fetchJson(`${GRAPH_BASE}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`);
    const userToken = tokenPayload.access_token;
    const user = await fetchJson(`${GRAPH_BASE}/me?fields=id,name&access_token=${encodeURIComponent(userToken)}`);
    const pages = await fetchJson(`${GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${encodeURIComponent(userToken)}`);
    const rows = Array.isArray(pages?.data) ? pages.data : [];

    const { data: igConn } = await supabase
      .from("instagram_oauth_connections")
      .select("ig_user_id")
      .eq("id", "primary")
      .maybeSingle();
    const igUserId = String(igConn?.ig_user_id || "");

    const withIg = rows.filter((p) => p?.instagram_business_account?.id);
    const selected = withIg.find((p) => String(p.instagram_business_account.id) === igUserId) || withIg[0] || rows[0] || null;

    const saved = await upsertConnection(supabase, {
      connected: true,
      fb_user_id: user?.id || null,
      fb_user_name: user?.name || null,
      user_access_token: userToken,
      user_token_expires_at: toExpiryIso(tokenPayload?.expires_in),
      selected_page_id: selected?.id || null,
      selected_page_name: selected?.name || null,
      page_access_token: selected?.access_token || null,
      ig_business_id: selected?.instagram_business_account?.id || null,
      ig_business_username: selected?.instagram_business_account?.username || null,
      refreshed_at: new Date().toISOString(),
      last_error: null,
      metadata: {
        pages_count: rows.length,
      },
    });

    return res.status(200).json({ success: true, connection: sanitize(saved), pagesCount: rows.length });
  } catch (error) {
    await upsertConnection(supabase, {
      connected: false,
      refreshed_at: new Date().toISOString(),
      last_error: String(error?.message || error),
    }).catch(() => {});
    return res.status(500).json({ error: "facebook_oauth_exchange_failed", details: String(error?.message || error) });
  }
};

export default async function handler(req, res) {
  const op = getOp(req);
  try {
    if (req.method === "GET" && !op && req.query?.code) return await handleExchange(req, res);
    if (req.method === "GET" && op === "status") return await handleStatus(res);
    if (req.method === "GET" && op === "start") return await handleStart(res);
    if ((req.method === "POST" || req.method === "GET") && op === "exchange") return await handleExchange(req, res);
    return res.status(400).json({ error: "Unknown facebook oauth op", allowedOps: ["status", "start", "exchange"] });
  } catch (error) {
    return res.status(500).json({ error: "Facebook OAuth operation failed", details: String(error?.message || error), op });
  }
}

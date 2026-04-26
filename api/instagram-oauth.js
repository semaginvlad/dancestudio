import { createClient } from "@supabase/supabase-js";

const AUTH_BASE = "https://api.instagram.com/oauth/authorize";
const TOKEN_BASE = "https://api.instagram.com/oauth/access_token";
const GRAPH_BASE = "https://graph.instagram.com";
const CONNECTION_ID = "primary";

const buildSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server environment variables");
  return createClient(supabaseUrl, serviceRoleKey);
};

const getConfig = () => {
  const clientId = process.env.INSTAGRAM_CLIENT_ID || process.env.META_APP_ID || "";
  const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET || process.env.META_APP_SECRET || "";
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || "";
  const scope = process.env.INSTAGRAM_OAUTH_SCOPE || "user_profile,user_media";
  return { clientId, clientSecret, redirectUri, scope };
};

const getOp = (req) => String(req.query?.op || req.body?.op || "").trim();

const buildAuthUrl = ({ clientId, redirectUri, scope, state }) => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
};

const fetchJson = async (url, options) => {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok || data?.error) {
    const message = data?.error_message || data?.error?.message || data?.error_description || JSON.stringify(data);
    throw new Error(message || `HTTP ${res.status}`);
  }
  return data;
};

const upsertConnection = async (supabase, payload) => {
  const { data, error } = await supabase
    .from("instagram_oauth_connections")
    .upsert({ id: CONNECTION_ID, updated_at: new Date().toISOString(), ...payload }, { onConflict: "id" })
    .select("id, provider, ig_user_id, ig_username, token_type, connected, expires_at, refreshed_at, updated_at, created_at, last_error")
    .single();
  if (error) throw error;
  return data;
};

const sanitizeConnection = (row) => {
  if (!row) return { connected: false };
  return {
    id: row.id,
    provider: row.provider,
    connected: !!row.connected,
    igUserId: row.ig_user_id || "",
    igUsername: row.ig_username || "",
    tokenType: row.token_type || "",
    expiresAt: row.expires_at || "",
    refreshedAt: row.refreshed_at || "",
    updatedAt: row.updated_at || "",
    createdAt: row.created_at || "",
    lastError: row.last_error || "",
  };
};

const handleStatus = async (res) => {
  const supabase = buildSupabase();
  const { data, error } = await supabase
    .from("instagram_oauth_connections")
    .select("id, provider, ig_user_id, ig_username, token_type, connected, expires_at, refreshed_at, updated_at, created_at, last_error")
    .eq("id", CONNECTION_ID)
    .maybeSingle();
  if (error) {
    return res.status(503).json({
      error: "instagram_oauth_storage_not_ready",
      details: String(error.message || error),
      requiredTables: ["instagram_oauth_connections"],
      requiredSql: ["sql/instagram_oauth_connections.sql"],
    });
  }
  return res.status(200).json({ success: true, connection: sanitizeConnection(data) });
};

const handleStart = async (res) => {
  const { clientId, redirectUri, scope } = getConfig();
  if (!clientId || !redirectUri) {
    return res.status(400).json({ error: "Missing INSTAGRAM_CLIENT_ID/META_APP_ID or INSTAGRAM_REDIRECT_URI" });
  }
  const state = `ig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return res.status(200).json({
    success: true,
    state,
    redirectUri,
    authUrl: buildAuthUrl({ clientId, redirectUri, scope, state }),
    flow: [
      "authorize(code)",
      "exchange_code_to_short_lived_token",
      "exchange_short_lived_to_long_lived_token",
    ],
  });
};

const exchangeCodeToShortLived = async ({ clientId, clientSecret, redirectUri, code }) => {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  return fetchJson(TOKEN_BASE, { method: "POST", body });
};

const exchangeShortToLongLived = async ({ clientSecret, shortLivedToken }) => {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: clientSecret,
    access_token: shortLivedToken,
  });
  return fetchJson(`${GRAPH_BASE}/access_token?${params.toString()}`, { method: "GET" });
};

const refreshLongLived = async ({ longLivedToken }) => {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: longLivedToken,
  });
  return fetchJson(`${GRAPH_BASE}/refresh_access_token?${params.toString()}`, { method: "GET" });
};

const fetchIgProfile = async (accessToken) => {
  const params = new URLSearchParams({
    fields: "id,username",
    access_token: accessToken,
  });
  return fetchJson(`${GRAPH_BASE}/me?${params.toString()}`, { method: "GET" });
};

const toExpiryIso = (expiresInSeconds = 0) => {
  const seconds = Math.max(0, Number(expiresInSeconds || 0));
  return new Date(Date.now() + seconds * 1000).toISOString();
};

const handleExchange = async (req, res) => {
  const code = String(req.body?.code || req.query?.code || "").trim();
  if (!code) return res.status(400).json({ error: "code is required" });

  const { clientId, clientSecret, redirectUri, scope } = getConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    return res.status(400).json({ error: "Missing INSTAGRAM_CLIENT_ID/META_APP_ID, INSTAGRAM_CLIENT_SECRET/META_APP_SECRET, or INSTAGRAM_REDIRECT_URI" });
  }

  const supabase = buildSupabase();

  try {
    const shortLived = await exchangeCodeToShortLived({ clientId, clientSecret, redirectUri, code });
    const longLived = await exchangeShortToLongLived({ clientSecret, shortLivedToken: shortLived.access_token });
    const profile = await fetchIgProfile(longLived.access_token);

    const row = await upsertConnection(supabase, {
      provider: "instagram_basic",
      ig_user_id: profile.id || shortLived.user_id || null,
      ig_username: profile.username || null,
      token_type: "long_lived",
      access_token: longLived.access_token,
      scopes: String(scope || "").split(",").map((s) => s.trim()).filter(Boolean),
      connected: true,
      expires_at: toExpiryIso(longLived.expires_in),
      refreshed_at: new Date().toISOString(),
      last_error: null,
      metadata: {
        short_lived_obtained_at: new Date().toISOString(),
        short_lived_expires_in: shortLived.expires_in || null,
      },
    });

    return res.status(200).json({
      success: true,
      connection: sanitizeConnection(row),
      flow: {
        codeToShortLived: true,
        shortToLongLived: true,
      },
    });
  } catch (error) {
    try {
      await upsertConnection(supabase, {
        provider: "instagram_basic",
        connected: false,
        refreshed_at: new Date().toISOString(),
        last_error: String(error?.message || error),
      });
    } catch {}

    return res.status(500).json({
      error: "instagram_oauth_exchange_failed",
      details: String(error?.message || error),
      hint: "For ig_exchange_token, use a short-lived Instagram User Access Token obtained via code exchange.",
    });
  }
};

const handleRefresh = async (res) => {
  const supabase = buildSupabase();
  const { data: existing, error } = await supabase
    .from("instagram_oauth_connections")
    .select("id, access_token, connected")
    .eq("id", CONNECTION_ID)
    .maybeSingle();

  if (error) {
    return res.status(503).json({
      error: "instagram_oauth_storage_not_ready",
      details: String(error.message || error),
      requiredTables: ["instagram_oauth_connections"],
      requiredSql: ["sql/instagram_oauth_connections.sql"],
    });
  }
  if (!existing?.access_token) {
    return res.status(400).json({ error: "No stored long-lived token. Connect Instagram first." });
  }

  try {
    const refreshed = await refreshLongLived({ longLivedToken: existing.access_token });
    const profile = await fetchIgProfile(refreshed.access_token);
    const row = await upsertConnection(supabase, {
      provider: "instagram_basic",
      ig_user_id: profile.id || null,
      ig_username: profile.username || null,
      token_type: "long_lived",
      access_token: refreshed.access_token,
      connected: true,
      expires_at: toExpiryIso(refreshed.expires_in),
      refreshed_at: new Date().toISOString(),
      last_error: null,
    });
    return res.status(200).json({ success: true, connection: sanitizeConnection(row) });
  } catch (refreshError) {
    await upsertConnection(supabase, {
      provider: "instagram_basic",
      connected: false,
      refreshed_at: new Date().toISOString(),
      last_error: String(refreshError?.message || refreshError),
    });
    return res.status(500).json({ error: "instagram_oauth_refresh_failed", details: String(refreshError?.message || refreshError) });
  }
};

export default async function handler(req, res) {
  const op = getOp(req);
  try {
    if (req.method === "GET" && op === "status") return await handleStatus(res);
    if (req.method === "GET" && op === "start") return await handleStart(res);
    if ((req.method === "POST" || req.method === "GET") && op === "exchange") return await handleExchange(req, res);
    if (req.method === "POST" && op === "refresh") return await handleRefresh(res);
    return res.status(400).json({ error: "Unknown instagram oauth op", allowedOps: ["status", "start", "exchange", "refresh"] });
  } catch (error) {
    return res.status(500).json({ error: "Instagram OAuth operation failed", details: String(error?.message || error), op });
  }
}

import { createClient } from "@supabase/supabase-js";
import { ADMIN_EMAILS, isAdminEmail } from "../src/shared/adminAccess.js";

const json = (res, status, body) => res.status(status).json(body);

const normalizeProvider = (provider = "") => String(provider || "").trim().toLowerCase();

const getBearerToken = (req) => {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
};

const getAdminEmails = () => {
  const raw = process.env.ADMIN_EMAILS || process.env.AI_ADMIN_EMAILS || "";
  const fromEnv = raw.split(",").map((email) => email.trim()).filter(Boolean);
  return fromEnv.length ? fromEnv : ADMIN_EMAILS;
};

const getSupabaseAuthClient = () => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
};

async function assertAdmin(req) {
  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, body: { error: "missing_auth", message: "Authorization Bearer token is required." } };

  const supabase = getSupabaseAuthClient();
  if (!supabase) {
    return { ok: false, status: 503, body: { error: "auth_not_configured", message: "Supabase auth env is not configured; AI endpoint is disabled." } };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, body: { error: "invalid_auth", message: "Invalid or expired auth token." } };
  if (!isAdminEmail(data.user.email, getAdminEmails())) return { ok: false, status: 403, body: { error: "forbidden", message: "AI Insights are available only for admin users." } };

  return { ok: true, user: data.user };
}

const fallbackBody = (provider, reason, details) => ({
  mode: "fallback",
  provider: provider || null,
  insights: [],
  reason,
  details,
});

const systemPrompt = `You are an AI insights engine for a dance studio CRM. Return only valid JSON with this shape: {"insights":[{"id":"string","priority":"high|medium|low","title":"string","summary":"string","evidence":["string"],"recommendation":"string","source":"ai-api"}]}. Use only the provided aggregated data. Do not claim messages were sent. Do not suggest automatic database changes.`;

const buildUserPrompt = (payload = {}) => JSON.stringify({
  task: "Generate 3-5 concise operational CRM insights in Ukrainian for an admin.",
  safety: [
    "Read-only recommendations only",
    "No automatic messages",
    "No database writes",
    "No Telegram or Instagram chat analysis",
  ],
  data: payload,
});

async function callOpenAI({ apiKey, model, payload }) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildUserPrompt(payload) },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI request failed");
  return data?.choices?.[0]?.message?.content || "";
}

async function callClaude({ apiKey, model, payload }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1800,
      system: systemPrompt,
      messages: [{ role: "user", content: buildUserPrompt(payload) }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Claude request failed");
  return data?.content?.find((part) => part.type === "text")?.text || "";
}

async function callGemini({ apiKey, model, payload }) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${buildUserPrompt(payload)}` }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Gemini request failed");
  return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
}

const parseAIJson = (text) => {
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  if (!clean) return null;
  return JSON.parse(clean);
};

const normalizeInsights = (rows = []) => (Array.isArray(rows) ? rows : [])
  .map((item, idx) => ({
    id: String(item?.id || `ai-insight-${idx + 1}`),
    priority: ["high", "medium", "low"].includes(item?.priority) ? item.priority : "medium",
    title: String(item?.title || "AI-підказка").slice(0, 140),
    summary: String(item?.summary || "").slice(0, 500),
    evidence: (Array.isArray(item?.evidence) ? item.evidence : []).map((row) => String(row).slice(0, 240)).slice(0, 4),
    recommendation: String(item?.recommendation || "Перевірити вручну.").slice(0, 500),
    source: "ai-api",
  }))
  .filter((item) => item.summary || item.evidence.length || item.recommendation)
  .slice(0, 5);

async function callConfiguredProvider({ provider, apiKey, model, payload }) {
  if (provider === "openai" || provider === "gpt") return callOpenAI({ apiKey, model, payload });
  if (provider === "claude" || provider === "anthropic") return callClaude({ apiKey, model, payload });
  if (provider === "gemini" || provider === "google") return callGemini({ apiKey, model, payload });
  throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });

  const admin = await assertAdmin(req);
  if (!admin.ok) return json(res, admin.status, admin.body);

  const provider = normalizeProvider(process.env.AI_PROVIDER);
  const model = process.env.AI_MODEL;
  const apiKey = process.env.AI_API_KEY;

  if (!provider || !model || !apiKey) {
    return json(res, 200, fallbackBody(provider, "ai_not_configured", "Set AI_PROVIDER, AI_MODEL and AI_API_KEY to enable real AI insights."));
  }

  try {
    const text = await callConfiguredProvider({ provider, apiKey, model, payload: req.body?.payload || {} });
    const parsed = parseAIJson(text);
    const insights = normalizeInsights(parsed?.insights);
    if (!insights.length) return json(res, 200, fallbackBody(provider, "empty_ai_response", "AI response did not include valid insights."));
    return json(res, 200, { mode: "ai", provider, insights });
  } catch (error) {
    return json(res, 200, fallbackBody(provider, "ai_request_failed", error?.message || "AI request failed; use fallback analytics."));
  }
}

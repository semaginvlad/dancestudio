import { createClient } from "@supabase/supabase-js";
import { ADMIN_EMAILS, isAdminEmail } from "../src/shared/adminAccess.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_CRM_MODEL = "claude-sonnet-4-20250514";
const CRM_CONTEXT_ANALYSIS_OP = "crmContextAnalysis";

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "phone",
  "phone_number",
  "phones",
  "phone_numbers",
  "telegram",
  "telegram_handle",
  "telegram_handles",
  "instagram_handle",
  "instagram_handles",
  "chat_messages",
  "raw_messages",
  "raw_chats",
  "private_notes",
  "notes",
  "raw_payment_rows",
]);

const RESTRICTED_CONTEXT_KEYS = new Set(["instagram", "message", "messages"]);
const SAFE_PLACEHOLDER_STATUSES = new Set(["later-phase", "placeholder", "excluded", "disabled"]);
const PLACEHOLDER_UNSAFE_KEYS = new Set([
  "body",
  "chat",
  "chats",
  "contact",
  "contacts",
  "content",
  "handle",
  "handles",
  "items",
  "raw",
  "rows",
  "text",
  "texts",
  "thread",
  "threads",
  "username",
  "usernames",
]);

const CRM_SYSTEM_PROMPT = `Ти — AI-аналітик CRM танцювальної студії SOROKA.
Працюй тільки з наданим aggregate-only CRM context.
Не вигадуй факти, яких немає у context.
Не стверджуй, що повідомлення були надіслані або що будь-які дії вже виконані.
Не пропонуй автоматичні зміни в базі даних.
Давай рекомендації тільки як admin-reviewed suggestions.
Відповідай тільки валідним JSON без markdown і без пояснень поза JSON.`;

const readBearerToken = (req) => {
  const auth = String(req.headers?.authorization || "").trim();
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
};

const buildAuthClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error("Missing Supabase auth env vars");
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { "X-Client-Info": "claude-crm-ai-gateway" } },
  });
};

const requireAdmin = async (req) => {
  const token = readBearerToken(req);
  if (!token) return { ok: false, status: 401, error: "missing_token" };

  const authClient = buildAuthClient();
  const { data, error } = await authClient.auth.getUser(token);
  const user = data?.user;
  if (error || !user?.id) return { ok: false, status: 401, error: "invalid_token" };
  if (!isAdminEmail(user.email, ADMIN_EMAILS)) return { ok: false, status: 403, error: "forbidden" };

  return { ok: true, user };
};

const isPlainObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const normalizeKey = (key) => String(key || "").trim().toLowerCase();

const isSafeLaterPhasePlaceholder = (value) => {
  if (!isPlainObject(value)) return false;

  const status = normalizeKey(value.status);
  const hasSafeStatus = status ? SAFE_PLACEHOLDER_STATUSES.has(status) : false;
  const explicitlyExcluded = Object.prototype.hasOwnProperty.call(value, "included") && value.included === false;
  if (!hasSafeStatus && !explicitlyExcluded) return false;
  if (Object.prototype.hasOwnProperty.call(value, "included") && value.included !== false) return false;

  return Object.entries(value).every(([key, nestedValue]) => {
    const normalizedKey = normalizeKey(key);
    if (FORBIDDEN_PAYLOAD_KEYS.has(normalizedKey) || RESTRICTED_CONTEXT_KEYS.has(normalizedKey) || PLACEHOLDER_UNSAFE_KEYS.has(normalizedKey)) {
      return false;
    }
    return !nestedValue || typeof nestedValue !== "object";
  });
};

const findForbiddenPayloadKey = (value, seen = new WeakSet(), path = []) => {
  if (!value || typeof value !== "object") return "";
  if (seen.has(value)) return "";
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findForbiddenPayloadKey(item, seen, path);
      if (match) return match;
    }
    return "";
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    const isTopLevelSafePlaceholderKey = path.length === 0 && ["messages", "instagram"].includes(normalizedKey);

    if (isTopLevelSafePlaceholderKey) {
      if (!isSafeLaterPhasePlaceholder(nestedValue)) return key;
      continue;
    }

    if (FORBIDDEN_PAYLOAD_KEYS.has(normalizedKey) || RESTRICTED_CONTEXT_KEYS.has(normalizedKey)) return key;

    const match = findForbiddenPayloadKey(nestedValue, seen, [...path, normalizedKey]);
    if (match) return match;
  }

  return "";
};

const hasUnsafeDataPolicy = (policy) => {
  if (!isPlainObject(policy)) return false;
  const mode = String(policy.mode || "").trim().toLowerCase();
  const pii = String(policy.pii || "").trim().toLowerCase();
  return (mode && mode !== "aggregate-only") || (pii && pii !== "minimized");
};

export const validateCRMContextPayload = (body = {}) => {
  const contextType = String(body.contextType || "").trim();
  const context = body.context;

  if (!contextType) return { ok: false, status: 400, error: "invalid_payload" };
  if (!isPlainObject(context)) return { ok: false, status: 400, error: "invalid_payload" };

  const rootPolicy = context.dataPolicy;
  const selectedPolicy = context.selectedContext?.dataPolicy;
  if (hasUnsafeDataPolicy(rootPolicy) || hasUnsafeDataPolicy(selectedPolicy)) {
    return { ok: false, status: 400, error: "unsafe_payload" };
  }

  const forbiddenKey = findForbiddenPayloadKey(context);
  if (forbiddenKey) return { ok: false, status: 400, error: "unsafe_payload" };

  return { ok: true, contextType, context };
};

const buildCRMUserPrompt = ({ contextType, context }) => `contextType: ${contextType}

task: Згенеруй 3–7 глибоких CRM insights українською.

Вимоги до відповіді:
{
  "insights": [
    {
      "id": "string",
      "priority": "high|medium|low",
      "title": "string",
      "summary": "string",
      "evidence": ["string"],
      "recommendation": "string",
      "source": "${context.version || "crm-context-v1.1"}"
    }
  ]
}

Aggregate-only CRM context:
${JSON.stringify(context, null, 2)}`;

const callAnthropic = async (payload) => fetch(ANTHROPIC_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": ANTHROPIC_VERSION,
  },
  body: JSON.stringify(payload),
});

const readAnthropicJson = async (response) => {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
};

const parseAIJson = (text = "") => {
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  if (!clean) throw new Error("Empty AI response");
  return JSON.parse(clean);
};

const normalizePriority = (priority) => {
  const normalized = String(priority || "").trim().toLowerCase();
  return ["high", "medium", "low"].includes(normalized) ? normalized : "medium";
};

const normalizeInsight = (item = {}, index = 0, source = "crm-context-v1.1") => ({
  id: String(item.id || `crm-insight-${index + 1}`),
  priority: normalizePriority(item.priority),
  title: String(item.title || "CRM insight"),
  summary: String(item.summary || ""),
  evidence: Array.isArray(item.evidence) ? item.evidence.map((row) => String(row)).filter(Boolean) : [],
  recommendation: String(item.recommendation || ""),
  source: String(item.source || source),
});

const normalizeCRMResponse = ({ aiJson, contextType, context }) => {
  const source = String(context.version || "crm-context-v1.1");
  const insights = Array.isArray(aiJson?.insights) ? aiJson.insights : [];
  if (!insights.length) throw new Error("Missing insights");

  return {
    mode: "ai",
    provider: "anthropic",
    contextType,
    insights: insights.slice(0, 7).map((item, index) => normalizeInsight(item, index, source)),
  };
};

const handleLegacyPassthrough = async (req, res) => {
  const response = await callAnthropic(req.body);
  const data = await readAnthropicJson(response);
  return res.status(response.status).json(data || { error: "anthropic_error" });
};

const handleCRMContextAnalysis = async (req, res) => {
  const validation = validateCRMContextPayload(req.body);
  if (!validation.ok) return res.status(validation.status).json({ error: validation.error });

  let adminResult;
  try {
    adminResult = await requireAdmin(req);
  } catch (_error) {
    return res.status(500).json({ error: "auth_unavailable" });
  }

  if (!adminResult.ok) return res.status(adminResult.status).json({ error: adminResult.error });

  const { contextType, context } = validation;
  const anthropicPayload = {
    model: process.env.ANTHROPIC_MODEL || DEFAULT_CRM_MODEL,
    max_tokens: 2200,
    system: CRM_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildCRMUserPrompt({ contextType, context }) }],
  };

  const response = await callAnthropic(anthropicPayload);
  const data = await readAnthropicJson(response);
  if (!response.ok) {
    return res.status(response.status || 500).json({ error: "anthropic_error" });
  }

  try {
    const text = data?.content?.[0]?.text || "";
    const aiJson = parseAIJson(text);
    return res.status(200).json(normalizeCRMResponse({ aiJson, contextType, context }));
  } catch (_error) {
    return res.status(502).json({ error: "invalid_ai_response" });
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const op = String(req.body?.op || "").trim();
  if (!op) return handleLegacyPassthrough(req, res);
  if (op === CRM_CONTEXT_ANALYSIS_OP) return handleCRMContextAnalysis(req, res);

  return res.status(400).json({ error: "unsupported_op" });
}

import { createClient } from "@supabase/supabase-js";
import { ADMIN_EMAILS, isAdminEmail } from "../src/shared/adminAccess.js";

export const getBearerToken = (req) => {
  const auth = String(req.headers?.authorization || "").trim();
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
};

const buildAuthClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error("Missing Supabase auth environment variables");
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { "X-Client-Info": "dancestudio-api-auth" } },
  });
};

export const requireAdminUser = async (req) => {
  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, error: "missing_authorization" };

  const authClient = buildAuthClient();
  const { data, error } = await authClient.auth.getUser(token);
  const user = data?.user;
  if (error || !user?.id) return { ok: false, status: 401, error: "invalid_authorization" };
  if (!isAdminEmail(user.email, ADMIN_EMAILS)) return { ok: false, status: 403, error: "forbidden" };

  return { ok: true, user };
};

export const requireCronSecret = (req) => {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return { ok: false, status: 500, error: "cron_secret_not_configured" };
  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, error: "missing_authorization" };
  if (token !== secret) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true };
};

export const authError = (res, result) => res.status(result.status || 401).json({ error: result.error || "Unauthorized" });

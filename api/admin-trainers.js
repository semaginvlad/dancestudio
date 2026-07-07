import { createClient } from "@supabase/supabase-js";
import { authError, requireAdminUser } from "./_auth.js";

const json = (res, status, body) => res.status(status).json(body);

const buildAdminClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase service environment variables");
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "X-Client-Info": "dancestudio-admin-trainers" } },
  });
};

const cleanEmail = (value) => String(value || "").trim().toLowerCase();
const cleanTrainerId = (value) => String(value || "").trim();

const fetchTrainer = async (supabase, trainerId) => {
  const { data, error } = await supabase.from("trainers").select("*").eq("id", trainerId).single();
  if (error) throw error;
  return data;
};

const updateTrainerSafe = async (supabase, trainerId, payload) => {
  const { data, error } = await supabase.from("trainers").update(payload).eq("id", trainerId).select("*").single();
  if (error) throw error;
  return data;
};

const createAuthUserForTrainer = async ({ supabase, body }) => {
  const trainerId = cleanTrainerId(body.trainer_id || body.trainerId);
  const email = cleanEmail(body.email);
  const password = String(body.password || "");
  if (!trainerId) return { status: 400, body: { error: "trainer_id_required" } };
  if (!email) return { status: 400, body: { error: "email_required" } };
  if (password.length < 6) return { status: 400, body: { error: "password_min_6_chars" } };

  const trainer = await fetchTrainer(supabase, trainerId);
  if (trainer.auth_user_id) return { status: 409, body: { error: "trainer_already_has_auth_user" } };

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "trainer", trainer_id: trainerId },
    app_metadata: { role: "trainer", trainer_id: trainerId },
  });
  if (error) throw error;

  const authUserId = data?.user?.id;
  if (!authUserId) return { status: 500, body: { error: "auth_user_not_created" } };

  const payload = { auth_user_id: authUserId, email, access_disabled_at: null };
  const updatedTrainer = await updateTrainerSafe(supabase, trainerId, payload);
  return { status: 200, body: { ok: true, trainer: updatedTrainer, auth_user_id: authUserId } };
};

const disableTrainerAccess = async ({ supabase, body }) => {
  const trainerId = cleanTrainerId(body.trainer_id || body.trainerId);
  if (!trainerId) return { status: 400, body: { error: "trainer_id_required" } };
  const trainer = await updateTrainerSafe(supabase, trainerId, { access_disabled_at: new Date().toISOString() });
  if (trainer.auth_user_id) {
    await supabase.auth.admin.updateUserById(trainer.auth_user_id, {
      app_metadata: { role: "trainer", trainer_id: trainerId, access_disabled: true },
      user_metadata: { role: "trainer", trainer_id: trainerId, access_disabled: true },
    });
  }
  return { status: 200, body: { ok: true, trainer } };
};

const enableTrainerAccess = async ({ supabase, body }) => {
  const trainerId = cleanTrainerId(body.trainer_id || body.trainerId);
  const password = body.password === undefined ? null : String(body.password || "");
  if (!trainerId) return { status: 400, body: { error: "trainer_id_required" } };
  if (password !== null && password.length < 6) return { status: 400, body: { error: "password_min_6_chars" } };
  const trainer = await updateTrainerSafe(supabase, trainerId, { access_disabled_at: null });
  if (trainer.auth_user_id) {
    const updatePayload = {
      app_metadata: { role: "trainer", trainer_id: trainerId, access_disabled: false },
      user_metadata: { role: "trainer", trainer_id: trainerId, access_disabled: false },
    };
    if (password) updatePayload.password = password;
    await supabase.auth.admin.updateUserById(trainer.auth_user_id, updatePayload);
  }
  return { status: 200, body: { ok: true, trainer } };
};

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
  const admin = await requireAdminUser(req);
  if (!admin.ok) return authError(res, admin);

  try {
    const body = req.body || {};
    const op = String(body.op || body.operation || "").trim();
    const supabase = buildAdminClient();
    if (op === "create_auth_user_for_trainer") {
      const result = await createAuthUserForTrainer({ supabase, body });
      return json(res, result.status, result.body);
    }
    if (op === "disable_trainer_access") {
      const result = await disableTrainerAccess({ supabase, body });
      return json(res, result.status, result.body);
    }
    if (op === "enable_trainer_access" || op === "reset_trainer_password") {
      const result = await enableTrainerAccess({ supabase, body });
      return json(res, result.status, result.body);
    }
    return json(res, 400, { error: "unknown_operation" });
  } catch (error) {
    return json(res, 500, { error: "admin_trainers_failed", details: String(error?.message || error) });
  }
}

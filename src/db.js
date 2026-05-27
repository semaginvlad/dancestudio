import { supabase } from './supabase'

// ─── AUTH ───
export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getSessionUser = async () => {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user || null;
};

export const onAuthChange = (callback) => {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user || null);
  });
  return data.subscription;
};

export async function upsertPushSubscription(userId, payload = {}) {
  if (!userId) throw new Error("userId is required");
  if (!payload.endpoint || !payload.p256dh || !payload.auth) {
    throw new Error("endpoint, p256dh and auth are required");
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .upsert({
      user_id: userId,
      endpoint: payload.endpoint,
      p256dh: payload.p256dh,
      auth: payload.auth,
      user_agent: payload.user_agent || null,
      platform: payload.platform || null,
      is_active: payload.is_active !== false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    endpoint: data.endpoint,
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// ─── STUDENTS ───
const mapStudent = (s) => ({
  ...s,
  messageTemplate: s.message_template,
  firstName: s.first_name,
  lastName: s.last_name,
});

export async function fetchStudents() {
  const { data, error } = await supabase.from('students').select('*')
  if (error) throw error
  return data.map(mapStudent)
}

export async function fetchRestoreCandidatesForGroup(groupId) {
  if (!groupId) return []
  const { data, error } = await supabase.rpc('crm_fetch_restore_candidates_for_group', { p_group_id: groupId })
  if (error) throw error
  return (data || []).map((row) => ({
    student: mapStudent({
      id: row.student_id,
      name: row.name || '',
      first_name: row.first_name || '',
      last_name: row.last_name || '',
    }),
    hasHistory: !!row.has_history,
  }))
}

export async function restoreStudentToGroup(groupId, studentId) {
  if (!groupId || !studentId) throw new Error('groupId and studentId are required')
  const { data, error } = await supabase
    .rpc('crm_restore_student_to_group', { p_group_id: groupId, p_student_id: studentId })
  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('RPC crm_restore_student_to_group did not return a link row')

  return {
    id: row.id,
    studentId: row.student_id || studentId,
    groupId: row.group_id || groupId,
  }
}

export async function insertStudent(s) {
  const fullName = [s.last_name, s.first_name].filter(Boolean).join(' ') || s.name || ''
  const { data, error } = await supabase.from('students').insert({
    name: fullName,
    first_name: s.first_name || '',
    last_name: s.last_name || '',
    phone: s.phone,
    telegram: s.telegram,
    notes: s.notes,
    message_template: s.message_template || null,
  }).select().single()
  if (error) throw error
  return mapStudent(data)
}

export async function createStudentForGroup(groupId, s = {}) {
  if (!groupId) throw new Error('groupId is required');
  const firstName = s.first_name ?? s.firstName ?? '';
  const lastName = s.last_name ?? s.lastName ?? '';
  const messageTemplate = s.message_template ?? s.messageTemplate ?? null;
  const fullName = [lastName, firstName].filter(Boolean).join(' ') || s.name || '';
  const { data, error } = await supabase.rpc('crm_create_student_for_group', {
    p_group_id: groupId,
    p_name: fullName,
    p_first_name: firstName || null,
    p_last_name: lastName || null,
    p_phone: s.phone || null,
    p_telegram: s.telegram || null,
    p_notes: s.notes || null,
    p_message_template: messageTemplate || null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('RPC crm_create_student_for_group did not return a student');
  return mapStudent(row);
}

export async function updateStudent(id, s) {
  const payload = {}
  if (s.first_name !== undefined) payload.first_name = s.first_name
  if (s.last_name !== undefined) payload.last_name = s.last_name
  if (s.first_name !== undefined || s.last_name !== undefined) {
    payload.name = [s.last_name || payload.last_name, s.first_name || payload.first_name].filter(Boolean).join(' ')
  }
  if (s.phone !== undefined) payload.phone = s.phone
  if (s.telegram !== undefined) payload.telegram = s.telegram
  if (s.notes !== undefined) payload.notes = s.notes
  if (s.message_template !== undefined) payload.message_template = s.message_template

  const { data, error } = await supabase.from('students').update(payload).eq('id', id).select().single()
  if (error) throw error
  return mapStudent(data)
}

export async function deleteStudent(id) {
  try {
    const { data: st } = await supabase.from('students').select('name, first_name, last_name').eq('id', id).single();
    if (st) {
      const names = [
        st.name,
        [st.last_name, st.first_name].filter(Boolean).join(' ')
      ].filter(Boolean);
      if (names.length > 0) {
        await supabase.from('attendance').delete().in('guest_name', names).is('sub_id', null);
      }
    }
  } catch (e) { console.warn('Cleanup of guest attendance failed:', e); }
  const { error } = await supabase.from('students').delete().eq('id', id)
  if (error) throw error
}

// ─── STUDENT GROUPS ───
export async function fetchStudentGroups() {
  const { data, error } = await supabase.from('student_groups').select('*')
  if (error) { console.warn('student_groups:', error.message); return []; }
  return data.map(sg => ({ id: sg.id, studentId: sg.student_id, groupId: sg.group_id }))
}

export async function addStudentGroup(studentId, groupId) {
  const { data, error } = await supabase.from('student_groups').upsert(
    { student_id: studentId, group_id: groupId },
    { onConflict: 'student_id,group_id' }
  ).select().single()
  if (error) throw error
  return { id: data.id, studentId: data.student_id, groupId: data.group_id }
}

export async function removeStudentGroup(studentId, groupId) {
  const { error } = await supabase.from('student_groups').delete().eq('student_id', studentId).eq('group_id', groupId)
  if (error) throw error
}

// ─── GROUPS ───
const mapGroup = (g) => ({
  ...g,
  directionId: g.direction_id,
  trainerPct: g.trainer_pct,
  trainer_id: g.trainer_id,
})

export async function fetchGroups() {
  const { data, error } = await supabase.from('groups').select('*')
  if (error) throw error
  return (data || []).map(mapGroup)
}

export async function fetchScheduleGroups() {
  const { data, error } = await supabase.rpc('crm_fetch_schedule_groups')
  if (error) throw error
  return (data || []).map(mapGroup)
}

export async function updateGroup(id, g) {
  const payload = {}
  if (g.name !== undefined) payload.name = g.name
  if (g.directionId !== undefined) payload.direction_id = g.directionId
  if (g.schedule !== undefined) payload.schedule = g.schedule
  if (g.trainerPct !== undefined) payload.trainer_pct = g.trainerPct
  if (g.trainer_id !== undefined) payload.trainer_id = g.trainer_id
  if (g.is_active !== undefined) payload.is_active = g.is_active
  if (g.active !== undefined) payload.active = g.active
  if (g.archived_at !== undefined) payload.archived_at = g.archived_at

  const { data, error } = await supabase.from('groups').update(payload).eq('id', id).select().single()
  if (error) throw error
  return { ...data, directionId: data.direction_id, trainerPct: data.trainer_pct, trainer_id: data.trainer_id }
}

export async function insertGroup(group) {
  const payload = {
    id: group.id,
    name: group.name,
    direction_id: group.directionId,
    schedule: Array.isArray(group.schedule) ? group.schedule : [],
    trainer_pct: group.trainerPct ?? 0,
  };
  const { data, error } = await supabase.from('groups').insert(payload).select().single();
  if (error) throw error;
  return { ...data, directionId: data.direction_id, trainerPct: data.trainer_pct, trainer_id: data.trainer_id };
}

// ─── DIRECTIONS ───
const mapDirection = (d) => ({
  id: d.id,
  name: d.name || d.id,
  color: d.color || "#7b8ea8",
  isActive: d.is_active !== false,
  archivedAt: d.archived_at || null,
});

export async function fetchDirections() {
  const { data, error } = await supabase.from("directions").select("*").order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map(mapDirection);
}

export async function insertDirection(direction) {
  const payload = {
    id: direction.id,
    name: direction.name,
    color: direction.color || "#7b8ea8",
    is_active: direction.isActive !== false,
    archived_at: direction.archivedAt || null,
  };
  const { data, error } = await supabase.from("directions").insert(payload).select("*").single();
  if (error) throw error;
  return mapDirection(data);
}

export async function updateDirection(id, direction) {
  const payload = {};
  if (direction.id !== undefined) payload.id = direction.id;
  if (direction.name !== undefined) payload.name = direction.name;
  if (direction.color !== undefined) payload.color = direction.color || "#7b8ea8";
  if (direction.isActive !== undefined) payload.is_active = !!direction.isActive;
  if (direction.archivedAt !== undefined) payload.archived_at = direction.archivedAt;
  const { data, error } = await supabase.from("directions").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return mapDirection(data);
}

export async function deleteDirection(id) {
  const { error } = await supabase.from("directions").delete().eq("id", id);
  if (error) throw error;
}

// ─── TRAINERS ───
const mapTrainer = (t) => ({
  id: t.id,
  authUserId: t.auth_user_id || null,
  name: t.name || "",
  firstName: t.first_name || "",
  lastName: t.last_name || "",
  phone: t.phone || "",
  telegram: t.telegram || "",
  instagramHandle: t.instagram_handle || "",
  notes: t.notes || "",
  isActive: t.is_active !== false,
});

export async function fetchTrainers() {
  const { data, error } = await supabase.from('trainers').select('*').order('name', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapTrainer);
}

export async function fetchMyTrainerProfile() {
  const { data, error } = await supabase.rpc('crm_get_my_trainer_profile');
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapTrainer(row) : null;
}

export async function insertTrainer(trainer) {
  const firstName = trainer.firstName || "";
  const lastName = trainer.lastName || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || trainer.name || "";
  const payload = {
    name: fullName,
    first_name: firstName || null,
    last_name: lastName || null,
    phone: trainer.phone || null,
    telegram: trainer.telegram || null,
    instagram_handle: trainer.instagramHandle || null,
    notes: trainer.notes || null,
    is_active: trainer.isActive !== false,
  };
  const { data, error } = await supabase.from('trainers').insert(payload).select('*').single();
  if (error) throw error;
  return mapTrainer(data);
}

export async function updateTrainer(id, trainer) {
  const payload = {};
  const nextFirstName = trainer.firstName;
  const nextLastName = trainer.lastName;
  if (nextFirstName !== undefined) payload.first_name = nextFirstName || null;
  if (nextLastName !== undefined) payload.last_name = nextLastName || null;
  if (nextFirstName !== undefined || nextLastName !== undefined || trainer.name !== undefined) {
    const fallbackName = trainer.name || "";
    payload.name = [nextFirstName || "", nextLastName || ""].filter(Boolean).join(" ").trim() || fallbackName || null;
  }
  if (trainer.phone !== undefined) payload.phone = trainer.phone || null;
  if (trainer.telegram !== undefined) payload.telegram = trainer.telegram || null;
  if (trainer.instagramHandle !== undefined) payload.instagram_handle = trainer.instagramHandle || null;
  if (trainer.notes !== undefined) payload.notes = trainer.notes || null;
  if (trainer.isActive !== undefined) payload.is_active = !!trainer.isActive;
  const { data, error } = await supabase.from('trainers').update(payload).eq('id', id).select('*').single();
  if (error) throw error;
  return mapTrainer(data);
}

export async function fetchTrainerGroups() {
  const { data, error } = await supabase.from('trainer_groups').select('*');
  if (error) throw error;
  return (data || []).map((row) => ({
    trainerId: row.trainer_id,
    groupId: row.group_id,
    isPrimary: !!row.is_primary,
  }));
}

export async function upsertTrainerGroup(trainerId, groupId) {
  const payload = { trainer_id: trainerId, group_id: groupId, is_primary: true };
  const { data, error } = await supabase
    .from('trainer_groups')
    .upsert(payload, { onConflict: 'trainer_id,group_id' })
    .select('*')
    .single();
  if (error) throw error;
  return {
    trainerId: data.trainer_id,
    groupId: data.group_id,
    isPrimary: !!data.is_primary,
  };
}

export async function deleteTrainerGroup(trainerId, groupId) {
  const { error } = await supabase.from('trainer_groups').delete().eq('trainer_id', trainerId).eq('group_id', groupId);
  if (error) throw error;
}

// ─── SUBSCRIPTIONS ───
const SAFE_SUBS_COLUMNS = [
  'id',
  'student_id',
  'group_id',
  'plan_type',
  'start_date',
  'end_date',
  'original_end_date',
  'activation_date',
  'total_trainings',
  'used_trainings',
  'notification_sent',
  'created_at',
].join(',')

export async function fetchSubs({ includeFinancial = true } = {}) {
  const columns = includeFinancial ? '*' : SAFE_SUBS_COLUMNS
  const { data, error } = await supabase.from('subscriptions').select(columns).order('created_at', { ascending: false })
  if (error) throw error
  return data.map(mapSub)
}

export async function fetchMyAttendanceSubscriptions() {
  const { data, error } = await supabase.rpc('crm_fetch_my_attendance_subscriptions')
  if (error) throw error
  return (data || []).map(mapSub)
}

export async function insertSub(s) {
  const payload = {
    student_id: s.studentId,
    group_id: s.groupId,
    plan_type: s.planType,
    start_date: s.startDate,
    end_date: s.endDate,
    original_end_date: s.originalEndDate || s.endDate,
    activation_date: s.activationDate || null,
    total_trainings: s.totalTrainings,
    used_trainings: s.usedTrainings || 0,
    amount: Number(s.amount ?? 0),
    base_price: Number(s.basePrice ?? s.amount ?? 0),
    discount_pct: Number(s.discountPct ?? 0),
    discount_source: s.discountSource || 'studio',
    paid: s.paid,
    pay_method: s.payMethod || 'card',
    notification_sent: false,
    notes: s.notes,
  };
  const { data, error } = await supabase.from('subscriptions').insert({
    ...payload,
  }).select().single()
  if (error) throw error
  return mapSub(data)
}

export async function updateSub(id, s) {
  const payload = {}
  if (s.planType !== undefined) payload.plan_type = s.planType
  if (s.startDate !== undefined) payload.start_date = s.startDate
  if (s.endDate !== undefined) {
    payload.end_date = s.endDate
    if (s.preserveOriginalEndDate !== true) payload.original_end_date = s.endDate
  }
  if (s.originalEndDate !== undefined) payload.original_end_date = s.originalEndDate
  if (s.activationDate !== undefined) payload.activation_date = s.activationDate  // 🆕
  if (s.totalTrainings !== undefined) payload.total_trainings = s.totalTrainings
  if (s.usedTrainings !== undefined) payload.used_trainings = s.usedTrainings
  if (s.amount !== undefined) payload.amount = Number(s.amount)
  if (s.basePrice !== undefined) payload.base_price = Number(s.basePrice)
  if (s.discountPct !== undefined) payload.discount_pct = Number(s.discountPct)
  if (s.discountSource !== undefined) payload.discount_source = s.discountSource
  if (s.paid !== undefined) payload.paid = s.paid
  if (s.payMethod !== undefined) payload.pay_method = s.payMethod
  if (s.notificationSent !== undefined) payload.notification_sent = s.notificationSent
  if (s.notes !== undefined) payload.notes = s.notes
  if (s.studentId !== undefined) payload.student_id = s.studentId
  if (s.groupId !== undefined) payload.group_id = s.groupId

  const { data, error } = await supabase.from('subscriptions').update(payload).eq('id', id).select().single()
  if (error) throw error
  return mapSub(data)
}

export async function deleteSub(id) {
  const { error } = await supabase.from('subscriptions').delete().eq('id', id)
  if (error) throw error
}

function mapSub(s) {
  return {
    id: s.id,
    studentId: s.student_id,
    groupId: s.group_id,
    planType: s.plan_type,
    startDate: s.start_date,
    endDate: s.end_date,
    originalEndDate: s.original_end_date || s.end_date,
    activationDate: s.activation_date,  // 🆕
    totalTrainings: s.total_trainings,
    usedTrainings: s.used_trainings,
    amount: s.amount,
    basePrice: s.base_price ?? s.basePrice ?? null,
    discountPct: s.discount_pct ?? s.discountPct ?? 0,
    discountSource: s.discount_source ?? s.discountSource ?? null,
    paid: s.paid,
    payMethod: s.pay_method,
    notificationSent: s.notification_sent,
    notes: s.notes,
    created_at: s.created_at,
  }
}

// ═══════════════════════════════════════════════════════════════════
// 🆕 СИНХРОНІЗАЦІЯ used_trainings + activation_date при кожній дії в журналі
// ═══════════════════════════════════════════════════════════════════
export async function syncSubUsedTrainings(subId) {
  if (!subId) return null
  try {
    const { data, error } = await supabase.rpc('crm_sync_subscription_usage', { p_sub_id: subId })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    return row ? mapSub(row) : null
  } catch (e) {
    console.warn('syncSubUsedTrainings failed for', subId, e)
    return null
  }
}

// ─── ATTENDANCE ───
export async function fetchAttendance() {
  const chunk = 1000;
  let from = 0;
  let rows = [];

  while (true) {
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .range(from, from + chunk - 1);
    if (error) throw error;
    const part = data || [];
    rows = rows.concat(part);
    if (part.length < chunk) break;
    from += chunk;
  }

  return rows.map(a => ({
    id: a.id,
    subId: a.sub_id,
    studentId: a.student_id,
    date: a.date,
    guestName: a.guest_name,
    guestType: a.guest_type,
    groupId: a.group_id,
    quantity: a.quantity || 1,
    entryType: a.entry_type || 'subscription',
  }))
}

const mapAttendanceChangeLog = (row) => ({
  id: row.id,
  createdAt: row.created_at,
  actorType: row.actor_type || 'unknown',
  actorEmail: row.actor_email || null,
  actorTrainerId: row.actor_trainer_id || null,
  actorName: row.actor_name || null,
  groupId: row.group_id || null,
  groupName: row.group_name || null,
  studentId: row.student_id || null,
  studentName: row.student_name || null,
  guestName: row.guest_name || null,
  attendanceDate: row.attendance_date || null,
  actionType: row.action_type || 'update',
  changeType: row.change_type || 'unknown',
  previousValue: row.previous_value || null,
  newValue: row.new_value || null,
  subId: row.sub_id || null,
  entryType: row.entry_type || null,
  guestType: row.guest_type || null,
  quantity: row.quantity || null,
  source: row.source || 'unknown',
  details: row.details || null,
})

export async function fetchAttendanceChangeLog({ groupId, dateFrom, dateTo, limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  let query = supabase
    .from('attendance_change_log')
    .select([
      'id',
      'created_at',
      'actor_type',
      'actor_email',
      'actor_trainer_id',
      'actor_name',
      'group_id',
      'group_name',
      'student_id',
      'student_name',
      'guest_name',
      'attendance_date',
      'action_type',
      'change_type',
      'previous_value',
      'new_value',
      'sub_id',
      'entry_type',
      'guest_type',
      'quantity',
      'source',
      'details',
    ].join(','))
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (groupId) query = query.eq('group_id', groupId);
  if (dateFrom) query = query.gte('attendance_date', dateFrom);
  if (dateTo) query = query.lte('attendance_date', dateTo);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapAttendanceChangeLog);
}


const normalizeChangeLogDateTo = (dateTo) => {
  if (!dateTo) return dateTo;
  if (typeof dateTo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return `${dateTo}T23:59:59.999Z`;
  }
  return dateTo;
};

const mapSubscriptionChangeLog = (row) => ({
  id: row.id,
  createdAt: row.created_at,
  actorType: row.actor_type || 'unknown',
  actorAuthUserId: row.actor_auth_user_id || null,
  actorEmail: row.actor_email || null,
  actorName: row.actor_name || null,
  actorTrainerId: row.actor_trainer_id || null,
  subscriptionId: row.subscription_id || null,
  studentId: row.student_id || null,
  studentName: row.student_name || null,
  groupId: row.group_id || null,
  groupName: row.group_name || null,
  actionType: row.action_type || 'update',
  changeType: row.change_type || 'unknown',
  previousValue: row.previous_value ?? null,
  newValue: row.new_value ?? null,
  subscriptionType: row.subscription_type || null,
  status: row.status || null,
  startDate: row.start_date || null,
  endDate: row.end_date || null,
  activationDate: row.activation_date || null,
  originalEndDate: row.original_end_date || null,
  totalTrainings: row.total_trainings ?? null,
  usedTrainings: row.used_trainings ?? null,
  amount: row.amount ?? null,
  basePrice: row.base_price ?? null,
  discountPct: row.discount_pct ?? null,
  discountSource: row.discount_source || null,
  paid: row.paid ?? null,
  payMethod: row.pay_method || null,
  notes: row.notes || null,
  source: row.source || 'unknown',
  details: row.details || null,
});

export async function fetchSubscriptionChangeLog({ groupId, studentId, dateFrom, dateTo, limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  let query = supabase
    .from('subscription_change_log')
    .select([
      'id',
      'created_at',
      'actor_type',
      'actor_auth_user_id',
      'actor_email',
      'actor_name',
      'actor_trainer_id',
      'subscription_id',
      'student_id',
      'student_name',
      'group_id',
      'group_name',
      'action_type',
      'change_type',
      'previous_value',
      'new_value',
      'subscription_type',
      'status',
      'start_date',
      'end_date',
      'activation_date',
      'original_end_date',
      'total_trainings',
      'used_trainings',
      'amount',
      'base_price',
      'discount_pct',
      'discount_source',
      'paid',
      'pay_method',
      'notes',
      'source',
      'details',
    ].join(','))
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (groupId) query = query.eq('group_id', groupId);
  if (studentId) query = query.eq('student_id', studentId);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', normalizeChangeLogDateTo(dateTo));

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapSubscriptionChangeLog);
}

export async function insertAttendance(a) {
  const entryType = String(a.entryType || 'subscription').trim().toLowerCase();
  let guestType = a.guestType ? String(a.guestType).trim().toLowerCase() : null;
  let studentId = a.studentId || null;
  let normalizedEntryType = entryType;
  let guestName = a.guestName || null;
  const DEBUG_ATTENDANCE_PAYLOAD = false;

  // NOTE:
  // stale guestType can leak from UI state for normal student attendance rows.
  // If studentId is present, student row wins over guest semantics:
  // force subscription semantics and clear guest fields (do not throw).
  if (studentId) {
    if (a.subId) normalizedEntryType = 'subscription';
    else if (a.explicitEntryType && entryType === 'trial') normalizedEntryType = 'trial';
    else if (a.explicitEntryType && entryType === 'single') normalizedEntryType = 'single';
    else if (entryType === 'single') normalizedEntryType = 'single';
    else if (entryType === 'unpaid') normalizedEntryType = 'unpaid';
    else normalizedEntryType = 'debt';
    guestType = null;
    guestName = null;
  } else if (entryType === 'trial' || entryType === 'single') {
    if (!guestType) {
      console.warn('insertAttendance warning: guestType missing for trial/single; defaulting to entryType', { entryType, row: a });
    }
    guestType = guestType || entryType;
    studentId = null;
  }
  const normalizedPayload = {
    sub_id: a.subId || null,
    student_id: studentId,
    date: a.date,
    guest_name: guestName,
    guest_type: guestType,
    group_id: a.groupId || null,
    quantity: a.quantity || 1,
    entry_type: normalizedEntryType,
  };
  if (DEBUG_ATTENDANCE_PAYLOAD) console.log("[db.insertAttendance] raw/normalized", { raw: a, normalizedPayload });
  const { data, error } = await supabase.from('attendance').insert(normalizedPayload).select().single()
  if (error) throw error
  await ensureOneOffPaymentForAttendance(data);
  if (data?.sub_id) {
    await syncSubUsedTrainings(data.sub_id);
  }
  return {
    id: data.id,
    subId: data.sub_id,
    studentId: data.student_id,
    date: data.date,
    guestName: data.guest_name,
    guestType: data.guest_type,
    groupId: data.group_id,
    quantity: data.quantity || 1,
    entryType: data.entry_type || 'subscription',
  }
}

export async function deleteAttendance(id) {
  const { data: existing } = await supabase
    .from('attendance')
    .select('id, sub_id, student_id, group_id, date, entry_type, guest_type')
    .eq('id', id)
    .maybeSingle();
  if (existing) {
    await removeOneOffPaymentIfOrphan(existing);
  }
  const { error } = await supabase.from('attendance').delete().eq('id', id)
  if (error) throw error
  if (existing?.sub_id) {
    await syncSubUsedTrainings(existing.sub_id);
  }
}

export async function relinkGuestAttendanceToStudent({ groupId, studentId, attendanceIds = [] }) {
  if (!groupId || !studentId || !Array.isArray(attendanceIds) || !attendanceIds.length) return [];
  const ids = [...new Set(attendanceIds.filter(Boolean))];
  const { data: candidates, error: readErr } = await supabase
    .from('attendance')
    .select('*')
    .eq('group_id', groupId)
    .is('student_id', null)
    .in('id', ids);
  if (readErr) throw readErr;
  const rowIds = (candidates || []).map((r) => r.id);
  if (!rowIds.length) return [];

  const { data, error } = await supabase
    .from('attendance')
    .update({
      student_id: studentId,
      guest_name: null,
      guest_type: null,
      sub_id: null,
    })
    .in('id', rowIds)
    .select('*');
  if (error) throw error;
  const rows = data || [];
  for (const row of rows) {
    await ensureOneOffPaymentForAttendance(row);
  }
  return rows.map((a) => ({
    id: a.id,
    subId: a.sub_id,
    studentId: a.student_id,
    date: a.date,
    guestName: a.guest_name,
    guestType: a.guest_type,
    groupId: a.group_id,
    quantity: a.quantity || 1,
    entryType: a.entry_type || 'subscription',
  }));
}

const ensureOneOffPaymentForAttendance = async (attendanceRow) => {
  if (!attendanceRow?.id) return null
  const { data, error } = await supabase.rpc('crm_ensure_one_off_payment_for_attendance', {
    p_attendance_id: attendanceRow.id,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return row ? mapSub(row) : null
}

const removeOneOffPaymentIfOrphan = async (attendanceRow) => {
  if (!attendanceRow?.id) return
  const { error } = await supabase.rpc('crm_remove_one_off_payment_if_orphan', {
    p_attendance_id: attendanceRow.id,
  })
  if (error) throw error
}

// ─── CANCELLED ───
const mapCancelled = (c) => {
  let parsed = null;
  try {
    parsed = c.reason ? (typeof c.reason === 'string' ? JSON.parse(c.reason) : c.reason) : null;
  } catch (e) {}
  return { id: c.id, groupId: c.group_id, date: c.date, originalEnds: parsed };
};

export async function fetchCancelled() {
  const { data, error } = await supabase.from('cancelled_trainings').select('*')
  if (error) throw error
  return (data || []).map(mapCancelled)
}

export async function fetchScheduleCancelled() {
  const { data, error } = await supabase.rpc('crm_fetch_schedule_cancelled_trainings')
  if (error) throw error
  return (data || []).map(mapCancelled)
}

export async function insertCancelled(c) {
  const { data, error } = await supabase.from('cancelled_trainings').insert({
    group_id: c.groupId,
    date: c.date,
    reason: c.originalEnds ? JSON.stringify(c.originalEnds) : null,
  }).select()
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { id: c.id, groupId: c.groupId, date: c.date, originalEnds: c.originalEnds || null }
  return mapCancelled(row)
}

export async function deleteCancelled(id) {
  const { error } = await supabase.from('cancelled_trainings').delete().eq('id', id);
  if (error) throw error;
}

export async function cancelTrainingForGroup(groupId, date) {
  const { data, error } = await supabase.rpc('crm_cancel_training_for_group', {
    p_group_id: groupId,
    p_date: date,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return {
    cancelled: row?.cancelled_training ? mapCancelled(row.cancelled_training) : null,
    subscriptions: (row?.subscriptions || []).map(mapSub),
  }
}

export async function restoreCancelledTraining(cancelledId) {
  const { data, error } = await supabase.rpc('crm_restore_cancelled_training', {
    p_cancelled_id: cancelledId,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return {
    cancelled: row?.cancelled_training ? mapCancelled(row.cancelled_training) : null,
    subscriptions: (row?.subscriptions || []).map(mapSub),
  }
}

// ─── ROOM BOOKINGS ───
const mapRoomBooking = (b) => ({
  id: b.id,
  date: b.date,
  startTime: b.start_time,
  endTime: b.end_time,
  trainerId: b.trainer_id || null,
  trainerName: b.trainer_name || null,
  title: b.title || "",
  type: b.type || "individual",
  bookingType: b.booking_type || b.type || "individual",
  peopleCount: Number(b.people_count || 0) || null,
  price: Number(b.price || 0) || null,
  paymentMethod: b.payment_method || null,
  eventType: b.event_type || null,
  note: b.note || "",
  color: b.color || null,
  recurrence: b.recurrence || "none",
  recurrenceUntil: b.recurrence_until || null,
  description: b.description || "",
  status: b.status || "active",
  roomName: b.room_name || b.room || b.location || b.hall || null,
  createdAt: b.created_at || null,
});

const mapStudioRoom = (row) => ({
  id: row.id,
  name: row.name,
  isActive: row.is_active !== false,
  sortOrder: Number(row.sort_order || 0),
  createdAt: row.created_at || null,
});

export async function fetchRoomBookings() {
  const { data, error } = await supabase.from('room_bookings').select('*').order('date', { ascending: true }).order('start_time', { ascending: true });
  if (error) {
    console.warn('room_bookings:', error.message);
    return [];
  }
  return (data || []).map(mapRoomBooking);
}

export async function fetchScheduleRoomBookings() {
  const { data, error } = await supabase.rpc('crm_fetch_schedule_room_bookings');
  if (error) {
    console.warn('crm_fetch_schedule_room_bookings:', error.message);
    return [];
  }
  return (data || []).map(mapRoomBooking);
}

export async function insertRoomBooking(payload) {
  const { data, error } = await supabase.from('room_bookings').insert({
    date: payload.date,
    start_time: payload.startTime,
    end_time: payload.endTime,
    trainer_id: payload.trainerId || null,
    trainer_name: payload.trainerName || null,
    title: payload.title,
    type: payload.type || 'individual',
    booking_type: payload.bookingType || payload.type || 'individual',
    people_count: payload.peopleCount || null,
    price: payload.price || null,
    payment_method: payload.paymentMethod || null,
    event_type: payload.eventType || null,
    note: payload.note || null,
    color: payload.color || null,
    recurrence: payload.recurrence || "none",
    recurrence_until: payload.recurrenceUntil || null,
    description: payload.description || null,
    status: payload.status || "active",
    room_name: payload.roomName || 'Основна зала',
  }).select('*').single();
  if (error) throw error;
  return mapRoomBooking(data);
}

export async function updateRoomBooking(id, payload) {
  const next = {};
  if (payload.date !== undefined) next.date = payload.date;
  if (payload.startTime !== undefined) next.start_time = payload.startTime;
  if (payload.endTime !== undefined) next.end_time = payload.endTime;
  if (payload.trainerId !== undefined) next.trainer_id = payload.trainerId || null;
  if (payload.trainerName !== undefined) next.trainer_name = payload.trainerName || null;
  if (payload.title !== undefined) next.title = payload.title;
  if (payload.type !== undefined) next.type = payload.type;
  if (payload.bookingType !== undefined) next.booking_type = payload.bookingType || null;
  if (payload.peopleCount !== undefined) next.people_count = payload.peopleCount || null;
  if (payload.price !== undefined) next.price = payload.price || null;
  if (payload.paymentMethod !== undefined) next.payment_method = payload.paymentMethod || null;
  if (payload.eventType !== undefined) next.event_type = payload.eventType || null;
  if (payload.note !== undefined) next.note = payload.note || null;
  if (payload.color !== undefined) next.color = payload.color || null;
  if (payload.recurrence !== undefined) next.recurrence = payload.recurrence || "none";
  if (payload.recurrenceUntil !== undefined) next.recurrence_until = payload.recurrenceUntil || null;
  if (payload.description !== undefined) next.description = payload.description || null;
  if (payload.status !== undefined) next.status = payload.status || "active";
  if (payload.roomName !== undefined) next.room_name = payload.roomName || 'Основна зала';
  const { data, error } = await supabase.from('room_bookings').update(next).eq('id', id).select('*').single();
  if (error) throw error;
  return mapRoomBooking(data);
}

export async function deleteRoomBooking(id) {
  const { error } = await supabase.from('room_bookings').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchStudioRooms() {
  const { data, error } = await supabase
    .from('studio_rooms')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) {
    console.warn('studio_rooms:', error.message);
    return [];
  }
  return (data || []).map(mapStudioRoom);
}

export async function createStudioRoom(name) {
  const roomName = String(name || '').trim();
  if (!roomName) throw new Error('name is required');
  const { data: existing, error: existingError } = await supabase
    .from('studio_rooms')
    .select('*')
    .ilike('name', roomName)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing && existing.id) {
    const { data, error } = await supabase
      .from('studio_rooms')
      .update({ is_active: true, name: roomName })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return mapStudioRoom(data);
  }

  const { data, error } = await supabase
    .from('studio_rooms')
    .insert({ name: roomName, is_active: true })
    .select('*')
    .single();
  if (error) throw error;
  return mapStudioRoom(data);
}

export async function updateStudioRoom(id, patch = {}) {
  const next = {};
  if (patch.name !== undefined) next.name = String(patch.name || '').trim();
  if (patch.isActive !== undefined) next.is_active = !!patch.isActive;
  if (patch.sortOrder !== undefined) next.sort_order = Number(patch.sortOrder || 0);
  const { data, error } = await supabase
    .from('studio_rooms')
    .update(next)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return mapStudioRoom(data);
}


export async function renameStudioRoom(id, oldName, newName) {
  const nextName = String(newName || '').trim();
  const prevName = String(oldName || '').trim();
  if (!id) throw new Error('id is required');
  if (!nextName) throw new Error('name is required');

  const updatedRoom = await updateStudioRoom(id, { name: nextName });

  if (prevName && prevName.toLowerCase() !== nextName.toLowerCase()) {
    const { error } = await supabase
      .from('room_bookings')
      .update({ room_name: nextName })
      .eq('room_name', prevName);
    if (error) throw error;
  }

  return updatedRoom;
}

// ─── CUSTOM ORDERS ───
export async function fetchMyCustomOrders() {
  const { data, error } = await supabase.rpc('crm_fetch_my_custom_orders');
  if (error) {
    console.warn('crm_fetch_my_custom_orders:', error.message);
    return {};
  }
  return (data || []).reduce((acc, row) => {
    acc[row.group_id] = Array.isArray(row.student_ids) ? row.student_ids : [];
    return acc;
  }, {});
}

// ─── ATTENDANCE WARNED FLAGS ───
const warnedKey = (groupId, studentId) => `${groupId}:${studentId}`;

export async function fetchWarnedStudents() {
  const { data, error } = await supabase.from('attendance_warned_students').select('*');
  if (error) {
    console.warn('attendance_warned_students:', error.message);
    return {};
  }
  return (data || []).reduce((acc, row) => {
    const key = warnedKey(row.group_id, row.student_id);
    acc[key] = !!row.warned;
    return acc;
  }, {});
}

export async function upsertWarnedStudent(groupId, studentId, warned) {
  const payload = {
    group_id: String(groupId),
    student_id: String(studentId),
    warned: !!warned,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('attendance_warned_students')
    .upsert(payload, { onConflict: 'group_id,student_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ─── WAITLIST ───
const mapWaitlist = (w) => ({
  id: w.id,
  studentId: w.studentId ?? null,
  groupId: w.groupId ?? "",
  dateAdded: w.dateAdded ?? null,
  name: w.name || "",
  contact: w.contact || "",
  note: w.note || "",
  status: w.status || "waiting",
  createdAt: w.created_at || w.createdAt || null,
});

export async function fetchWaitlist() {
  const { data, error } = await supabase.from('waitlist').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapWaitlist);
}

export async function insertWaitlist(item) {
  const payload = {
    studentId: item.studentId || null,
    groupId: item.groupId,
    dateAdded: item.dateAdded || new Date().toISOString().slice(0, 10),
    name: item.name || null,
    contact: item.contact || null,
    note: item.note || null,
    status: item.status || "waiting",
  };
  const { data, error } = await supabase.from('waitlist').insert(payload).select('*').single();
  if (error) throw error;
  return mapWaitlist(data);
}

export async function updateWaitlist(id, patch = {}) {
  const payload = {};
  if (Object.prototype.hasOwnProperty.call(patch, "studentId")) payload.studentId = patch.studentId || null;
  if (Object.prototype.hasOwnProperty.call(patch, "groupId")) payload.groupId = patch.groupId || null;
  if (Object.prototype.hasOwnProperty.call(patch, "dateAdded")) payload.dateAdded = patch.dateAdded || null;
  if (Object.prototype.hasOwnProperty.call(patch, "name")) payload.name = patch.name || null;
  if (Object.prototype.hasOwnProperty.call(patch, "contact")) payload.contact = patch.contact || null;
  if (Object.prototype.hasOwnProperty.call(patch, "note")) payload.note = patch.note || null;
  if (Object.prototype.hasOwnProperty.call(patch, "status")) payload.status = patch.status || "waiting";
  const { data, error } = await supabase.from("waitlist").update(payload).eq("id", id).select('*').single();
  if (error) throw error;
  return mapWaitlist(data);
}

export async function deleteWaitlist(id) {
  const { error } = await supabase.from('waitlist').delete().eq('id', id);
  if (error) throw error;
}

// ─── TRIAL BOOKINGS ───
export const mapTrialBooking = (row) => ({
  id: row.id,
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
  studentId: row.student_id || null,
  name: row.name || "",
  phone: row.phone || "",
  telegram: row.telegram || "",
  instagram: row.instagram || "",
  contact: row.contact || "",
  directionId: row.direction_id || null,
  groupId: row.group_id || "",
  trialDate: row.trial_date || null,
  status: row.status || "new",
  note: row.note || "",
  source: row.source || "",
  convertedStudentId: row.converted_student_id || null,
});

const trialBookingPayload = (input = {}, { includeDefaults = false } = {}) => {
  const payload = {};
  if (Object.prototype.hasOwnProperty.call(input, "studentId")) payload.student_id = input.studentId || null;
  if (Object.prototype.hasOwnProperty.call(input, "name")) payload.name = input.name;
  if (Object.prototype.hasOwnProperty.call(input, "phone")) payload.phone = input.phone || null;
  if (Object.prototype.hasOwnProperty.call(input, "telegram")) payload.telegram = input.telegram || null;
  if (Object.prototype.hasOwnProperty.call(input, "instagram")) payload.instagram = input.instagram || null;
  if (Object.prototype.hasOwnProperty.call(input, "contact")) payload.contact = input.contact || null;
  if (Object.prototype.hasOwnProperty.call(input, "directionId")) payload.direction_id = input.directionId || null;
  if (Object.prototype.hasOwnProperty.call(input, "groupId")) payload.group_id = input.groupId || null;
  if (Object.prototype.hasOwnProperty.call(input, "trialDate")) payload.trial_date = input.trialDate || null;
  if (Object.prototype.hasOwnProperty.call(input, "status")) payload.status = input.status || "new";
  if (Object.prototype.hasOwnProperty.call(input, "note")) payload.note = input.note || null;
  if (Object.prototype.hasOwnProperty.call(input, "source")) payload.source = input.source || null;
  if (Object.prototype.hasOwnProperty.call(input, "convertedStudentId")) {
    payload.converted_student_id = input.convertedStudentId || null;
  }

  if (includeDefaults && !Object.prototype.hasOwnProperty.call(payload, "status")) {
    payload.status = "new";
  }

  return payload;
};

export async function fetchTrialBookings(filters = {}) {
  const safeLimit = Math.max(1, Math.min(Number(filters.limit) || 200, 500));
  let query = supabase
    .from('trial_bookings')
    .select('*')
    .order('trial_date', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (filters.dateFrom) query = query.gte('trial_date', filters.dateFrom);
  if (filters.dateTo) query = query.lte('trial_date', filters.dateTo);
  if (filters.groupId) query = query.eq('group_id', filters.groupId);
  if (filters.studentId) query = query.eq('student_id', filters.studentId);
  if (Array.isArray(filters.status)) {
    if (filters.status.length > 0) query = query.in('status', filters.status);
  } else if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapTrialBooking);
}

export async function insertTrialBooking(input = {}) {
  if (!String(input.name || '').trim()) throw new Error('Trial booking name is required');
  if (!input.groupId) throw new Error('Trial booking groupId is required');
  if (!input.trialDate) throw new Error('Trial booking trialDate is required');

  const payload = trialBookingPayload(input, { includeDefaults: true });
  const { data, error } = await supabase.from('trial_bookings').insert(payload).select('*').single();
  if (error) throw error;
  return mapTrialBooking(data);
}


export async function convertTrialBookingToStudent(trialBookingId) {
  if (!trialBookingId) throw new Error('trialBookingId is required');
  const { data, error } = await supabase.rpc('crm_convert_trial_booking_to_student', {
    p_trial_booking_id: trialBookingId,
  });
  if (error) throw error;

  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload) throw new Error('RPC crm_convert_trial_booking_to_student did not return data');

  const studentRow = payload.student || null;
  const linkRow = payload.student_group || null;
  const bookingRow = payload.trial_booking || null;

  return {
    student: studentRow ? mapStudent(studentRow) : null,
    studentGroup: linkRow ? { id: linkRow.id, studentId: linkRow.student_id, groupId: linkRow.group_id } : null,
    trialBooking: bookingRow ? mapTrialBooking(bookingRow) : null,
  };
}
export async function updateTrialBooking(id, patch = {}) {
  const payload = trialBookingPayload(patch);
  const { data, error } = await supabase.from('trial_bookings').update(payload).eq('id', id).select('*').single();
  if (error) throw error;
  return mapTrialBooking(data);
}

export async function deleteTrialBooking(id) {
  const { error } = await supabase.from('trial_bookings').delete().eq('id', id);
  if (error) throw error;
  return true;
}

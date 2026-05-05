import { supabase } from './supabase'
import { PLAN_TYPES } from './shared/constants'

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

// ─── STUDENTS ───
export async function fetchStudents() {
  const { data, error } = await supabase.from('students').select('*')
  if (error) throw error
  return data.map(s => ({
    ...s,
    messageTemplate: s.message_template,
    firstName: s.first_name,
    lastName: s.last_name,
  }))
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
  return {
    ...data,
    messageTemplate: data.message_template,
    firstName: data.first_name,
    lastName: data.last_name,
  }
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
  return {
    ...data,
    messageTemplate: data.message_template,
    firstName: data.first_name,
    lastName: data.last_name,
  }
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
export async function fetchGroups() {
  const { data, error } = await supabase.from('groups').select('*')
  if (error) throw error
  return data.map(g => ({
    ...g,
    directionId: g.direction_id,
    trainerPct: g.trainer_pct,
    trainer_id: g.trainer_id,
  }))
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
export async function fetchSubs() {
  const { data, error } = await supabase.from('subscriptions').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data.map(mapSub)
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
  if (!subId) return;
  try {
    // Читаємо всі відмітки по абонементу
    const { data, error } = await supabase
      .from('attendance')
      .select('date, quantity')
      .eq('sub_id', subId)
      .order('date', { ascending: true });

    if (error) throw error;

    const total = (data || []).reduce((s, r) => s + (r.quantity || 1), 0);
    const firstDate = data && data.length > 0 ? data[0].date : null;
    const lastDate = data && data.length > 0 ? data[data.length - 1].date : null;

    // Читаємо поточний стан абонемента
    const { data: currentSub, error: getErr } = await supabase
      .from('subscriptions')
      .select('activation_date, start_date, end_date, original_end_date, plan_type, total_trainings')
      .eq('id', subId)
      .single();

    if (getErr) throw getErr;

    const payload = { used_trainings: total };
    if (!currentSub?.original_end_date && currentSub?.end_date) {
      payload.original_end_date = currentSub.end_date;
    }

    if (firstDate) {
      // Є відвідування — оновлюємо activation_date якщо треба
      if (!currentSub?.activation_date || currentSub.activation_date !== firstDate) {
        payload.activation_date = firstDate;
        // І перераховуємо end_date = firstDate + 1 місяць
        const d = new Date(firstDate + "T12:00:00");
        d.setMonth(d.getMonth() + 1);
        payload.end_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      const planType = String(currentSub?.plan_type || "").toLowerCase();
      const isPack = planType === "4pack" || planType === "8pack" || planType === "12pack";
      const totalTrainings = Number(currentSub?.total_trainings || 0);
      const isFullyUsed = totalTrainings > 0 && total >= totalTrainings;
      if (isPack) {
        if (isFullyUsed && lastDate && currentSub?.end_date && lastDate < currentSub.end_date) {
          payload.end_date = lastDate;
        } else if (!isFullyUsed) {
          const originalEnd = currentSub?.original_end_date || currentSub?.end_date || null;
          if (originalEnd && currentSub?.end_date && currentSub.end_date < originalEnd) {
            payload.end_date = originalEnd;
          }
        }
      }
    } else {
      // Відвідувань не залишилось — скидаємо activation_date і повертаємо end_date = startDate + 1 міс
      if (currentSub?.activation_date) {
        payload.activation_date = null;
        if (currentSub.start_date) {
          const d = new Date(currentSub.start_date + "T12:00:00");
          d.setMonth(d.getMonth() + 1);
          payload.end_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
      }
    }

    const { error: updErr } = await supabase
      .from('subscriptions')
      .update(payload)
      .eq('id', subId);

    if (updErr) throw updErr;
    return total;
  } catch (e) {
    console.warn('syncSubUsedTrainings failed for', subId, e);
    return null;
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
  const { error } = await supabase.from('attendance').delete().eq('id', id)
  if (error) throw error
  if (existing?.sub_id) {
    await syncSubUsedTrainings(existing.sub_id);
  }
  if (existing) {
    await removeOneOffPaymentIfOrphan(existing);
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
      guest_type: null,
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

const ONE_OFF_PLAN_TYPES = new Set(["trial", "single"]);
const ONE_OFF_PRICE_BY_PLAN = Object.fromEntries(
  (Array.isArray(PLAN_TYPES) ? PLAN_TYPES : [])
    .filter((p) => ONE_OFF_PLAN_TYPES.has(String(p?.id || "").trim().toLowerCase()))
    .map((p) => [String(p.id).trim().toLowerCase(), Number(p.price || 0)])
);
const normalizeOneOffType = (value) => String(value || "").trim().toLowerCase();

const ensureOneOffPaymentForAttendance = async (attendanceRow) => {
  const entryType = normalizeOneOffType(attendanceRow?.entry_type || attendanceRow?.guest_type || "");
  if (!ONE_OFF_PLAN_TYPES.has(entryType)) return;
  const studentId = attendanceRow?.student_id;
  const groupId = attendanceRow?.group_id;
  const date = String(attendanceRow?.date || "").slice(0, 10);
  if (!studentId || !groupId || !date) return;
  const amount = Number(ONE_OFF_PRICE_BY_PLAN[entryType] || 0);

  const { data: existing, error: existingErr } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('student_id', studentId)
    .eq('group_id', groupId)
    .eq('plan_type', entryType)
    .eq('activation_date', date)
    .eq('start_date', date)
    .eq('end_date', date)
    .eq('paid', true)
    .limit(1)
    .maybeSingle();
  if (existingErr) throw existingErr;
  if (existing?.id) return;

  const { error } = await supabase.from('subscriptions').insert({
    student_id: studentId,
    group_id: groupId,
    plan_type: entryType,
    start_date: date,
    end_date: date,
    activation_date: date,
    total_trainings: 1,
    used_trainings: 1,
    amount,
    base_price: amount,
    discount_pct: 0,
    discount_source: 'studio',
    paid: true,
    pay_method: 'card',
    notification_sent: false,
    notes: `auto_one_off_from_attendance:${attendanceRow?.id || ''}`,
  });
  if (error) throw error;
};

const removeOneOffPaymentIfOrphan = async (attendanceRow) => {
  const entryType = normalizeOneOffType(attendanceRow?.entry_type || attendanceRow?.guest_type || "");
  if (!ONE_OFF_PLAN_TYPES.has(entryType)) return;
  const studentId = attendanceRow?.student_id;
  const groupId = attendanceRow?.group_id;
  const date = String(attendanceRow?.date || "").slice(0, 10);
  if (!studentId || !groupId || !date) return;

  const { data: stillHasAttendance, error: attnErr } = await supabase
    .from('attendance')
    .select('id')
    .eq('student_id', studentId)
    .eq('group_id', groupId)
    .eq('date', date)
    .eq('entry_type', entryType)
    .limit(1)
    .maybeSingle();
  if (attnErr) throw attnErr;
  if (stillHasAttendance?.id) return;

  const { error: delErr } = await supabase
    .from('subscriptions')
    .delete()
    .eq('student_id', studentId)
    .eq('group_id', groupId)
    .eq('plan_type', entryType)
    .eq('activation_date', date)
    .eq('start_date', date)
    .eq('end_date', date);
  if (delErr) throw delErr;
};

// ─── CANCELLED ───
export async function fetchCancelled() {
  const { data, error } = await supabase.from('cancelled_trainings').select('*')
  if (error) throw error
  return data.map(c => {
    let parsed = null;
    try { parsed = c.reason ? JSON.parse(c.reason) : null; } catch (e) {}
    return { id: c.id, groupId: c.group_id, date: c.date, originalEnds: parsed };
  })
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
  return { id: row.id, groupId: row.group_id, date: row.date, originalEnds: row.reason ? JSON.parse(row.reason) : null }
}

export async function deleteCancelled(id) {
  const { error } = await supabase.from('cancelled_trainings').delete().eq('id', id);
  if (error) throw error;
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
  createdAt: b.created_at || null,
});

export async function fetchRoomBookings() {
  const { data, error } = await supabase.from('room_bookings').select('*').order('date', { ascending: true }).order('start_time', { ascending: true });
  if (error) {
    console.warn('room_bookings:', error.message);
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
  const { data, error } = await supabase.from('room_bookings').update(next).eq('id', id).select('*').single();
  if (error) throw error;
  return mapRoomBooking(data);
}

export async function deleteRoomBooking(id) {
  const { error } = await supabase.from('room_bookings').delete().eq('id', id);
  if (error) throw error;
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
export async function fetchWaitlist() {
  const { data, error } = await supabase.from('waitlist').select('*');
  if (error) { console.warn('waitlist:', error.message); return []; }
  return (data || []).map(w => ({
    id: w.id,
    studentId: w.studentId,
    groupId: w.groupId,
    dateAdded: w.dateAdded,
    name: w.name || "",
    contact: w.contact || "",
    note: w.note || "",
    status: w.status || "waiting",
    createdAt: w.created_at || null,
  }));
}

export async function insertWaitlist(item) {
  const { data, error } = await supabase.from('waitlist').insert([{
    studentId: item.studentId || null,
    groupId: item.groupId,
    dateAdded: item.dateAdded || new Date().toISOString().slice(0, 10),
    name: item.name || null,
    contact: item.contact || null,
    note: item.note || null,
    status: item.status || "waiting",
  }]).select();
  if (error) throw error;
  const w = data[0];
  return {
    id: w.id,
    studentId: w.studentId,
    groupId: w.groupId,
    dateAdded: w.dateAdded,
    name: w.name || "",
    contact: w.contact || "",
    note: w.note || "",
    status: w.status || "waiting",
    createdAt: w.created_at || null,
  };
}

export async function updateWaitlist(id, patch = {}) {
  const payload = {};
  if (Object.prototype.hasOwnProperty.call(patch, "studentId")) payload.studentId = patch.studentId || null;
  if (Object.prototype.hasOwnProperty.call(patch, "groupId")) payload.groupId = patch.groupId || null;
  if (Object.prototype.hasOwnProperty.call(patch, "name")) payload.name = patch.name || null;
  if (Object.prototype.hasOwnProperty.call(patch, "contact")) payload.contact = patch.contact || null;
  if (Object.prototype.hasOwnProperty.call(patch, "note")) payload.note = patch.note || null;
  if (Object.prototype.hasOwnProperty.call(patch, "status")) payload.status = patch.status || "waiting";
  const { data, error } = await supabase.from("waitlist").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return {
    id: data.id,
    studentId: data.studentId,
    groupId: data.groupId,
    dateAdded: data.dateAdded,
    name: data.name || "",
    contact: data.contact || "",
    note: data.note || "",
    status: data.status || "waiting",
    createdAt: data.created_at || null,
  };
}

export async function deleteWaitlist(id) {
  const { error } = await supabase.from('waitlist').delete().eq('id', id);
  if (error) throw error;
}

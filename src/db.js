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
  if (g.schedule !== undefined) payload.schedule = g.schedule
  if (g.trainerPct !== undefined) payload.trainer_pct = g.trainerPct
  if (g.trainer_id !== undefined) payload.trainer_id = g.trainer_id

  const { data, error } = await supabase.from('groups').update(payload).eq('id', id).select().single()
  if (error) throw error
  return { ...data, directionId: data.direction_id, trainerPct: data.trainer_pct, trainer_id: data.trainer_id }
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
  const payload = { trainer_id: trainerId, group_id: groupId };
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
  const { data, error } = await supabase.from('subscriptions').insert({
    student_id: s.studentId,
    group_id: s.groupId,
    plan_type: s.planType,
    start_date: s.startDate,
    end_date: s.endDate,
    activation_date: s.activationDate || null,  // 🆕
    total_trainings: s.totalTrainings,
    used_trainings: s.usedTrainings || 0,
    amount: s.amount,
    base_price: s.basePrice || s.amount,
    discount_pct: s.discountPct || 0,
    discount_source: s.discountSource || 'studio',
    paid: s.paid,
    pay_method: s.payMethod || 'card',
    notification_sent: false,
    notes: s.notes,
  }).select().single()
  if (error) throw error
  return mapSub(data)
}

export async function updateSub(id, s) {
  const payload = {}
  if (s.planType !== undefined) payload.plan_type = s.planType
  if (s.startDate !== undefined) payload.start_date = s.startDate
  if (s.endDate !== undefined) payload.end_date = s.endDate
  if (s.activationDate !== undefined) payload.activation_date = s.activationDate  // 🆕
  if (s.totalTrainings !== undefined) payload.total_trainings = s.totalTrainings
  if (s.usedTrainings !== undefined) payload.used_trainings = s.usedTrainings
  if (s.amount !== undefined) payload.amount = s.amount
  if (s.basePrice !== undefined) payload.base_price = s.basePrice
  if (s.discountPct !== undefined) payload.discount_pct = s.discountPct
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
    activationDate: s.activation_date,  // 🆕
    totalTrainings: s.total_trainings,
    usedTrainings: s.used_trainings,
    amount: s.amount,
    basePrice: s.base_price,
    discountPct: s.discount_pct,
    discountSource: s.discount_source,
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

    // Читаємо поточний стан абонемента
    const { data: currentSub, error: getErr } = await supabase
      .from('subscriptions')
      .select('activation_date, start_date')
      .eq('id', subId)
      .single();

    if (getErr) throw getErr;

    const payload = { used_trainings: total };

    if (firstDate) {
      // Є відвідування — оновлюємо activation_date якщо треба
      if (!currentSub?.activation_date || currentSub.activation_date !== firstDate) {
        payload.activation_date = firstDate;
        // І перераховуємо end_date = firstDate + 1 місяць
        const d = new Date(firstDate + "T12:00:00");
        d.setMonth(d.getMonth() + 1);
        payload.end_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const { data, error } = await supabase.from('attendance').insert({
    sub_id: a.subId || null,
    student_id: a.studentId || null,
    date: a.date,
    guest_name: a.guestName || null,
    guest_type: a.guestType || null,
    group_id: a.groupId || null,
    quantity: a.quantity || 1,
    entry_type: a.entryType || 'subscription',
  }).select().single()
  if (error) throw error
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
  const { error } = await supabase.from('attendance').delete().eq('id', id)
  if (error) throw error
}

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
  return (data || []).map(w => ({ id: w.id, studentId: w.student_id, groupId: w.group_id, dateAdded: w.date_added }));
}

export async function insertWaitlist(item) {
  const { data, error } = await supabase.from('waitlist').insert([{
    student_id: item.studentId,
    group_id: item.groupId,
    date_added: item.dateAdded || new Date().toISOString().slice(0, 10),
  }]).select();
  if (error) throw error;
  const w = data[0];
  return { id: w.id, studentId: w.student_id, groupId: w.group_id, dateAdded: w.date_added };
}

export async function deleteWaitlist(id) {
  const { error } = await supabase.from('waitlist').delete().eq('id', id);
  if (error) throw error;
}

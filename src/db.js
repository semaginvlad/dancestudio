import { supabase } from './supabase'

// ─── AUTH (ЛОГІН / ТРЕНЕРИ) ───
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
  const { error } = await supabase.from('students').delete().eq('id', id)
  if (error) throw error
}

// ─── STUDENT GROUPS ───
export async function fetchStudentGroups() {
  const { data, error } = await supabase.from('student_groups').select('*')
  if (error) {
    console.warn('student_groups:', error.message)
    return []
  }
  return data.map(sg => ({
    id: sg.id,
    studentId: sg.student_id,
    groupId: sg.group_id,
  }))
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
  }))
}

export async function updateGroup(id, g) {
  const payload = {}
  if (g.name !== undefined) payload.name = g.name
  if (g.schedule !== undefined) payload.schedule = g.schedule
  if (g.trainerPct !== undefined) payload.trainer_pct = g.trainerPct

  const { data, error } = await supabase.from('groups').update(payload).eq('id', id).select().single()
  if (error) throw error
  return { ...data, directionId: data.direction_id, trainerPct: data.trainer_pct }
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
  }
}

// ─── ATTENDANCE ───
export async function fetchAttendance() {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) throw error

  return data.map(a => ({
    id: a.id,
    subId: a.sub_id,
    date: a.date,
    guestName: a.guest_name,
    guestType: a.guest_type,
    groupId: a.group_id,
    quantity: a.quantity || 1,
    entryType: a.entry_type || 'subscription',
    createdAt: a.created_at,
  }))
}

export async function insertAttendance(a) {
  const { data, error } = await supabase.from('attendance').insert({
      sub_id: a.subId || null,
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

export async function deleteAttendanceBySubAndDate(subId, date) {
  const { error } = await supabase.from('attendance').delete().eq('sub_id', subId).eq('date', date)
  if (error) throw error
}

// ─── CANCELLED ───
export async function fetchCancelled() {
  const { data, error } = await supabase.from('cancelled_trainings').select('*')
  if (error) throw error

  return data.map(c => {
    let parsed = null;
    try { parsed = c.reason ? JSON.parse(c.reason) : null; } catch(e) {}
    return { id: c.id, groupId: c.group_id, date: c.date, originalEnds: parsed };
  })
}

export async function insertCancelled(c) {
  const { data, error } = await supabase.from('cancelled_trainings').insert({
      group_id: c.groupId,
      date: c.date,
      reason: c.originalEnds ? JSON.stringify(c.originalEnds) : null,
    }).select().single()

  if (error) throw error

  return { id: data.id, groupId: data.group_id, date: data.date, originalEnds: data.reason ? JSON.parse(data.reason) : null }
}

export async function deleteCancelled(id) {
  const { error } = await supabase.from('cancelled_trainings').delete().eq('id', id);
  if (error) throw error;
}

// ─── HELPERS ───
export async function incrementUsed(subId, qty = 1) {
  const { data: sub } = await supabase.from('subscriptions').select('used_trainings').eq('id', subId).single()
  if (sub) {
    await supabase.from('subscriptions').update({ used_trainings: (sub.used_trainings || 0) + qty }).eq('id', subId)
  }
}

export async function decrementUsed(subId, qty = 1) {
  const { data: sub } = await supabase.from('subscriptions').select('used_trainings').eq('id', subId).single()
  if (sub) {
    await supabase.from('subscriptions').update({ used_trainings: Math.max(0, (sub.used_trainings || 0) - qty) }).eq('id', subId)
  }
}

// ─── WAITLIST ───
export async function fetchWaitlist() {
  const { data, error } = await supabase.from('waitlist').select('*');
  if (error) return [];
  return data || [];
}

export async function insertWaitlist(item) {
  const { data, error } = await supabase.from('waitlist').insert([item]).select();
  if (error) throw error;
  return data[0];
}

export async function deleteWaitlist(id) {
  const { error } = await supabase.from('waitlist').delete().eq('id', id);
  if (error) throw error;
}

export const classificationTypeForEventType = (eventType) =>
  eventType === 'individual_training' ? 'individual' : 'room_booking';

export const buildRoomBookingRpcParams = (payload = {}) => {
  const hasBookingType = Object.prototype.hasOwnProperty.call(payload, 'bookingType');
  const eventType = payload.eventType ?? null;
  const type = payload.type ?? classificationTypeForEventType(eventType);
  return {
    p_date: payload.date,
    p_start_time: payload.startTime,
    p_end_time: payload.endTime,
    p_trainer_id: payload.trainerId ?? null,
    p_trainer_name: payload.trainerName ?? null,
    p_title: payload.title,
    p_type: type,
    p_booking_type: hasBookingType
      ? payload.bookingType
      : (eventType === 'individual_training' ? 'individual' : null),
    p_people_count: payload.peopleCount ?? null,
    p_price: payload.price ?? null,
    p_payment_method: payload.paymentMethod ?? null,
    p_event_type: eventType,
    p_note: payload.note ?? null,
    p_color: payload.color ?? null,
    p_recurrence: payload.recurrence ?? 'none',
    p_recurrence_until: payload.recurrenceUntil ?? null,
    p_description: payload.description ?? null,
    p_status: payload.status ?? 'active',
    p_room_name: payload.roomName ?? 'Основна зала',
  };
};

export const buildRoomBookingInsertRow = (payload) => ({
    date: payload.date,
    start_time: payload.startTime,
    end_time: payload.endTime,
    trainer_id: payload.trainerId || null,
    trainer_name: payload.trainerName || null,
    title: payload.title,
    type: payload.type ?? classificationTypeForEventType(payload.eventType),
    booking_type: Object.prototype.hasOwnProperty.call(payload, 'bookingType')
      ? payload.bookingType
      : (payload.eventType === 'individual_training' ? 'individual' : null),
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
  });


export const buildRoomBookingUpdateRow = (payload) => {
  const next = {};
  if (payload.date !== undefined) next.date = payload.date;
  if (payload.startTime !== undefined) next.start_time = payload.startTime;
  if (payload.endTime !== undefined) next.end_time = payload.endTime;
  if (payload.trainerId !== undefined) next.trainer_id = payload.trainerId || null;
  if (payload.trainerName !== undefined) next.trainer_name = payload.trainerName || null;
  if (payload.title !== undefined) next.title = payload.title;
  if (payload.type !== undefined) next.type = payload.type;
  if (payload.bookingType !== undefined) next.booking_type = payload.bookingType;
  if (payload.peopleCount !== undefined) next.people_count = payload.peopleCount || null;
  if (payload.price !== undefined) next.price = payload.price || null;
  if (payload.paymentMethod !== undefined) next.payment_method = payload.paymentMethod || null;
  if (payload.eventType !== undefined) next.event_type = payload.eventType;
  if (payload.note !== undefined) next.note = payload.note || null;
  if (payload.color !== undefined) next.color = payload.color || null;
  if (payload.recurrence !== undefined) next.recurrence = payload.recurrence || "none";
  if (payload.recurrenceUntil !== undefined) next.recurrence_until = payload.recurrenceUntil || null;
  if (payload.description !== undefined) next.description = payload.description || null;
  if (payload.status !== undefined) next.status = payload.status || "active";
  if (payload.roomName !== undefined) next.room_name = payload.roomName || 'Основна зала';
  return next;
};

export const mapRoomBookingRow = (row) => ({
  id: row.id,
  date: row.date,
  startTime: row.start_time,
  endTime: row.end_time,
  trainerId: row.trainer_id ?? null,
  trainerName: row.trainer_name ?? null,
  title: row.title || "",
  type: row.type || "individual",
  bookingType: row.booking_type ?? null,
  peopleCount: Number(row.people_count || 0) || null,
  price: Number(row.price || 0) || null,
  paymentMethod: row.payment_method ?? null,
  eventType: row.event_type ?? null,
  note: row.note || "",
  color: row.color ?? null,
  recurrence: row.recurrence || "none",
  recurrenceUntil: row.recurrence_until ?? null,
  description: row.description || "",
  status: row.status || "active",
  roomName: row.room_name || row.room || row.location || row.hall || null,
  createdAt: row.created_at ?? null,
});

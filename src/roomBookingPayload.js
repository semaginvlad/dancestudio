export const buildRoomBookingInsertRow = (payload) => ({
    date: payload.date,
    start_time: payload.startTime,
    end_time: payload.endTime,
    trainer_id: payload.trainerId || null,
    trainer_name: payload.trainerName || null,
    title: payload.title,
    type: payload.type ?? (payload.eventType === 'individual_training' ? 'individual' : 'room_booking'),
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


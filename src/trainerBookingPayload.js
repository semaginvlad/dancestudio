import { classificationTypeForEventType } from './roomBookingPayload.js';

export function normalizeTrainerBookingPayload({ payload = {}, existing = null, currentUserId = null, ownerIds = [] }) {
  const { price: _price, paymentMethod: _paymentMethod, payment_method: _paymentMethodSnake, ...operational } = payload;
  if (existing) {
    return {
      ...operational,
      trainerId: existing.trainerId || existing.trainer_id,
      type: existing.type,
      bookingType: existing.bookingType ?? existing.booking_type ?? null,
      eventType: existing.eventType ?? existing.event_type ?? null,
    };
  }
  const eventType = ["room_booking", "individual_training"].includes(String(payload.eventType || ""))
    ? payload.eventType
    : "room_booking";
  const requestedOwner = payload.trainerId || payload.trainer_id || null;
  return {
    ...operational,
    trainerId: requestedOwner && ownerIds.map(String).includes(String(requestedOwner)) ? requestedOwner : currentUserId,
    type: classificationTypeForEventType(eventType),
    eventType,
    bookingType: eventType === "individual_training" ? payload.bookingType || "individual" : null,
    peopleCount: eventType === "individual_training" ? payload.peopleCount || null : null,
  };
}

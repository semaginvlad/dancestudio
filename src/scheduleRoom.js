export const UNKNOWN_ROOM_NAME = "Зала не вказана";

const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export const getStoredRoomName = (event = {}) => {
  const source = event || {};
  return normalize(source.roomName ?? source.room_name) ||
    normalize(source.room) ||
    normalize(source.location) ||
    normalize(source.hall);
};

export const getStoredRoomId = (event = {}) => normalize(event.roomId ?? event.room_id);

export const resolveScheduleRoomName = (event, roomNameById, fallbackEvent = null) => {
  const roomId = getStoredRoomId(event);
  if (roomId && roomNameById?.has(roomId)) return roomNameById.get(roomId);
  return getStoredRoomName(event) || getStoredRoomName(fallbackEvent) || UNKNOWN_ROOM_NAME;
};

export const resolveOverrideRoomName = (override, baseSlot, roomNameById) => {
  if (override?.status === "active") {
    const overrideName = resolveScheduleRoomName(override, roomNameById);
    if (overrideName !== UNKNOWN_ROOM_NAME) return overrideName;
  }
  return resolveScheduleRoomName(baseSlot, roomNameById);
};

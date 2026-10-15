export function resolveStudioRoomsResponse(data, error, { strict = false, warn = console.warn } = {}) {
  if (error) {
    if (strict) throw error;
    warn?.("studio_rooms:", error.message);
    return [];
  }
  return Array.isArray(data) ? data : [];
}

export async function loadStudioRoomsState(fetchRooms, { setStatus, setRooms, onError } = {}) {
  setStatus?.("loading");
  try {
    const result = await fetchRooms();
    const rooms = Array.isArray(result) ? result : [];
    setRooms?.(rooms);
    setStatus?.("ready");
    return { ok: true, rooms };
  } catch (error) {
    onError?.(error);
    setStatus?.("error");
    return { ok: false, error };
  }
}

export const ROOM_BOOKING_CLOSED_MESSAGE = "Цей зал тимчасово недоступний для бронювання. Оберіть інший зал.";

export function canonicalStudioRoomName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("uk-UA");
}

export function findStudioRoomByName(rooms = [], roomName = "") {
  const wanted = canonicalStudioRoomName(roomName);
  return (Array.isArray(rooms) ? rooms : []).find((room) =>
    canonicalStudioRoomName(room?.name) === wanted,
  ) || null;
}

export function isStudioRoomBookingOpen(rooms = [], roomName = "") {
  const room = findStudioRoomByName(rooms, roomName);
  return !room || room.bookingOpen !== false;
}

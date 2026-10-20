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

export function studioRoomAllowsTrainer(room = {}, trainerIds = []) {
  const allowed = new Set((room?.allowedTrainerIds || []).map(String));
  return (trainerIds || []).some((id) => allowed.has(String(id)));
}

export function isStudioRoomBookingOpenForActor(rooms = [], roomName = "", { isAdmin = false, trainerIds = [], trainerAccessKnown = true } = {}) {
  if (isAdmin) return true;
  const room = findStudioRoomByName(rooms, roomName);
  return !room || room.bookingOpen !== false || !trainerAccessKnown || studioRoomAllowsTrainer(room, trainerIds);
}

export function shouldBlockStudioRoomBookingMutation(rooms = [], payload = {}, { removesOnlyOccurrences = false, isAdmin = false, trainerIds = [], trainerAccessKnown = true } = {}) {
  if (isAdmin || removesOnlyOccurrences || String(payload?.status || "").toLowerCase() === "cancelled") return false;
  return !isStudioRoomBookingOpenForActor(rooms, payload?.roomName, { isAdmin, trainerIds, trainerAccessKnown });
}

export async function refreshStudioRoomBookingAvailability(fetchRooms, payload = {}, options = {}) {
  if (options.removesOnlyOccurrences || String(payload?.status || "").toLowerCase() === "cancelled") {
    return { blocked: false, refreshed: false, rooms: null };
  }
  const rooms = await fetchRooms();
  return {
    blocked: shouldBlockStudioRoomBookingMutation(rooms, payload, options),
    refreshed: true,
    rooms,
  };
}

export function resolveStudioRoomBookingSelection(rooms = [], selectedRoom = "all", { isAdmin = false, trainerIds = [], trainerAccessKnown = true } = {}) {
  const activeOpenRooms = (Array.isArray(rooms) ? rooms : []).filter((room) =>
    room?.isActive !== false && isStudioRoomBookingOpenForActor([room], room?.name, { isAdmin, trainerIds, trainerAccessKnown }) && canonicalStudioRoomName(room?.name),
  );
  if (selectedRoom !== "all") {
    const selected = findStudioRoomByName(activeOpenRooms, selectedRoom);
    if (selected) return String(selected.name || "").trim().replace(/\s+/g, " ");
  }
  return String(activeOpenRooms[0]?.name || "").trim().replace(/\s+/g, " ");
}

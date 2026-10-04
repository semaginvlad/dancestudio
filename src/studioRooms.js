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

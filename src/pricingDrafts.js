export function mergeCatalogIntoPriceDrafts(prices = [], drafts = {}, dirtyCodes = new Set()) {
  return Object.fromEntries(prices.map((row) => {
    const code = row.serviceCode;
    const keepDraft = dirtyCodes.has(code) && Object.prototype.hasOwnProperty.call(drafts, code);
    return [code, keepDraft ? drafts[code] : String(row.priceUah)];
  }));
}

export function mergeTariffsIntoDrafts(tariffs = [], drafts = {}, dirtyCodes = new Set()) {
  return Object.fromEntries(tariffs.map((row) => {
    const code = row.code || row.id;
    return [code, dirtyCodes.has(code) && drafts[code] ? drafts[code] : { ...row }];
  }));
}

export function mergeRoomRatesIntoDrafts(rooms = [], drafts = {}, dirtyRoomIds = new Set()) {
  return Object.fromEntries(rooms.map((room) => {
    const id = String(room.id);
    const keepDraft = dirtyRoomIds.has(id) && Object.prototype.hasOwnProperty.call(drafts, id);
    return [id, keepDraft ? drafts[id] : String(room.hourlyRateUah ?? "")];
  }));
}

export function isRoomRateRowSaving(saving = "", roomId = "") {
  return saving === `room:${String(roomId)}`;
}

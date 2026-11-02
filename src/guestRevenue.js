export const LEGACY_GUEST_ONE_OFF_PRICE = Object.freeze({ trial: 150, single: 300 });

const money = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

export function getGuestAttendanceRevenue(row = {}) {
  const snapshot = money(row.priceSnapshotUah ?? row.price_snapshot_uah);
  if (snapshot > 0) return { amount: snapshot, revenueSource: "attendance.price_snapshot_uah", warning: null };

  const explicitAmount = money(row.amount ?? row.price ?? row.paymentAmount ?? row.payment_amount);
  if (explicitAmount > 0) return { amount: explicitAmount, revenueSource: "attendance.amount|price|paymentAmount", warning: null };

  const type = String(row.entryType || row.guestType || row.planType || "").trim().toLowerCase();
  const fallback = money(LEGACY_GUEST_ONE_OFF_PRICE[type]);
  if (fallback > 0) return { amount: fallback, revenueSource: `fallback.legacy_guest_price.${type}`, warning: null };

  return { amount: 0, revenueSource: "missing", warning: "guest one-off has no price snapshot; salary revenue = 0" };
}

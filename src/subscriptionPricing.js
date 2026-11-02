export function resolvePlanTypePrice({ planType, initial, priceByPlan, discountPct = 0 }) {
  if (initial?.id && planType === initial.planType) {
    const basePrice = Number(initial.basePrice ?? initial.amount ?? 0);
    return { basePrice, amount: Number(initial.amount ?? basePrice), source: "initial_snapshot" };
  }

  const basePrice = Number(priceByPlan?.[planType] ?? 0);
  const discount = Math.min(100, Math.max(0, Number(discountPct || 0)));
  return {
    basePrice,
    amount: basePrice - Math.round((basePrice * discount) / 100),
    source: "current_catalog",
  };
}

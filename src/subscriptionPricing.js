export function resolvePlanTypePrice({ planType, initial, priceByPlan, discountPct = 0 }) {
  const discount = Math.min(100, Math.max(0, Number(discountPct || 0)));
  if (initial?.id && planType === initial.planType) {
    const basePrice = Number(initial.basePrice ?? initial.amount ?? 0);
    const initialDiscount = Math.min(100, Math.max(0, Number(initial.discountPct || 0)));
    const discountChanged = discount !== initialDiscount;
    const discountedAmount = basePrice - Math.round((basePrice * discount) / 100);
    return {
      basePrice,
      amount: discountChanged ? discountedAmount : Number(initial.amount ?? discountedAmount),
      source: discountChanged ? "initial_base_current_discount" : "initial_snapshot",
    };
  }

  const catalogPrice = priceByPlan?.[planType];
  if (!Number.isInteger(catalogPrice) || catalogPrice < 0) {
    return { basePrice: null, amount: null, source: "missing_catalog" };
  }
  const basePrice = catalogPrice;
  return {
    basePrice,
    amount: basePrice - Math.round((basePrice * discount) / 100),
    source: "current_catalog",
  };
}

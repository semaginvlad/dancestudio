export const MANUAL_OPERATION_CATEGORIES = {
  income: [
    { value: "room_rental", label: "Оренда залу" },
    { value: "manual_income", label: "Інший дохід" },
  ],
  expense: [{ value: "manual_expense", label: "Інша витрата" }],
};

export const postedManualExpenses = (operations = []) => (operations || []).filter((row) => (
  row?.status === "posted" && row?.direction === "expense"
));

export const manualExpenseTotalForRange = (operations = [], start, end) => postedManualExpenses(operations)
  .filter((row) => {
    const date = String(row.operationDate || row.operation_date || "").slice(0, 10);
    return date >= start && date <= end;
  })
  .reduce((sum, row) => sum + Number(row.amountUah ?? row.amount_uah ?? 0), 0);

export const withoutManualDuplicates = (automaticOperations = [], manualOperations = []) => {
  const manualIds = new Set((manualOperations || []).map((row) => String(row.id)));
  return (automaticOperations || []).filter((row) => !manualIds.has(String(row.id)));
};

export const manualCategoryLabel = (operation = {}) => MANUAL_OPERATION_CATEGORIES[operation.direction]
  ?.find((category) => category.value === operation.categoryCode)?.label || operation.categoryCode;

export const toPendingManualOperation = (operation = {}) => ({
  ...operation,
  pendingType: "manual",
  title: manualCategoryLabel(operation),
  occurrenceDate: operation.operationDate,
  details: `${operation.direction === "expense" ? "Витрата" : "Дохід"} · ${operation.operationDate}`,
  secondaryDetails: `${operation.paymentMethod === "card" ? "Карта" : "Готівка"} · початкова сума ${Number(operation.amountUah || 0).toLocaleString("uk-UA")} ₴`,
});

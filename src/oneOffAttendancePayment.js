export const ONE_OFF_PAYMENT_METHODS = Object.freeze(["cash", "card"]);

export const buildOneOffAttendancePayment = ({ entryType, attendanceDate, servicePrices = [] }) => {
  const price = servicePrices.find((row) => row.serviceCode === entryType)?.priceUah;
  return {
    amountUah: price == null ? "" : String(price),
    paymentMethod: "cash",
    operationDate: attendanceDate || "",
  };
};

export const isValidOneOffAttendancePayment = (payment = {}) => {
  const amount = Number(payment.amountUah);
  return Number.isFinite(amount)
    && amount >= 0
    && ONE_OFF_PAYMENT_METHODS.includes(payment.paymentMethod)
    && /^\d{4}-\d{2}-\d{2}$/.test(String(payment.operationDate || ""));
};

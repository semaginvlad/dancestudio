import { toLocalISO } from './shared/utils.js';

export const buildIndividualIncomeConfirmation = (row, today = toLocalISO(new Date())) => ({
  amountUah: String(Number(row?.amountUah || 0)),
  paymentMethod: 'cash',
  operationDate: today,
});

export const isValidIndividualIncomeConfirmation = (draft) => (
  Number.isFinite(Number(draft?.amountUah))
  && Number(draft.amountUah) >= 0
  && ['cash', 'card'].includes(draft?.paymentMethod)
  && /^\d{4}-\d{2}-\d{2}$/.test(String(draft?.operationDate || ''))
);

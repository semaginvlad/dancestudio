import { toLocalISO } from './shared/utils.js';

export const buildIndividualIncomeConfirmation = (row, today = toLocalISO(new Date())) => ({
  amountUah: String(Number(row?.amountUah || 0)),
  paymentMethod: ['cash', 'card'].includes(row?.paymentMethod) ? row.paymentMethod : 'cash',
  operationDate: row?.operationDate || today,
});

export const isValidIndividualIncomeConfirmation = (draft) => (
  Number.isFinite(Number(draft?.amountUah))
  && Number(draft.amountUah) >= 0
  && ['cash', 'card'].includes(draft?.paymentMethod)
  && /^\d{4}-\d{2}-\d{2}$/.test(String(draft?.operationDate || ''))
);

export const mapPendingIndividualIncome = (row = {}) => ({
  id: row.id,
  categoryCode: row.category_code,
  title: row.title || 'Індивідуальне тренування',
  trainerName: row.trainer_name || '—',
  occurrenceDate: row.occurrence_date || null,
  startTime: row.start_time || '',
  endTime: row.end_time || '',
  roomName: row.room_name || '—',
  peopleCount: Number(row.people_count || 0),
  amountUah: Number(row.amount_uah || 0),
  paymentMethod: row.payment_method_code || null,
  operationDate: row.payment_method_code ? row.operation_date : null,
});

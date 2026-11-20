import React, { useState } from 'react';
import { btnP, btnS, cardSt, inputSt, theme } from '../shared/constants';
import { buildIndividualIncomeConfirmation, isValidIndividualIncomeConfirmation } from '../individualIncome';

export const paymentLabel = row => row?.status === 'pending' ? 'Очікує оплату' : row?.status === 'posted' ? 'Оплачено' : row?.status === 'voided' ? 'Скасовано' : '';
export const paymentForEvent = (rows, event, isAdmin) => {
  if (!isAdmin || event?.kind !== 'booking' || !['room_booking', 'individual_training'].includes(event.eventType)) return null;
  const matches = rows.filter(row => String(row.bookingId) === String(event.parentId) && row.occurrenceDate === event.date);
  return matches.find(row => row.status === 'posted' || row.status === 'pending') || matches[0] || null;
};
export const PaymentBadge = ({ row }) => row ? <span style={{ display: 'inline-block', background: row.status === 'pending' ? '#fbbf24' : row.status === 'posted' ? '#16a34a' : '#6b7280', color: row.status === 'pending' ? '#422006' : '#fff', borderRadius: 6, padding: '2px 5px', fontSize: 10, fontWeight: 800 }}>{paymentLabel(row)}</span> : null;

export default function SchedulePayment({ row, event, onConfirm }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!row) return null;
  const open = () => { setDraft({ ...buildIndividualIncomeConfirmation(row), categoryCode: row.categoryCode }); setError(''); };
  const submit = async () => {
    if (!isValidIndividualIncomeConfirmation(draft) || !['room_rental', 'individual_training'].includes(draft.categoryCode) || busy) return;
    setBusy(true); setError('');
    try { await onConfirm(row, { ...draft, amountUah: Number(draft.amountUah) }); setDraft(null); }
    catch (err) { setError(err?.message || 'Не вдалося підтвердити оплату'); }
    finally { setBusy(false); }
  };
  return <div style={{ marginTop: 12 }}>
    <PaymentBadge row={row} />
    {row.status === 'posted' && <div style={{ marginTop: 6, color: theme.textMain }}>{row.amountUah.toLocaleString('uk-UA')} ₴ · {row.paymentMethod === 'card' ? 'Картка' : 'Готівка'} · {row.operationDate} · {row.categoryCode === 'room_rental' ? 'Оренда залу' : 'Індивідуальне тренування'}</div>}
    {row.status === 'pending' && event.status !== 'cancelled' && <button type="button" style={{ ...btnP, marginLeft: 8 }} onClick={open}>Підтвердити оплату</button>}
    {draft && <div role="dialog" aria-modal="true" aria-label="Підтвердження оплати" style={{ position: 'fixed', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center', padding: 16 }}><div style={{ ...cardSt, width: 'min(460px,100%)', background: theme.card, display: 'grid', gap: 12 }}>
      <h3 style={{ margin: 0 }}>Підтвердження оплати</h3>
      <label>Сума, ₴<input aria-label="Сума" type="number" min="0" step="0.01" style={inputSt} value={draft.amountUah} onChange={e => setDraft({ ...draft, amountUah: e.target.value })} /></label>
      <label>Спосіб оплати<select aria-label="Спосіб оплати" style={inputSt} value={draft.paymentMethod} onChange={e => setDraft({ ...draft, paymentMethod: e.target.value })}><option value="cash">Готівка</option><option value="card">Картка</option></select></label>
      <label>Дата оплати<input aria-label="Дата оплати" type="date" style={inputSt} value={draft.operationDate} onChange={e => setDraft({ ...draft, operationDate: e.target.value })} /></label>
      <label>Категорія<select aria-label="Категорія" style={inputSt} value={draft.categoryCode} onChange={e => setDraft({ ...draft, categoryCode: e.target.value })}><option value="room_rental">Оренда залу</option><option value="individual_training">Індивідуальне тренування</option></select></label>
      {error && <div role="alert">{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'end' }}><button type="button" style={btnS} disabled={busy} onClick={() => setDraft(null)}>Скасувати</button><button type="button" style={btnP} disabled={busy || !isValidIndividualIncomeConfirmation(draft)} onClick={submit}>Підтвердити оплату</button></div>
    </div></div>}
  </div>;
}

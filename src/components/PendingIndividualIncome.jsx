import React, { useEffect, useState } from 'react';
import { btnP, btnS, cardSt, inputSt, theme } from '../shared/constants';
import { buildIndividualIncomeConfirmation, isValidIndividualIncomeConfirmation } from '../individualIncome';

export default function PendingIndividualIncome({ rows = [], loading = false, error = '', onRefresh, onConfirm }) {
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (selected && !rows.some((row) => row.id === selected.id)) {
      setSelected(null);
      setDraft(null);
    }
  }, [rows, selected]);

  const openConfirmation = (row) => {
    setSelected(row);
    setDraft(buildIndividualIncomeConfirmation(row));
    setSubmitError('');
  };

  const isDraftValid = isValidIndividualIncomeConfirmation(draft)
    && (selected?.pendingType !== 'manual' || Number(draft?.amountUah) > 0);

  const submit = async () => {
    if (!selected || !isDraftValid) return;
    setBusy(true);
    setSubmitError('');
    try {
      await onConfirm(selected, {
        amountUah: Number(draft.amountUah),
        paymentMethod: draft.paymentMethod,
        operationDate: draft.operationDate,
      });
      setSelected(null);
      setDraft(null);
    } catch (nextError) {
      setSubmitError(nextError?.message || 'Не вдалося підтвердити оплату');
    } finally {
      setBusy(false);
    }
  };

  return <section style={{ ...cardSt, background: theme.card, marginBottom: 24, display: 'grid', gap: 14 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div><h3 style={{ margin: 0, color: theme.textMain }}>Очікують підтвердження</h3><div style={{ marginTop: 4, color: theme.textMuted, fontSize: 13 }}>Оренда залів, ручні доходи та витрати · {rows.length}</div></div>
      <button type="button" style={btnS} onClick={onRefresh} disabled={loading}>{loading ? 'Оновлення…' : 'Оновити'}</button>
    </div>
    {error && <div role="alert" style={{ color: theme.danger }}>{error}</div>}
    {!loading && !rows.length && !error && <div style={{ color: theme.textMuted }}>Немає оплат, що очікують підтвердження.</div>}
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map((row) => <article key={row.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 16, padding: 14, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: theme.textMain, fontWeight: 800 }}>{row.title}</div>
          <div style={{ color: theme.textMuted, fontSize: 13, marginTop: 5 }}>{row.details || `${row.trainerName} · ${row.occurrenceDate} · ${row.startTime}–${row.endTime}`}</div>
          <div style={{ color: theme.textMuted, fontSize: 13, marginTop: 3 }}>{row.secondaryDetails || `${row.roomName} · ${row.peopleCount} ос. · початкова сума ${row.amountUah.toLocaleString('uk-UA')} ₴`}</div>
        </div>
        <button type="button" style={btnP} onClick={() => openConfirmation(row)}>Підтвердити</button>
      </article>)}
    </div>
    {selected && draft && <div role="dialog" aria-modal="true" aria-label="Підтвердження оплати" style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ ...cardSt, width: 'min(460px,100%)', background: theme.card, display: 'grid', gap: 14 }}>
        <div><h3 style={{ margin: 0, color: theme.textMain }}>Підтвердити оплату</h3><div style={{ color: theme.textMuted, marginTop: 5 }}>{selected.title} · {selected.occurrenceDate}</div></div>
        <label style={{ color: theme.textMuted, fontSize: 13 }}>Сума, ₴<input aria-label="Сума" type="number" min="0" step="0.01" style={{ ...inputSt, marginTop: 5 }} value={draft.amountUah} onChange={(event) => setDraft({ ...draft, amountUah: event.target.value })} /></label>
        <label style={{ color: theme.textMuted, fontSize: 13 }}>Спосіб оплати<select aria-label="Спосіб оплати" style={{ ...inputSt, marginTop: 5 }} value={draft.paymentMethod} onChange={(event) => setDraft({ ...draft, paymentMethod: event.target.value })}><option value="cash">Готівка</option><option value="card">Картка</option></select></label>
        <label style={{ color: theme.textMuted, fontSize: 13 }}>Дата оплати<input aria-label="Дата оплати" type="date" style={{ ...inputSt, marginTop: 5 }} value={draft.operationDate} onChange={(event) => setDraft({ ...draft, operationDate: event.target.value })} /></label>
        {submitError && <div role="alert" style={{ color: theme.danger }}>{submitError}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}><button type="button" style={btnS} disabled={busy} onClick={() => { setSelected(null); setDraft(null); }}>Скасувати</button><button type="button" style={btnP} disabled={busy || !isDraftValid} onClick={submit}>{busy ? 'Збереження…' : 'Підтвердити'}</button></div>
      </div>
    </div>}
  </section>;
}

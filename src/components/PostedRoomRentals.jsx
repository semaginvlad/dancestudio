import FinancialOperationDetails from './FinancialOperationDetails';
import FinanceSectionHeader from './FinanceSectionHeader';
import React, { useEffect, useState } from 'react';
import { fetchPostedRoomRentals } from '../db';
import { btnS, cardSt, theme } from '../shared/constants';

export default function PostedRoomRentals({ onUnconfirm, refreshKey, fetchOperations = fetchPostedRoomRentals }) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetchOperations().then((data) => { if (active) { setRows(data); setError(''); } })
      .catch((cause) => { if (active) setError(cause?.message || 'Не вдалося завантажити оренди'); });
    return () => { active = false; };
  }, [refreshKey, fetchOperations]);
  const unconfirm = async (row) => {
    if (!window.confirm('Скасувати підтвердження оплати? Оплата повернеться до черги очікування, бронювання залишиться без змін.')) return;
    try { await onUnconfirm(row); setRows((current) => current.filter((item) => item.id !== row.id)); setSelected(null); }
    catch (cause) { setError(cause?.message || 'Не вдалося скасувати підтвердження'); }
  };
  return <section style={{ ...cardSt, marginBottom: 24 }}>
    <FinanceSectionHeader title="Підтверджені оплати подій" count={rows.length} total={rows.reduce((sum, row) => sum + Number(row.amountUah || 0), 0)} expanded={expanded} onToggle={() => setExpanded(value => !value)} controlsId="posted-finance-content" theme={theme} />
    {error && <div role="alert" style={{ color: theme.danger }}>{error}</div>}
    <div id="posted-finance-content" hidden={!expanded}>
    {rows.map((row) => <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '10px 0' }}>
      <span>{row.title || 'Оренда залу'} · {row.occurrenceDate} · {row.amountUah.toLocaleString('uk-UA')} ₴</span>
      <div><button type="button" style={btnS} onClick={() => setSelected(row)}>Деталі</button>
      <button type="button" style={btnS} onClick={() => unconfirm(row)}>Скасувати підтвердження</button></div>
    </div>)}
    </div>
    {selected && <FinancialOperationDetails row={selected} onClose={() => setSelected(null)}><button type="button" style={btnS} onClick={() => unconfirm(selected)}>Скасувати підтвердження</button></FinancialOperationDetails>}
  </section>;
}

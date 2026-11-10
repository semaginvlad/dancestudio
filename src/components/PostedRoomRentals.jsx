import React, { useEffect, useState } from 'react';
import { fetchPostedRoomRentals } from '../db';
import { btnS, cardSt, theme } from '../shared/constants';

export default function PostedRoomRentals({ onUnconfirm, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetchPostedRoomRentals().then((data) => { if (active) { setRows(data); setError(''); } })
      .catch((cause) => { if (active) setError(cause?.message || 'Не вдалося завантажити оренди'); });
    return () => { active = false; };
  }, [refreshKey]);
  if (!rows.length && !error) return null;
  return <section style={{ ...cardSt, marginBottom: 24 }}>
    <h3>Підтверджені оплати оренди</h3>
    {error && <div role="alert" style={{ color: theme.danger }}>{error}</div>}
    {rows.map((row) => <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '10px 0' }}>
      <span>{row.title || 'Оренда залу'} · {row.occurrenceDate} · {row.amountUah.toLocaleString('uk-UA')} ₴</span>
      <button type="button" style={btnS} onClick={async () => {
        if (!window.confirm('Скасувати підтвердження оплати? Оплата повернеться до черги очікування, бронювання залишиться без змін.')) return;
        try { await onUnconfirm(row); setRows((current) => current.filter((item) => item.id !== row.id)); }
        catch (cause) { setError(cause?.message || 'Не вдалося скасувати підтвердження'); }
      }}>Скасувати підтвердження</button>
    </div>)}
  </section>;
}

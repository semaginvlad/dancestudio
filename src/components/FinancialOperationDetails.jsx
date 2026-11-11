import React from 'react';
import { MANUAL_OPERATION_CATEGORIES } from '../manualFinancialOperations';
import { btnS, cardSt, theme } from '../shared/constants';

export default function FinancialOperationDetails({ row, manual = false, onClose, children }) {
  const category = MANUAL_OPERATION_CATEGORIES[row.direction || 'income']?.find((item) => item.value === row.categoryCode)?.label || row.categoryCode || '—';
  const fields = [
    ['Напрям', (row.direction || 'income') === 'expense' ? 'Витрата' : 'Дохід'],
    ['Категорія', category],
    ['Сума', `${Number(row.amountUah || 0).toLocaleString('uk-UA')} ₴`],
    ['Спосіб оплати', row.paymentMethod === 'cash' ? 'Готівка' : row.paymentMethod === 'card' ? 'Карта' : '—'],
    ['Статус', row.status === 'voided' ? 'Скасовано' : row.status === 'posted' ? 'Оплачено' : 'Очікує оплату'],
    ['Дата', row.operationDate || '—'],
    ['Опис / коментар', row.note || '—'],
  ];
  if (!manual && row.categoryCode === 'room_rental') {
    fields.push(['Подія', row.title || '—'], ['Зал', row.roomName || '—'], ['Дата події', row.occurrenceDate || '—'], ['Час', [row.startTime, row.endTime].filter(Boolean).join('–') || '—'], ['Тренер', row.trainerName || '—'], ['Кількість людей', row.peopleCount ?? '—']);
  }
  return <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center', padding: 16 }}>
    <div role="dialog" aria-modal="true" aria-label="Деталі операції" style={{ ...cardSt, width: 'min(480px,100%)', maxHeight: 'calc(100dvh - 32px)', overflow: 'auto', background: theme.card }}>
      <h3 style={{ marginTop: 0 }}>Деталі операції</h3>
      {manual && <p>Ручна операція</p>}
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 1fr) 2fr', gap: '8px 12px', overflowWrap: 'anywhere' }}>{fields.map(([label, value]) => <React.Fragment key={label}><dt style={{ color: theme.textMuted }}>{label}</dt><dd style={{ margin: 0 }}>{value}</dd></React.Fragment>)}</dl>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{children}<button type="button" style={btnS} onClick={onClose}>Закрити</button></div>
    </div>
  </div>;
}

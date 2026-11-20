import React from 'react';

export default function FinanceSectionHeader({ title, count, total, expanded, onToggle, controlsId, theme }) {
  return <h3 style={{ margin: 0, flex: '1 1 220px', minWidth: 0 }}>
    <button type="button" aria-expanded={expanded} aria-controls={controlsId} onClick={onToggle}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 0, border: 0, background: 'transparent', color: theme.textMain, textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
      <span aria-hidden="true" style={{ fontSize: 14 }}>{expanded ? '▼' : '▶'}</span>
      <span style={{ display: 'grid', gap: 4 }}><span>{title}</span><span style={{ color: theme.textMuted, fontSize: 13, fontWeight: 500 }}>Записів: {count}{total != null ? ` · ${total.toLocaleString('uk-UA')} ₴` : ''}</span></span>
    </button>
  </h3>;
}

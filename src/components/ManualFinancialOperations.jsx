import React, { useMemo, useState } from "react";
import { MANUAL_OPERATION_CATEGORIES } from "../manualFinancialOperations";

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export default function ManualFinancialOperations({ operations = [], onCreate, theme, inputStyle, primaryButtonStyle, secondaryButtonStyle }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ direction: "income", categoryCode: "room_rental", amountUah: "", operationDate: today(), paymentMethod: "cash", status: "posted", note: "" });
  const categories = MANUAL_OPERATION_CATEGORIES[form.direction];
  const rows = useMemo(() => [...operations].sort((a, b) => String(b.operationDate).localeCompare(String(a.operationDate))), [operations]);
  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
  const close = () => { if (!saving) { setOpen(false); setError(""); } };
  const submit = async (event) => {
    event.preventDefault(); setError("");
    const amount = Number(form.amountUah);
    if (!Number.isFinite(amount) || amount <= 0) { setError("Сума має бути більшою за нуль"); return; }
    setSaving(true);
    try {
      await onCreate({ ...form, amountUah: amount });
      setForm((current) => ({ ...current, amountUah: "", note: "", operationDate: today() }));
      setOpen(false);
    } catch (cause) { setError(cause?.message || "Не вдалося додати операцію"); }
    finally { setSaving(false); }
  };
  const fieldStyle = { ...inputStyle, minWidth: 0, background: theme.input, color: theme.textMain, border: `1px solid ${theme.border}` };

  return <section data-manual-financial-journal>
    <style>{`
      .manual-operation-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; }
      .manual-operation-header h2 { margin:0; color:${theme.secondary}; font-size:24px; line-height:1.2; }
      .manual-operation-dialog { position:fixed; inset:0; z-index:1100; display:grid; place-items:center; padding:18px; background:rgba(15,18,28,.58); }
      .manual-operation-panel { width:min(720px,100%); max-height:calc(100dvh - 36px); overflow:auto; padding:22px; border:1px solid ${theme.border}; border-radius:22px; background:${theme.card}; box-shadow:0 28px 70px rgba(0,0,0,.28); }
      .manual-operation-panel-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:18px; }
      .manual-operation-panel-head h3 { margin:0; color:${theme.textMain}; font-size:20px; }
      .manual-operation-panel-head p { margin:5px 0 0; color:${theme.textMuted}; font-size:13px; }
      .manual-operation-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      .manual-operation-field { display:grid; gap:6px; min-width:0; color:${theme.textMuted}; font-size:12px; font-weight:700; }
      .manual-operation-note, .manual-operation-error, .manual-operation-actions { grid-column:1 / -1; }
      .manual-operation-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:4px; }
      .manual-operation-table { overflow-x:auto; margin:0 0 18px; border:1px solid ${theme.border}; border-radius:18px; background:${theme.card}; }
      .manual-operation-table table { width:100%; border-collapse:collapse; font-size:13px; }
      .manual-operation-table th, .manual-operation-table td { padding:12px 14px; border-bottom:1px solid ${theme.border}; text-align:left; white-space:nowrap; color:${theme.textMuted}; }
      .manual-operation-table th { color:${theme.textMain}; }
      .manual-operation-table tr:last-child td { border-bottom:0; }
      @media (max-width:640px) {
        .manual-operation-header h2 { font-size:22px; }
        .manual-operation-dialog { place-items:end center; padding:8px; }
        .manual-operation-panel { padding:16px; border-radius:22px 22px 16px 16px; max-height:calc(100dvh - 16px); }
        .manual-operation-form { grid-template-columns:1fr; }
        .manual-operation-note, .manual-operation-error, .manual-operation-actions { grid-column:auto; }
        .manual-operation-actions { grid-template-columns:1fr 1fr; display:grid; }
      }
    `}</style>
    <div className="manual-operation-header">
      <h2>Ручний журнал</h2>
      <button type="button" data-open-manual-operation style={primaryButtonStyle} onClick={() => setOpen(true)}>+ Додати операцію</button>
    </div>

    {open && <div className="manual-operation-dialog" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="manual-operation-panel" role="dialog" aria-modal="true" aria-labelledby="manual-operation-title">
        <div className="manual-operation-panel-head"><div><h3 id="manual-operation-title">Нова операція</h3><p>Ручний дохід або витрата</p></div></div>
        <form className="manual-operation-form" data-manual-operation-form onSubmit={submit}>
          <label className="manual-operation-field">Тип операції<select style={fieldStyle} aria-label="Напрям" value={form.direction} onChange={(e) => { const direction = e.target.value; update({ direction, categoryCode: MANUAL_OPERATION_CATEGORIES[direction][0].value }); }}><option value="income">Дохід</option><option value="expense">Витрата</option></select></label>
          <label className="manual-operation-field">Категорія<select style={fieldStyle} aria-label="Категорія" value={form.categoryCode} onChange={(e) => update({ categoryCode: e.target.value })}>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="manual-operation-field">Сума, грн<input style={fieldStyle} aria-label="Сума в грн" type="number" min="0.01" step="0.01" required placeholder="0,00" value={form.amountUah} onChange={(e) => update({ amountUah: e.target.value })} /></label>
          <label className="manual-operation-field">Дата операції<input style={fieldStyle} aria-label="Дата операції" type="date" required value={form.operationDate} onChange={(e) => update({ operationDate: e.target.value })} /></label>
          <label className="manual-operation-field">Спосіб оплати<select style={fieldStyle} aria-label="Спосіб оплати" value={form.paymentMethod} onChange={(e) => update({ paymentMethod: e.target.value })}><option value="cash">Готівка</option><option value="card">Карта</option></select></label>
          <label className="manual-operation-field">Статус<select style={fieldStyle} aria-label="Статус" value={form.status} onChange={(e) => update({ status: e.target.value })}><option value="pending">Очікує оплату</option><option value="posted">Оплачено</option></select></label>
          <label className="manual-operation-field manual-operation-note">Коментар<input style={fieldStyle} aria-label="Коментар" placeholder="Опис (необов’язково)" value={form.note} onChange={(e) => update({ note: e.target.value })} /></label>
          {error && <div className="manual-operation-error" role="alert" style={{ color: theme.danger }}>{error}</div>}
          <div className="manual-operation-actions"><button type="button" style={secondaryButtonStyle} onClick={close} disabled={saving}>Скасувати</button><button type="submit" style={primaryButtonStyle} disabled={saving}>{saving ? "Збереження…" : "Зберегти операцію"}</button></div>
        </form>
      </div>
    </div>}

    {rows.length > 0 && <div className="manual-operation-table"><table><thead><tr><th>Дата</th><th>Тип</th><th>Категорія</th><th>Спосіб</th><th>Статус</th><th style={{ textAlign: "right" }}>Сума</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.operationDate}</td><td>{row.direction === "income" ? "Дохід" : "Витрата"}</td><td>{MANUAL_OPERATION_CATEGORIES[row.direction]?.find((item) => item.value === row.categoryCode)?.label || row.categoryCode}</td><td>{row.paymentMethod === "cash" ? "Готівка" : "Карта"}</td><td>{row.status === "posted" ? "Оплачено" : "Очікує оплату"}</td><td style={{ textAlign: "right", color: row.direction === "expense" ? theme.danger : theme.success, fontWeight: 700 }}>{Number(row.amountUah).toLocaleString()} ₴</td></tr>)}</tbody></table></div>}
  </section>;
}

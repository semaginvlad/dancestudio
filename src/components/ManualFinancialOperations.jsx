import React, { useMemo, useState } from "react";
import { MANUAL_OPERATION_CATEGORIES } from "../manualFinancialOperations";

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export default function ManualFinancialOperations({ operations = [], onCreate }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ direction: "income", categoryCode: "room_rental", amountUah: "", operationDate: today(), paymentMethod: "cash", status: "posted", note: "" });
  const categories = MANUAL_OPERATION_CATEGORIES[form.direction];
  const rows = useMemo(() => [...operations].sort((a, b) => String(b.operationDate).localeCompare(String(a.operationDate))), [operations]);
  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
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

  return <section data-manual-financial-journal style={{ marginBottom: 18, padding: 16, border: "1px solid #E5E7EB", borderRadius: 18 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div><strong>Ручний журнал</strong><div style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }}>Доходи й витрати, додані адміністратором</div></div>
      <button type="button" onClick={() => setOpen((value) => !value)}>+ Додати операцію</button>
    </div>
    {open && <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 14 }}>
      <select aria-label="Напрям" value={form.direction} onChange={(e) => { const direction = e.target.value; update({ direction, categoryCode: MANUAL_OPERATION_CATEGORIES[direction][0].value }); }}><option value="income">Дохід</option><option value="expense">Витрата</option></select>
      <select aria-label="Категорія" value={form.categoryCode} onChange={(e) => update({ categoryCode: e.target.value })}>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      <input aria-label="Сума в грн" type="number" min="0.01" step="0.01" required placeholder="Сума, грн" value={form.amountUah} onChange={(e) => update({ amountUah: e.target.value })} />
      <input aria-label="Дата операції" type="date" required value={form.operationDate} onChange={(e) => update({ operationDate: e.target.value })} />
      <select aria-label="Спосіб оплати" value={form.paymentMethod} onChange={(e) => update({ paymentMethod: e.target.value })}><option value="cash">Готівка</option><option value="card">Карта</option></select>
      <select aria-label="Статус" value={form.status} onChange={(e) => update({ status: e.target.value })}><option value="pending">Очікує оплату</option><option value="posted">Оплачено</option></select>
      <input aria-label="Коментар" placeholder="Коментар / опис (необов’язково)" value={form.note} onChange={(e) => update({ note: e.target.value })} style={{ gridColumn: "1 / -1" }} />
      {error && <div role="alert" style={{ color: "#DC2626", gridColumn: "1 / -1" }}>{error}</div>}
      <button type="submit" disabled={saving} style={{ gridColumn: "1 / -1" }}>{saving ? "Збереження…" : "Зберегти операцію"}</button>
    </form>}
    {rows.length > 0 && <div style={{ overflowX: "auto", marginTop: 14 }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr><th>Дата</th><th>Тип</th><th>Категорія</th><th>Спосіб</th><th>Статус</th><th style={{ textAlign: "right" }}>Сума</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.operationDate}</td><td>{row.direction === "income" ? "Дохід" : "Витрата"}</td><td>{MANUAL_OPERATION_CATEGORIES[row.direction]?.find((item) => item.value === row.categoryCode)?.label || row.categoryCode}</td><td>{row.paymentMethod === "cash" ? "Готівка" : "Карта"}</td><td>{row.status === "posted" ? "Оплачено" : "Очікує оплату"}</td><td style={{ textAlign: "right", color: row.direction === "expense" ? "#DC2626" : "#16A34A", fontWeight: 700 }}>{Number(row.amountUah).toLocaleString()} ₴</td></tr>)}</tbody></table></div>}
  </section>;
}

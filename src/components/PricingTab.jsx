import React, { useEffect, useState } from "react";
import { btnP, inputSt, theme } from "../shared/constants";

export default function PricingTab({ prices, onSave }) {
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDrafts(Object.fromEntries((prices || []).map((row) => [row.serviceCode, String(row.priceUah)])));
  }, [prices]);

  const save = async (row) => {
    const value = Number(drafts[row.serviceCode]);
    if (!Number.isInteger(value) || value < 0) {
      setMessage("Ціна має бути цілим невід’ємним числом.");
      return;
    }
    setSaving(row.serviceCode);
    setMessage("");
    try {
      await onSave(row.serviceCode, value);
      setMessage(`«${row.serviceName}» збережено.`);
    } catch (error) {
      setMessage(error?.message || "Не вдалося зберегти ціну.");
    } finally {
      setSaving("");
    }
  };

  return (
    <section style={{ maxWidth: 720 }}>
      <h2 style={{ margin: "0 0 6px", color: theme.textMain }}>Ціни</h2>
      <p style={{ margin: "0 0 18px", color: theme.textMuted }}>Актуальний прайс для нових оплат та абонементів.</p>
      <div style={{ display: "grid", gap: 10 }}>
        {(prices || []).map((row) => (
          <div key={row.serviceCode} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) minmax(120px, 180px) auto", gap: 12, alignItems: "center", padding: 14, borderRadius: 16, border: `1px solid ${theme.border}`, background: theme.card }}>
            <label htmlFor={`price-${row.serviceCode}`} style={{ color: theme.textMain, fontWeight: 700 }}>{row.serviceName}</label>
            <div style={{ position: "relative" }}>
              <input id={`price-${row.serviceCode}`} type="number" min="0" step="1" value={drafts[row.serviceCode] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [row.serviceCode]: event.target.value }))} style={{ ...inputSt, paddingRight: 44, width: "100%", boxSizing: "border-box" }} />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: theme.textMuted }}>грн</span>
            </div>
            <button type="button" style={btnP} disabled={saving === row.serviceCode} onClick={() => save(row)}>{saving === row.serviceCode ? "Збереження…" : "Зберегти"}</button>
          </div>
        ))}
      </div>
      {message && <div role="status" style={{ marginTop: 14, color: theme.textMuted }}>{message}</div>}
    </section>
  );
}

import React, { useMemo, useState } from "react";
import { buildAIInsights } from "../shared/aiInsights";
import { btnP, cardSt, theme } from "../shared/constants";

const priorityMeta = {
  high: { label: "Високий", color: theme.danger },
  medium: { label: "Середній", color: theme.warning },
  low: { label: "Низький", color: theme.success },
};

export default function AIInsightsPanel({ isAdmin = false, context = {} }) {
  const [generated, setGenerated] = useState(false);
  const fallbackInsights = useMemo(() => buildAIInsights(context), [context]);

  if (!isAdmin) return null;

  const generateInsights = () => {
    setGenerated(true);
  };

  return (
    <section style={{ ...cardSt, border: `1px dashed ${theme.border}`, display: "grid", gap: 12, background: theme.input }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>Fallback helper · Admin only</div>
          <h3 style={{ margin: "4px 0", color: theme.textMain }}>Швидкі fallback-підказки</h3>
          <div style={{ color: theme.textMuted, fontSize: 13 }}>Локальні rule-based підказки на основі CRM-агрегатів. Це не real AI і не замінює Global AI Assistant вище.</div>
        </div>
        <button type="button" style={{ ...btnP, whiteSpace: "nowrap" }} onClick={generateInsights}>
          Згенерувати fallback-підказки
        </button>
      </div>

      <div style={{ padding: 12, borderRadius: 14, background: theme.input, color: theme.textMuted, fontSize: 13 }}>
        Режим: <b style={{ color: generated ? theme.warning : theme.textMain }}>{generated ? "Rule-based fallback" : "Очікує ручного запуску"}</b>
        <span> · Локальна перевірка без AI API, fetch або зовнішніх запитів.</span>
      </div>

      {!generated ? (
        <div style={{ padding: 16, borderRadius: 16, background: theme.input, color: theme.textMuted, fontSize: 13 }}>
          Натисни кнопку, щоб вручну сформувати безпечні read-only fallback-підказки. Панель не рендериться для тренерів.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {fallbackInsights.map((item) => {
            const meta = priorityMeta[item.priority] || priorityMeta.medium;
            return (
              <article key={item.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 18, padding: 16, background: theme.bg }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800, color: theme.textMain }}>{item.title}</div>
                    <div style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>{item.summary}</div>
                  </div>
                  <span style={{ border: `1px solid ${meta.color}55`, color: meta.color, borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>{meta.label}</span>
                </div>
                {item.evidence?.length > 0 && (
                  <ul style={{ margin: "10px 0 0 18px", padding: 0, color: theme.textMuted, fontSize: 13 }}>
                    {item.evidence.map((row) => <li key={row}>{row}</li>)}
                  </ul>
                )}
                <div style={{ marginTop: 10, color: theme.textMain, fontSize: 13 }}><b>Рекомендація:</b> {item.recommendation}</div>
                <div style={{ marginTop: 8, color: theme.textLight, fontSize: 11 }}>Source: {item.source}</div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

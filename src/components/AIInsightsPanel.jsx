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
    <section style={{ ...cardSt, border: `1px dashed ${theme.border}`, background: theme.bg, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>AI Core v1 · Admin only</div>
          <h3 style={{ margin: "4px 0", color: theme.textMain }}>Швидкі fallback-підказки</h3>
          <div style={{ color: theme.textMuted, fontSize: 13, maxWidth: 680 }}>
            Це локальні rule-based підказки з CRM-агрегатів, а не реальний AI-висновок. Real AI API тимчасово не підключено, щоб не збільшувати кількість Vercel Serverless Functions.
          </div>
        </div>
        <button type="button" style={{ ...btnP, background: theme.textMuted, whiteSpace: "nowrap" }} onClick={generateInsights}>
          Згенерувати fallback-підказки
        </button>
      </div>

      <div style={{ padding: 12, borderRadius: 14, background: theme.input, color: theme.textMuted, fontSize: 13 }}>
        Режим: <b style={{ color: generated ? theme.warning : theme.textMain }}>{generated ? "Fallback analytics" : "AI API ще не підключено"}</b>
        <span> · No external AI calls: підказки формуються локальними правилами і мають допоміжний статус.</span>
      </div>

      {!generated ? (
        <div style={{ padding: 16, borderRadius: 16, background: theme.input, color: theme.textMuted, fontSize: 13 }}>
          Натисни кнопку, щоб вручну сформувати безпечні read-only fallback-підказки. Панель не рендериться для тренерів і залишається візуально другорядною до основного dashboard.
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

import React, { useMemo, useState } from "react";
import { buildAIInsights, createAIInsightsPayload } from "../shared/aiInsights";
import { btnP, cardSt, theme } from "../shared/constants";
import { supabase } from "../supabase";

const priorityMeta = {
  high: { label: "Високий", color: theme.danger },
  medium: { label: "Середній", color: theme.warning },
  low: { label: "Низький", color: theme.success },
};

const normalizeInsights = (rows = []) => (Array.isArray(rows) ? rows : [])
  .map((item, idx) => ({
    id: String(item?.id || `insight-${idx + 1}`),
    priority: ["high", "medium", "low"].includes(item?.priority) ? item.priority : "medium",
    title: String(item?.title || "AI-підказка"),
    summary: String(item?.summary || ""),
    evidence: Array.isArray(item?.evidence) ? item.evidence.map(String).slice(0, 4) : [],
    recommendation: String(item?.recommendation || "Перевірити вручну."),
    source: String(item?.source || "fallback"),
  }))
  .filter((item) => item.title && (item.summary || item.evidence.length || item.recommendation))
  .slice(0, 5);

export default function AIInsightsPanel({ isAdmin = false, context = {} }) {
  const [generated, setGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("idle");
  const [status, setStatus] = useState("");
  const [remoteInsights, setRemoteInsights] = useState([]);

  const fallbackInsights = useMemo(() => buildAIInsights(context), [context]);
  const visibleInsights = mode === "ai" ? remoteInsights : (generated ? fallbackInsights : []);

  if (!isAdmin) return null;

  const useFallback = (message = "AI API недоступний — показано fallback analytics.") => {
    setMode("fallback");
    setStatus(message);
    setRemoteInsights([]);
    setGenerated(true);
  };

  const generateInsights = async () => {
    setLoading(true);
    setStatus("Пробуємо AI API…");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        useFallback("Немає активної auth-сесії — показано fallback analytics.");
        return;
      }

      const res = await fetch("/api/ai-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ payload: createAIInsightsPayload(context) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        useFallback(json?.message || json?.error || "AI endpoint недоступний — показано fallback analytics.");
        return;
      }

      const insights = normalizeInsights(json?.insights);
      if (json?.mode === "ai" && insights.length > 0) {
        setRemoteInsights(insights);
        setMode("ai");
        setStatus(`AI API · ${json.provider || "provider"}`);
        setGenerated(true);
        return;
      }

      useFallback(json?.details || "AI API не налаштований — показано fallback analytics.");
    } catch (error) {
      useFallback(error?.message || "Помилка AI API — показано fallback analytics.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ ...cardSt, border: `1px solid ${theme.border}`, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>AI Core v1 · Admin only</div>
          <h3 style={{ margin: "4px 0", color: theme.textMain }}>AI Insights</h3>
          <div style={{ color: theme.textMuted, fontSize: 13 }}>AI-ready підказки на основі мінімізованих CRM-агрегатів. Fallback працює без LLM, без запису в базу й без автоматичних повідомлень.</div>
        </div>
        <button type="button" style={{ ...btnP, whiteSpace: "nowrap", opacity: loading ? 0.75 : 1 }} onClick={generateInsights} disabled={loading}>
          {loading ? "Генеруємо…" : "Згенерувати AI-підказки"}
        </button>
      </div>

      <div style={{ padding: 12, borderRadius: 14, background: theme.input, color: theme.textMuted, fontSize: 13 }}>
        Режим: <b style={{ color: mode === "ai" ? theme.success : mode === "fallback" ? theme.warning : theme.textMain }}>{mode === "ai" ? "AI API" : mode === "fallback" ? "Fallback analytics" : "Очікує ручного запуску"}</b>
        {status ? <span> · {status}</span> : null}
      </div>

      {!generated ? (
        <div style={{ padding: 16, borderRadius: 16, background: theme.input, color: theme.textMuted, fontSize: 13 }}>
          Натисни кнопку, щоб вручну спробувати AI API. Якщо провайдер або ключ не налаштовані, Dashboard безпечно покаже fallback analytics.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {visibleInsights.map((item) => {
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

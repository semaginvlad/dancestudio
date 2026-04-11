import { useState, useMemo, useRef, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, CartesianGrid, Cell
} from "recharts";

const n = (v) => parseInt(v, 10) || 0;
const fmt = (num) => num >= 1000 ? (num / 1000).toFixed(1) + "к" : String(num || 0);

// ── STEP INDICATOR ────────────────────────────────────────────────────────────

function StepBar({ step }) {
  const steps = ["📊 Метрики", "🎬 Інтерв'ю", "🧠 Аналіз"];
  return (
    <div style={{ display: "flex", gap: 0, marginBottom: 32 }}>
      {steps.map((s, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
            {i > 0 && <div style={{ position: "absolute", left: 0, top: 16, width: "50%", height: 2, background: done ? "#e040fb" : "#1f2937" }} />}
            {i < 2 && <div style={{ position: "absolute", right: 0, top: 16, width: "50%", height: 2, background: active || done ? "#e040fb" : "#1f2937" }} />}
            <div style={{
              width: 32, height: 32, borderRadius: "50%", zIndex: 1,
              background: done ? "#e040fb" : active ? "#7c3aed" : "#1f2937",
              border: `2px solid ${active ? "#e040fb" : done ? "#e040fb" : "#333"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, color: "#fff", fontWeight: 700,
            }}>{done ? "✓" : i + 1}</div>
            <div style={{ fontSize: 11, color: active ? "#e040fb" : "#666", marginTop: 6, whiteSpace: "nowrap" }}>{s}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── METRIC CARD ───────────────────────────────────────────────────────────────

function MCard({ label, value, sub, color = "#e040fb", delta }) {
  return (
    <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, margin: "6px 0 2px", fontFamily: "monospace" }}>{fmt(value)}</div>
      {sub && <div style={{ fontSize: 11, color: "#555" }}>{sub}</div>}
      {delta !== undefined && (
        <div style={{ fontSize: 12, color: delta >= 0 ? "#4ade80" : "#f87171", marginTop: 4 }}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
        </div>
      )}
    </div>
  );
}

// ── STEP 1: METRICS ───────────────────────────────────────────────────────────

function MetricsStep({ data, onNext }) {
  const analysis = useMemo(() => {
    const posts = data.posts || [];

    // By type
    const byType = {};
    posts.forEach(p => {
      const t = p["Тип допису"] || "Інше";
      if (!byType[t]) byType[t] = { views: [], saves: [], likes: [], reach: [], comments: [], shares: [], count: 0 };
      byType[t].views.push(n(p["Перегляди"]));
      byType[t].saves.push(n(p["Збереження"]));
      byType[t].likes.push(n(p["Вподобання"]));
      byType[t].reach.push(n(p["Охоплення"]));
      byType[t].comments.push(n(p["Коментарі"]));
      byType[t].shares.push(n(p["Поширення"]));
      byType[t].count++;
    });

    const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    const typeStats = Object.entries(byType).map(([type, d]) => ({
      type: type.replace("Instagram Reels", "Reels").replace("Зображення", "Фото").replace("Альбом", "Карусель"),
      count: d.count,
      avgViews: avg(d.views),
      avgSaves: avg(d.saves),
      avgLikes: avg(d.likes),
      avgReach: avg(d.reach),
      avgComments: avg(d.comments),
      avgShares: avg(d.shares),
      er: avg(d.reach) > 0 ? +((avg(d.likes) + avg(d.saves) + avg(d.comments)) / avg(d.reach) * 100).toFixed(1) : 0,
    })).sort((a, b) => b.avgViews - a.avgViews);

    // Top vs bottom
    const sorted = [...posts].sort((a, b) => n(b["Перегляди"]) - n(a["Перегляди"]));
    const top10 = sorted.slice(0, 10);
    const bot10 = sorted.slice(-10);

    const topAvgViews = avg(top10.map(p => n(p["Перегляди"])));
    const botAvgViews = avg(bot10.map(p => n(p["Перегляди"])));
    const topAvgSaves = avg(top10.map(p => n(p["Збереження"])));
    const botAvgSaves = avg(bot10.map(p => n(p["Збереження"])));
    const topAvgER = avg(top10.map(p => {
      const r = n(p["Охоплення"]); const e = n(p["Вподобання"]) + n(p["Збереження"]) + n(p["Коментарі"]);
      return r > 0 ? Math.round(e / r * 100) : 0;
    }));

    // By day of week
    const byDay = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    posts.forEach(p => {
      const d = p["Час публікації"] || p["Дата"] || "";
      if (d) {
        const day = new Date(d).getDay();
        if (!isNaN(day)) byDay[day].push(n(p["Перегляди"]));
      }
    });
    const dayNames = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    const byDayStats = Object.entries(byDay)
      .filter(([, arr]) => arr.length > 0)
      .map(([day, arr]) => ({ day: dayNames[+day], avg: avg(arr), count: arr.length }));

    // Saves vs views scatter
    const scatter = top10.slice(0, 20).map(p => ({
      views: n(p["Перегляди"]),
      saves: n(p["Збереження"]),
      name: (p["Опис"] || "").slice(0, 30),
    }));

    // Top 5 by saves (most valuable)
    const bySaves = [...posts].sort((a, b) => n(b["Збереження"]) - n(a["Збереження"])).slice(0, 5);
    const byShares = [...posts].sort((a, b) => n(b["Поширення"]) - n(a["Поширення"])).slice(0, 5);

    return { typeStats, top10, bot10, topAvgViews, botAvgViews, topAvgSaves, botAvgSaves, topAvgER, byDayStats, scatter, bySaves, byShares };
  }, [data]);

  const s = { color: "#e1e1e1", fontSize: 14, lineHeight: 1.6 };
  const label = { fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* Type comparison */}
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 16, padding: "20px 22px" }}>
        <div style={label}>Порівняння форматів — середні перегляди</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={analysis.typeStats} margin={{ left: -10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
            <XAxis dataKey="type" tick={{ fontSize: 11, fill: "#666" }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#666" }} tickLine={false} axisLine={false} tickFormatter={fmt} />
            <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
              formatter={(v, name) => [fmt(v), name]} />
            <Bar dataKey="avgViews" name="Перегляди" radius={[6, 6, 0, 0]}>
              {analysis.typeStats.map((_, i) => (
                <Cell key={i} fill={["#e040fb", "#7c3aed", "#4ade80", "#fb923c"][i % 4]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginTop: 16 }}>
          {analysis.typeStats.map(t => (
            <div key={t.type} style={{ background: "#0d1117", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, color: "#aaa", fontWeight: 600 }}>{t.type}</div>
              <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{t.count} публ.</div>
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "#e040fb" }}>👁 {fmt(t.avgViews)}</span>
                <span style={{ fontSize: 11, color: "#4ade80" }}>🔖 {fmt(t.avgSaves)}</span>
                <span style={{ fontSize: 11, color: "#fb923c" }}>ER {t.er}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top vs Bottom */}
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 16, padding: "20px 22px" }}>
        <div style={label}>Топ-10 vs Аутсайдери-10 — де різниця?</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[
            { label: "Перегляди (топ)", top: analysis.topAvgViews, bot: analysis.botAvgViews },
            { label: "Збережень (топ)", top: analysis.topAvgSaves, bot: analysis.botAvgSaves },
            { label: "ER% (топ)", top: analysis.topAvgER, bot: 0 },
          ].map(({ label: l, top, bot }) => (
            <div key={l} style={{ background: "#0d1117", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "#555" }}>{l}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#e040fb", fontFamily: "monospace" }}>{fmt(top)}</div>
              {bot > 0 && <div style={{ fontSize: 11, color: "#f87171", marginTop: 2 }}>аутсайдери: {fmt(bot)}</div>}
              {bot > 0 && top > 0 && <div style={{ fontSize: 11, color: "#4ade80", marginTop: 2 }}>різниця: {top > bot ? "+" : ""}{Math.round((top - bot) / Math.max(bot, 1) * 100)}%</div>}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>Топ-10 постів (за переглядами):</div>
          {analysis.top10.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #0d1117" }}>
              <span style={{ fontSize: 11, color: "#444", minWidth: 20 }}>{i + 1}.</span>
              <span style={{ fontSize: 11, color: "#888", flex: 1 }}>{(p["Опис"] || p["Тип допису"] || "—").slice(0, 60)}</span>
              <span style={{ fontSize: 11, color: "#e040fb", fontFamily: "monospace", whiteSpace: "nowrap" }}>👁 {fmt(n(p["Перегляди"]))}</span>
              <span style={{ fontSize: 11, color: "#4ade80", fontFamily: "monospace", whiteSpace: "nowrap" }}>🔖 {fmt(n(p["Збереження"]))}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Best days */}
      {analysis.byDayStats.length > 0 && (
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 16, padding: "20px 22px" }}>
          <div style={label}>Середні перегляди по днях тижня</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={analysis.byDayStats} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#666" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#666" }} tickLine={false} axisLine={false} tickFormatter={fmt} />
              <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="avg" name="Перегляди" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Most saved */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 16, padding: "18px 20px" }}>
          <div style={label}>Топ-5 по збереженнях 🔖</div>
          {analysis.bySaves.map((p, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid #0d1117", display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#888", flex: 1 }}>{(p["Опис"] || "—").slice(0, 50)}</span>
              <span style={{ fontSize: 12, color: "#4ade80", fontFamily: "monospace", whiteSpace: "nowrap" }}>{fmt(n(p["Збереження"]))}</span>
            </div>
          ))}
        </div>
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 16, padding: "18px 20px" }}>
          <div style={label}>Топ-5 по поширеннях 🔁</div>
          {analysis.byShares.map((p, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid #0d1117", display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 11, color: "#888", flex: 1 }}>{(p["Опис"] || "—").slice(0, 50)}</span>
              <span style={{ fontSize: 12, color: "#fb923c", fontFamily: "monospace", whiteSpace: "nowrap" }}>{fmt(n(p["Поширення"]))}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={onNext} style={{
        background: "linear-gradient(135deg, #7c3aed, #e040fb)",
        color: "#fff", border: "none", borderRadius: 14, padding: "16px 32px",
        fontSize: 15, fontWeight: 700, cursor: "pointer", alignSelf: "flex-end",
      }}>
        Далі — розкажи про контент →
      </button>
    </div>
  );
}

// ── STEP 2: INTERVIEW ─────────────────────────────────────────────────────────

const QUESTIONS = [
  {
    id: "topics",
    q: "Які теми ти найчастіше знімаєш?",
    hint: "Наприклад: навчальні відео, результати учнів, закулісся, анонси, мотивація, челенджі, дует з підписниками...",
    type: "text",
  },
  {
    id: "hook",
    q: "Який типовий хук у твоїх Reels / постах?",
    hint: "Перші 1-2 секунди або перший рядок підпису. Наприклад: питання до аудиторії, шокуючий рух, до/після, провокаційна фраза...",
    type: "text",
  },
  {
    id: "cta",
    q: "Яка типова CTA (заклик до дії)?",
    hint: "Збережи, підпишись, напиши в Direct, відповідай в коментарях, поширити...",
    type: "options",
    options: ["Збережи", "Підпишись", "Напиши в Direct", "Коментуй", "Поширити", "Немає CTA", "Інше"],
  },
  {
    id: "editing",
    q: "Який монтаж і стиль відео?",
    hint: "Швидкі кати, повільний плавний, з текстом на екрані, з озвучкою, під трендовий звук, капкат...",
    type: "text",
  },
  {
    id: "audience",
    q: "Хто твоя цільова аудиторія?",
    hint: "Вік, стать, що їх мотивує прийти на заняття, де вони тебе знаходять...",
    type: "text",
  },
  {
    id: "goal",
    q: "Яка зараз головна ціль в Instagram?",
    hint: "",
    type: "options",
    options: ["Нові записи на пробне", "Ріст підписників", "Впізнаваність бренду студії", "Утримання поточних учнів", "Все одразу"],
  },
  {
    id: "problems",
    q: "Що тебе найбільше бентежить в поточному контенті?",
    hint: "Що не так з результатами, що хотів би змінити, де відчуваєш що щось не працює...",
    type: "text",
  },
];

function InterviewStep({ data, onNext }) {
  const [answers, setAnswers] = useState({});
  const [current, setCurrent] = useState(0);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef();

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, [current]);

  const q = QUESTIONS[current];
  const allDone = current >= QUESTIONS.length;

  const submit = (val) => {
    if (!val?.trim() && q.type === "text") return;
    const newAnswers = { ...answers, [q.id]: val };
    setAnswers(newAnswers);
    setInputVal("");
    if (current + 1 >= QUESTIONS.length) {
      onNext(newAnswers);
    } else {
      setCurrent(c => c + 1);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Progress */}
      <div style={{ display: "flex", gap: 4 }}>
        {QUESTIONS.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 3,
            background: i < current ? "#e040fb" : i === current ? "#7c3aed" : "#1f2937",
            transition: "background .3s",
          }} />
        ))}
      </div>

      {/* Answered questions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {QUESTIONS.slice(0, current).map(q => (
          <div key={q.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 12, color: "#555" }}>✓ {q.q}</div>
            <div style={{ fontSize: 13, color: "#888", background: "#111827", borderRadius: 8, padding: "8px 12px" }}>
              {answers[q.id]}
            </div>
          </div>
        ))}
      </div>

      {/* Current question */}
      {!allDone && (
        <div style={{ background: "#111827", border: "1px solid #7c3aed44", borderRadius: 16, padding: "24px" }}>
          <div style={{ fontSize: 11, color: "#7c3aed", marginBottom: 8 }}>Питання {current + 1} / {QUESTIONS.length}</div>
          <div style={{ fontSize: 17, color: "#f1f1f1", fontWeight: 600, marginBottom: 8 }}>{q.q}</div>
          {q.hint && <div style={{ fontSize: 12, color: "#555", marginBottom: 16 }}>{q.hint}</div>}

          {q.type === "options" ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {q.options.map(opt => (
                <button key={opt} onClick={() => submit(opt)} style={{
                  background: "#0d1117", border: "1px solid #333", borderRadius: 100,
                  color: "#ccc", padding: "8px 16px", fontSize: 13, cursor: "pointer",
                  transition: "all .15s",
                }}
                  onMouseEnter={e => { e.target.style.borderColor = "#e040fb"; e.target.style.color = "#e040fb"; }}
                  onMouseLeave={e => { e.target.style.borderColor = "#333"; e.target.style.color = "#ccc"; }}
                >{opt}</button>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <textarea
                ref={inputRef}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(inputVal); } }}
                placeholder="Введи відповідь... (Enter щоб продовжити)"
                style={{
                  flex: 1, background: "#0d1117", border: "1px solid #333", borderRadius: 10,
                  color: "#f1f1f1", padding: "12px 14px", fontSize: 14, resize: "none",
                  minHeight: 80, outline: "none", fontFamily: "inherit",
                }}
              />
              <button onClick={() => submit(inputVal)} style={{
                background: "#7c3aed", border: "none", borderRadius: 10, color: "#fff",
                padding: "12px 18px", fontSize: 20, cursor: "pointer", alignSelf: "flex-end",
              }}>→</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── STEP 3: FULL ANALYSIS ─────────────────────────────────────────────────────

function AnalysisStep({ data, answers }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState(null);

  const buildPrompt = () => {
    const posts = data.posts || [];
    const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    const sorted = [...posts].sort((a, b) => n(b["Перегляди"]) - n(a["Перегляди"]));
    const top10 = sorted.slice(0, 10);

    const byType = {};
    posts.forEach(p => {
      const t = (p["Тип допису"] || "Інше").replace("Instagram Reels", "Reels").replace("Зображення", "Фото");
      if (!byType[t]) byType[t] = { views: [], saves: [], likes: [], count: 0 };
      byType[t].views.push(n(p["Перегляди"]));
      byType[t].saves.push(n(p["Збереження"]));
      byType[t].likes.push(n(p["Вподобання"]));
      byType[t].count++;
    });

    const typeStr = Object.entries(byType).map(([t, d]) =>
      `  ${t}: ${d.count} публ., сер. ${avg(d.views)} переглядів, ${avg(d.saves)} збережень`
    ).join("\n");

    const top10str = top10.map((p, i) =>
      `  ${i + 1}. ${n(p["Перегляди"]).toLocaleString()} перегл. | 🔖${n(p["Збереження"])} ❤️${n(p["Вподобання"])} | "${(p["Опис"] || "").slice(0, 80)}"`
    ).join("\n");

    const sumArr = (arr) => (arr || []).reduce((s, r) => s + r.value, 0);

    return `Ти — провідний контент-стратег для Instagram танцювальної студії @soroka_dancestudio (Хмельницький, Україна).

ДАНІ ЗА 14 бер — 10 квіт 2026:

Статистика акаунту:
- Охоплення: ${sumArr(data.daily?.охоплення).toLocaleString()}
- Перегляди: ${sumArr(data.daily?.перегляди).toLocaleString()}  
- Взаємодії: ${sumArr(data.daily?.взаємодії).toLocaleString()}
- Нових підписників: ${sumArr(data.daily?.читачі)}
- Відвідувань профілю: ${sumArr(data.daily?.відвідування).toLocaleString()}
- Постів/Reels: ${posts.length}, Сторіз: ${data.stories?.length || 0}

Ефективність форматів:
${typeStr}

Топ-10 постів:
${top10str}

ПРО КОНТЕНТ (відповіді автора):
- Теми: ${answers.topics}
- Хук: ${answers.hook}
- CTA: ${answers.cta}
- Монтаж/стиль: ${answers.editing}
- Цільова аудиторія: ${answers.audience}
- Головна ціль: ${answers.goal}
- Що бентежить: ${answers.problems}

Дай ГЛИБОКИЙ структурований аналіз у форматі JSON з такими розділами:
{
  "diagnosis": "2-3 речення — реальний діагноз акаунту на основі метрик + контексту",
  "strengths": [{"title": "...", "evidence": "конкретний приклад з даних", "metric": "число"}],
  "weaknesses": [{"title": "...", "reason": "чому так відбувається", "fix": "конкретна дія"}],
  "formats": [{"name": "назва формату", "prediction": "прогноз охоплення/збережень", "why": "чому спрацює", "example": "конкретна ідея для студії"}],
  "contentPlan": [{"day": "день", "format": "тип", "topic": "тема", "hook": "хук", "cta": "заклик"}],
  "hypotheses": [{"claim": "гіпотеза", "evidence": "що в даних вказує на це", "action": "що перевірити"}],
  "kpis": [{"metric": "назва", "current": "поточне", "target": "ціль", "how": "як досягти"}]
}

Відповідай ТІЛЬКИ валідним JSON, без коментарів.`;
  };

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 3000,
          messages: [{ role: "user", content: buildPrompt() }],
        }),
      });
      const json = await res.json();
      const text = json.content?.[0]?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      setReport(JSON.parse(clean));
    } catch (e) {
      console.error(e);
      setReport({ error: "Помилка парсингу. Спробуй ще раз." });
    }
    setLoading(false);
  }

  if (!report && !loading) {
    return (
      <div style={{ textAlign: "center", padding: "48px 24px" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
        <div style={{ fontSize: 18, color: "#f1f1f1", fontWeight: 600, marginBottom: 8 }}>
          Всі дані зібрані
        </div>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 32, maxWidth: 400, margin: "0 auto 32px" }}>
          Claude проаналізує метрики + твої відповіді і видасть глибокий звіт з прогнозами і конкретним планом
        </div>
        <button onClick={generate} style={{
          background: "linear-gradient(135deg, #7c3aed, #e040fb)",
          color: "#fff", border: "none", borderRadius: 14, padding: "18px 48px",
          fontSize: 16, fontWeight: 700, cursor: "pointer",
        }}>✦ Запустити повний аналіз</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: 32, marginBottom: 16, animation: "spin 2s linear infinite" }}>⚙️</div>
        <div style={{ fontSize: 15, color: "#888" }}>Аналізую 166 постів + твої відповіді...</div>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (report.error) return <div style={{ color: "#f87171", padding: 24 }}>{report.error}</div>;

  const Section = ({ id, icon, title, children }) => {
    const open = activeSection === id;
    return (
      <div style={{ background: "#111827", border: `1px solid ${open ? "#7c3aed44" : "#1f2937"}`, borderRadius: 16, overflow: "hidden" }}>
        <button onClick={() => setActiveSection(open ? null : id)} style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "18px 22px", background: "none", border: "none", cursor: "pointer", textAlign: "left",
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#f1f1f1" }}>{icon} {title}</span>
          <span style={{ color: "#555", fontSize: 18 }}>{open ? "▲" : "▼"}</span>
        </button>
        {open && <div style={{ padding: "0 22px 22px" }}>{children}</div>}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Diagnosis */}
      <div style={{ background: "linear-gradient(135deg, #1a0533, #0d1117)", border: "1px solid #7c3aed44", borderRadius: 16, padding: "22px 24px" }}>
        <div style={{ fontSize: 11, color: "#7c3aed", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Діагноз акаунту</div>
        <div style={{ fontSize: 15, color: "#e1e1e1", lineHeight: 1.7 }}>{report.diagnosis}</div>
      </div>

      {/* Strengths */}
      <Section id="strengths" icon="💪" title="Що реально працює">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(report.strengths || []).map((s, i) => (
            <div key={i} style={{ background: "#0d1117", borderRadius: 10, padding: "14px 16px", borderLeft: "3px solid #4ade80" }}>
              <div style={{ fontSize: 14, color: "#f1f1f1", fontWeight: 600 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{s.evidence}</div>
              {s.metric && <div style={{ fontSize: 13, color: "#4ade80", marginTop: 6, fontFamily: "monospace" }}>{s.metric}</div>}
            </div>
          ))}
        </div>
      </Section>

      {/* Weaknesses */}
      <Section id="weaknesses" icon="⚡" title="Де є проблеми — і як їх вирішити">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(report.weaknesses || []).map((w, i) => (
            <div key={i} style={{ background: "#0d1117", borderRadius: 10, padding: "14px 16px", borderLeft: "3px solid #f87171" }}>
              <div style={{ fontSize: 14, color: "#f1f1f1", fontWeight: 600 }}>{w.title}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{w.reason}</div>
              <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 8 }}>→ {w.fix}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Formats */}
      <Section id="formats" icon="🎯" title="Прогноз: які формати дадуть найбільше результату">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(report.formats || []).map((f, i) => (
            <div key={i} style={{ background: "#0d1117", borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontSize: 14, color: "#e040fb", fontWeight: 700 }}>{f.name}</div>
                <div style={{ fontSize: 12, color: "#4ade80", background: "#4ade8011", borderRadius: 6, padding: "3px 8px" }}>{f.prediction}</div>
              </div>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>{f.why}</div>
              <div style={{ fontSize: 12, color: "#a78bfa", background: "#7c3aed11", borderRadius: 8, padding: "8px 10px" }}>
                💡 Ідея: {f.example}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Hypotheses */}
      <Section id="hypotheses" icon="🔬" title="Гіпотези для перевірки">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(report.hypotheses || []).map((h, i) => (
            <div key={i} style={{ background: "#0d1117", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 14, color: "#f1f1f1", fontWeight: 600 }}>🤔 {h.claim}</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Дані: {h.evidence}</div>
              <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 8 }}>Дія: {h.action}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Content Plan */}
      <Section id="contentPlan" icon="📅" title="Контент-план на тиждень">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(report.contentPlan || []).map((c, i) => (
            <div key={i} style={{ background: "#0d1117", borderRadius: 10, padding: "12px 14px", display: "grid", gridTemplateColumns: "60px 80px 1fr", gap: 10, alignItems: "start" }}>
              <div style={{ fontSize: 12, color: "#e040fb", fontWeight: 700 }}>{c.day}</div>
              <div style={{ fontSize: 11, color: "#7c3aed", background: "#7c3aed11", borderRadius: 4, padding: "2px 6px", textAlign: "center" }}>{c.format}</div>
              <div>
                <div style={{ fontSize: 13, color: "#f1f1f1" }}>{c.topic}</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>Хук: {c.hook}</div>
                <div style={{ fontSize: 11, color: "#555" }}>CTA: {c.cta}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* KPIs */}
      <Section id="kpis" icon="📈" title="Цілі на наступний місяць">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {(report.kpis || []).map((k, i) => (
            <div key={i} style={{ background: "#0d1117", borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, color: "#666" }}>{k.metric}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0" }}>
                <span style={{ fontSize: 18, color: "#888", fontFamily: "monospace" }}>{k.current}</span>
                <span style={{ color: "#555" }}>→</span>
                <span style={{ fontSize: 18, color: "#4ade80", fontFamily: "monospace", fontWeight: 700 }}>{k.target}</span>
              </div>
              <div style={{ fontSize: 11, color: "#555" }}>{k.how}</div>
            </div>
          ))}
        </div>
      </Section>

    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

export default function AICoach({ data }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(null);

  return (
    <div style={{
      "--text": "#f1f1f1", "--muted": "#666", "--card": "#111827",
      "--border": "#1f2937", "--bg": "#0d1117",
      background: "var(--bg)", color: "var(--text)",
      fontFamily: "'DM Sans', system-ui, sans-serif",
      padding: "24px 0",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap');`}</style>

      <StepBar step={step} />

      {step === 0 && <MetricsStep data={data} onNext={() => setStep(1)} />}
      {step === 1 && <InterviewStep data={data} onNext={(ans) => { setAnswers(ans); setStep(2); }} />}
      {step === 2 && answers && <AnalysisStep data={data} answers={answers} />}
    </div>
  );
}

import { useState, useCallback, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from "recharts";

// ── helpers ────────────────────────────────────────────────────────────────

function parseUTF16CSV(buffer) {
  const text = new TextDecoder("utf-16le").decode(buffer);
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  // skip "sep=," line and title line, take data from line 3+
  const dataLines = lines.slice(3);
  return dataLines.map((l) => {
    const parts = l.split(",").map((v) => v.replace(/^"|"$/g, "").trim());
    return { date: parts[0]?.slice(0, 10), value: parseInt(parts[1] || "0", 10) };
  }).filter((r) => r.date && !isNaN(r.value));
}

function parseUTF8CSV(buffer) {
  const text = new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((l) => {
    const vals = parseCSVLine(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
    return obj;
  }).filter((r) => r["ID допису"]);
}

function parseCSVLine(line) {
  const result = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === "," && !inQ) { result.push(cur); cur = ""; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

function detectFileType(buffer) {
  // UTF-16 files start with BOM FF FE
  const arr = new Uint8Array(buffer.slice(0, 4));
  if (arr[0] === 0xFF && arr[1] === 0xFE) return "utf16";
  return "utf8";
}

function n(v) { return parseInt(v, 10) || 0; }

function fmt(num) {
  if (num >= 1000) return (num / 1000).toFixed(1) + "к";
  return num?.toString() ?? "0";
}

function groupByWeek(rows) {
  const weeks = {};
  rows.forEach((r) => {
    const d = new Date(r.date);
    const mon = new Date(d); mon.setDate(d.getDate() - d.getDay() + 1);
    const key = mon.toISOString().slice(0, 10);
    if (!weeks[key]) weeks[key] = { week: key, value: 0 };
    weeks[key].value += r.value;
  });
  return Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week));
}

function groupByMonth(rows) {
  const months = {};
  rows.forEach((r) => {
    const key = r.date?.slice(0, 7);
    if (!months[key]) months[key] = { month: key, value: 0 };
    months[key].value += r.value;
  });
  return Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
}

// ── MetricCard ──────────────────────────────────────────────────────────────

const METRIC_INFO = {
  "Охоплення": "Унікальні акаунти, які побачили твій контент. Найважливіша метрика для розуміння реального розміру аудиторії.",
  "Перегляди": "Загальна кількість переглядів — один акаунт може переглянути кілька разів.",
  "Взаємодії": "Сума лайків, коментарів, збережень і поширень. Показує наскільки контент чіпляє.",
  "Відвідування": "Переходи на профіль — люди зацікавились і хочуть дізнатись більше.",
  "Кліки посилань": "Кліки по посиланню в біо — прямий індикатор наміру записатись.",
  "Читачі": "Нові підписники за день. Різниця між приходом і відтоком.",
  "ER%": "Engagement Rate = (взаємодії / охоплення) × 100. Норма для студій — 3–8%.",
};

function MetricCard({ label, value, sub, accent = false }) {
  const [tip, setTip] = useState(false);
  const info = METRIC_INFO[label];
  return (
    <div style={{
      background: accent ? "#1a1a2e" : "var(--card)",
      border: `1px solid ${accent ? "#e040fb44" : "var(--border)"}`,
      borderRadius: 16, padding: "18px 20px", position: "relative",
      transition: "transform .15s", cursor: "default",
    }}
      onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
      onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 12, color: "var(--muted)", letterSpacing: ".05em", textTransform: "uppercase" }}>{label}</span>
        {info && (
          <span style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer", userSelect: "none" }}
            onClick={() => setTip(!tip)}>ⓘ</span>
        )}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: accent ? "#e040fb" : "var(--text)", margin: "6px 0 2px", fontFamily: "'DM Mono', monospace" }}>
        {fmt(value)}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</div>}
      {tip && info && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: 0, right: 0,
          background: "#1e1e3a", border: "1px solid #e040fb44", borderRadius: 10,
          padding: "10px 12px", fontSize: 12, color: "#ccc", lineHeight: 1.5, zIndex: 10,
          boxShadow: "0 8px 24px #0008"
        }}>{info}</div>
      )}
    </div>
  );
}

// ── PostCard ────────────────────────────────────────────────────────────────

function PostCard({ row, type }) {
  const isStory = type === "story";
  const metrics = isStory
    ? [
        ["👁 Перегляди", n(row["Перегляди"])],
        ["📡 Охоплення", n(row["Охоплення"])],
        ["↩ Відповіді", n(row["Відповіді"])],
        ["⏭ Навігація", n(row["Навігація"])],
        ["👤 Профіль", n(row["Відвідування профілю"])],
      ]
    : [
        ["👁 Перегляди", n(row["Перегляди"])],
        ["❤️ Лайки", n(row["Вподобання"])],
        ["🔖 Збережень", n(row["Збереження"])],
        ["💬 Комент.", n(row["Коментарі"])],
        ["📡 Охоплення", n(row["Охоплення"])],
      ];

  const reach = n(row["Охоплення"]) || n(row["Перегляди"]);
  const engage = n(row["Вподобання"]) + n(row["Коментарі"]) + n(row["Збереження"]) + n(row["Поширення"]);
  const er = reach > 0 ? ((engage / reach) * 100).toFixed(1) : "—";

  const caption = row["Опис"]?.slice(0, 80) || "(без підпису)";
  const date = row["Час публікації"]?.slice(0, 10) || row["Дата"]?.slice(0, 10) || "";
  const link = row["Постійне посилання"];

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 16, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{
          fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase",
          background: isStory ? "#ff6b6b22" : "#7c3aed22",
          color: isStory ? "#ff6b6b" : "#a78bfa",
          padding: "3px 8px", borderRadius: 6,
        }}>{isStory ? "Сторіз" : row["Тип допису"] || "Пост"}</span>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{date}</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: 0, lineHeight: 1.4 }}>{caption}{row["Опис"]?.length > 80 ? "…" : ""}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {metrics.map(([label, val]) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: "'DM Mono', monospace" }}>{fmt(val)}</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>{label}</div>
          </div>
        ))}
      </div>
      {!isStory && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>ER: <strong style={{ color: parseFloat(er) >= 3 ? "#4ade80" : "#fb923c" }}>{er}%</strong></span>
          {link && <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#a78bfa", textDecoration: "none" }}>↗ відкрити</a>}
        </div>
      )}
    </div>
  );
}

// ── AI Report ───────────────────────────────────────────────────────────────

function AIReport({ data }) {
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setReport("");

    const sumArr = (arr) => (arr || []).reduce((s, r) => s + r.value, 0);

    const totalReach = sumArr(data.daily.охоплення);
    const totalViews = sumArr(data.daily.перегляди);
    const totalInteractions = sumArr(data.daily.взаємодії);
    const totalFollowers = sumArr(data.daily.читачі);
    const totalVisits = sumArr(data.daily.відвідування);

    const sortedPosts = [...data.posts].sort((a, b) => n(b["Перегляди"]) - n(a["Перегляди"]));
    const top5 = sortedPosts.slice(0, 5).map((p, i) =>
      `${i+1}. ${p["Тип допису"]||"Пост"} | ${n(p["Перегляди"]).toLocaleString()} переглядів | охоплення ${n(p["Охоплення"]).toLocaleString()} | ❤️${n(p["Вподобання"])} 🔖${n(p["Збереження"])} 💬${n(p["Коментарі"])} — "${(p["Опис"]||"").slice(0,70)}"`
    ).join("\n");

    const avgViews = data.posts.length > 0 ? Math.round(data.posts.reduce((s, p) => s + n(p["Перегляди"]), 0) / data.posts.length) : 0;
    const totalSaves = data.posts.reduce((s, p) => s + n(p["Збереження"]), 0);
    const totalShares = data.posts.reduce((s, p) => s + n(p["Поширення"]), 0);

    const prompt = `Ти — аналітик контент-стратегії для танцювальної студії в Хмельницькому (Instagram @soroka_dancestudio).

РЕАЛЬНІ ДАНІ за 14 бер — 10 квіт 2026:

Загальна статистика акаунту:
- Охоплення акаунту: ${totalReach.toLocaleString()}
- Перегляди акаунту: ${totalViews.toLocaleString()}
- Взаємодії з контентом: ${totalInteractions.toLocaleString()}
- Нових підписників: ${totalFollowers}
- Відвідувань профілю: ${totalVisits.toLocaleString()}

Контент:
- Постів/Reels опубліковано: ${data.posts.length}
- Сторіз опубліковано: ${data.stories.length}
- Середній перегляд поста: ${avgViews.toLocaleString()}
- Всього збережень постів: ${totalSaves.toLocaleString()}
- Всього поширень постів: ${totalShares.toLocaleString()}

Топ-5 постів за переглядами:
${top5}

Напиши аналіз українською (тепло, як досвідчений SMM-колега, спирайся на реальні числа):
1. Загальна картина
2. Що спрацювало добре
3. Що варто покращити
4. 3 конкретні рекомендації на наступний місяць

Без зайвих заголовків, живий текст з абзацами.`;

    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const json = await res.json();
      setReport(json.content?.[0]?.text || "Помилка отримання відповіді");
    } catch (e) {
      setReport("Помилка: " + e.message);
    }
    setLoading(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 20, color: "var(--text)" }}>AI-аналіз від Claude</h3>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>Аналіз контент-стратегії за завантажений період</p>
        </div>
        <button onClick={generate} disabled={loading} style={{
          background: loading ? "var(--border)" : "linear-gradient(135deg, #7c3aed, #e040fb)",
          color: "#fff", border: "none", borderRadius: 12, padding: "12px 24px",
          fontSize: 14, fontWeight: 600, cursor: loading ? "wait" : "pointer",
          transition: "opacity .2s",
        }}>
          {loading ? "Аналізую…" : "✦ Згенерувати аналіз"}
        </button>
      </div>
      {report && (
        <div style={{
          background: "var(--card)", border: "1px solid #7c3aed44",
          borderRadius: 16, padding: "24px 28px",
          fontSize: 15, lineHeight: 1.8, color: "var(--text)",
          whiteSpace: "pre-wrap",
        }}>
          {report}
        </div>
      )}
      {!report && !loading && (
        <div style={{
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 16, padding: "48px", textAlign: "center", color: "var(--muted)", fontSize: 14,
        }}>
          Натисни кнопку вище — Claude проаналізує твої дані і дасть конкретні поради
        </div>
      )}
    </div>
  );
}

// ── Chart helpers ────────────────────────────────────────────────────────────

const CHART_COLORS = {
  охоплення: "#e040fb",
  перегляди: "#7c3aed",
  взаємодії: "#4ade80",
  відвідування: "#fb923c",
  читачі: "#38bdf8",
};

function DailyChart({ data, metric }) {
  const rows = data?.map(r => ({ date: r.date?.slice(5), value: r.value })) || [];
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={rows} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#666" }} tickLine={false} axisLine={false} tickFormatter={fmt} />
        <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#999" }} itemStyle={{ color: "#fff" }} />
        <Line type="monotone" dataKey="value" stroke={CHART_COLORS[metric] || "#7c3aed"}
          strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Upload screen ────────────────────────────────────────────────────────────

function UploadScreen({ onLoad }) {
  const [dragging, setDragging] = useState(false);

  async function processFiles(files) {
    const result = { posts: [], stories: [], daily: {} };
    for (const file of files) {
      const buf = await file.arrayBuffer();
      const type = detectFileType(buf);
      if (type === "utf8") {
        const rows = parseUTF8CSV(buf);
        if (rows[0]?.["Відповіді"] !== undefined || rows[0]?.["Натискання на наліпки"] !== undefined) {
          result.stories.push(...rows);
        } else {
          result.posts.push(...rows);
        }
      } else {
        const rows = parseUTF16CSV(buf);
        const name = file.name.toLowerCase();
        if (name.includes("охоплення")) result.daily.охоплення = rows;
        else if (name.includes("перегляди")) result.daily.перегляди = rows;
        else if (name.includes("взаємодії") || name.includes("взаємодіі")) result.daily.взаємодії = rows;
        else if (name.includes("відвідування")) result.daily.відвідування = rows;
        else if (name.includes("кліки")) result.daily.кліки = rows;
        else if (name.includes("читачі")) result.daily.читачі = rows;
      }
    }
    onLoad(result);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", margin: "0 0 8px" }}>
          Аналітика Instagram
        </h2>
        <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
          Завантаж CSV файли з Meta Business Suite.<br />
          Підтримуються: Охоплення, Перегляди, Взаємодії,<br />
          Відвідування, Читачі, та файли контенту.
        </p>
        <label
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); processFiles([...e.dataTransfer.files]); }}
          style={{
            display: "block", border: `2px dashed ${dragging ? "#e040fb" : "var(--border)"}`,
            borderRadius: 20, padding: "48px 32px", cursor: "pointer",
            background: dragging ? "#e040fb08" : "var(--card)",
            transition: "all .2s",
          }}>
          <input type="file" multiple accept=".csv" style={{ display: "none" }}
            onChange={e => processFiles([...e.target.files])} />
          <div style={{ fontSize: 32, marginBottom: 12 }}>☁️</div>
          <div style={{ fontSize: 15, color: "var(--text)", fontWeight: 600 }}>Перетягни файли або клікни</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>До 8 CSV файлів одночасно</div>
        </label>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Analytics() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("overview");

  const totals = useMemo(() => {
    if (!data) return {};
    return {
      охоплення: data.daily.охоплення?.reduce((s, r) => s + r.value, 0) || 0,
      перегляди: data.daily.перегляди?.reduce((s, r) => s + r.value, 0) || 0,
      взаємодії: data.daily.взаємодії?.reduce((s, r) => s + r.value, 0) || 0,
      відвідування: data.daily.відвідування?.reduce((s, r) => s + r.value, 0) || 0,
      читачі: data.daily.читачі?.reduce((s, r) => s + r.value, 0) || 0,
      постів: data.posts.length,
      сторіз: data.stories.length,
    };
  }, [data]);

  const weeklyData = useMemo(() => {
    if (!data?.daily?.охоплення) return [];
    return groupByWeek(data.daily.охоплення).map(w => ({
      week: w.week.slice(5),
      охоплення: w.value,
      перегляди: groupByWeek(data.daily.перегляди || [])[0]?.value || 0,
    }));
  }, [data]);

  if (!data) return (
    <div style={{ "--text": "#f1f1f1", "--muted": "#666", "--card": "#111827", "--border": "#1f2937", "--bg": "#0d1117" }}>
      <style>{`body{background:#0d1117;} * {box-sizing:border-box;}`}</style>
      <UploadScreen onLoad={setData} />
    </div>
  );

  const tabs = [
    { id: "overview", label: "Огляд" },
    { id: "posts", label: `Пости (${data.posts.length})` },
    { id: "stories", label: `Сторіз (${data.stories.length})` },
    { id: "weekly", label: "Тижні" },
    { id: "ai", label: "✦ AI-аналіз" },
  ];

  return (
    <div style={{
      "--text": "#f1f1f1", "--muted": "#6b7280", "--card": "#111827",
      "--border": "#1f2937", "--bg": "#0d1117",
      minHeight: "100vh", background: "var(--bg)", color: "var(--text)",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=DM+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>
            <span style={{ background: "linear-gradient(90deg,#7c3aed,#e040fb)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              soroka_dancestudio
            </span>
            {" "}— аналітика
          </h1>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>14 бер — 10 квіт 2026</p>
        </div>
        <button onClick={() => setData(null)} style={{
          background: "none", border: "1px solid var(--border)", color: "var(--muted)",
          borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer",
        }}>↩ Оновити дані</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 32px", borderBottom: "1px solid var(--border)" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: "none", border: "none", color: tab === t.id ? "#e040fb" : "var(--muted)",
            borderBottom: `2px solid ${tab === t.id ? "#e040fb" : "transparent"}`,
            padding: "14px 16px", fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            cursor: "pointer", transition: "all .15s", whiteSpace: "nowrap",
          }}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "28px 32px", maxWidth: 1200, margin: "0 auto" }}>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
              <MetricCard label="Охоплення" value={totals.охоплення} sub="унікальних акаунтів" />
              <MetricCard label="Перегляди" value={totals.перегляди} sub="всього переглядів" />
              <MetricCard label="Взаємодії" value={totals.взаємодії} sub="лайки + коментарі + збереження" />
              <MetricCard label="Відвідування" value={totals.відвідування} sub="переходів на профіль" />
              <MetricCard label="Читачі" value={totals.читачі} sub="нових підписників" accent />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {["охоплення", "перегляди", "взаємодії", "відвідування"].map(key => (
                <div key={key} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "18px 20px" }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 14 }}>{key}</div>
                  <DailyChart data={data.daily[key]} metric={key} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* POSTS */}
        {tab === "posts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              <MetricCard label="ER%" value={
                totals.охоплення > 0
                  ? +((data.posts.reduce((s, r) => s + n(r["Вподобання"]) + n(r["Коментарі"]) + n(r["Збереження"]), 0) / totals.охоплення) * 100).toFixed(1)
                  : 0
              } sub="середній engagement rate" accent />
              <MetricCard label="Охоплення" value={data.posts.reduce((s, r) => s + n(r["Охоплення"]), 0)} sub="сума по всіх постах" />
              <MetricCard label="Збережень" value={data.posts.reduce((s, r) => s + n(r["Збереження"]), 0)} sub="найцінніша взаємодія" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
              {data.posts
                .sort((a, b) => n(b["Охоплення"]) - n(a["Охоплення"]))
                .map((row, i) => <PostCard key={i} row={row} type="post" />)}
            </div>
          </div>
        )}

        {/* STORIES */}
        {tab === "stories" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              <MetricCard label="Охоплення" value={data.stories.reduce((s, r) => s + n(r["Охоплення"]), 0)} sub="сума по всіх сторіз" />
              <MetricCard label="Відповіді" value={data.stories.reduce((s, r) => s + n(r["Відповіді"]), 0)} sub="прямі повідомлення" accent />
              <MetricCard label="Перегляди" value={data.stories.reduce((s, r) => s + n(r["Перегляди"]), 0)} sub="загальна кількість" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
              {data.stories
                .sort((a, b) => n(b["Охоплення"]) - n(a["Охоплення"]))
                .map((row, i) => <PostCard key={i} row={row} type="story" />)}
            </div>
          </div>
        )}

        {/* WEEKLY */}
        {tab === "weekly" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 24px" }}>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>Охоплення по тижнях</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={groupByWeek(data.daily.охоплення || [])} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#666" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#666" }} tickLine={false} axisLine={false} tickFormatter={fmt} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#999" }} />
                  <Bar dataKey="value" fill="#e040fb" radius={[6, 6, 0, 0]} name="Охоплення" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {[
                { key: "перегляди", label: "Перегляди по тижнях" },
                { key: "взаємодії", label: "Взаємодії по тижнях" },
                { key: "відвідування", label: "Відвідування профілю" },
                { key: "читачі", label: "Нові підписники" },
              ].map(({ key, label }) => (
                <div key={key} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "18px 20px" }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>{label}</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={groupByWeek(data.daily[key] || [])} margin={{ top: 0, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                      <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#666" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "#666" }} tickLine={false} axisLine={false} tickFormatter={fmt} />
                      <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 11 }} />
                      <Bar dataKey="value" fill={CHART_COLORS[key] || "#7c3aed"} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI */}
        {tab === "ai" && <AIReport data={data} />}
      </div>
    </div>
  );
}

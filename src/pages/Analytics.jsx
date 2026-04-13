import { useState, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend
} from "recharts";
import AICoach from "./AICoach";

// ── helpers ────────────────────────────────────────────────────────────────

function parseUTF16CSV(buffer) {
  const text = new TextDecoder("utf-16le").decode(buffer);
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
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
  const arr = new Uint8Array(buffer.slice(0, 4));
  if (arr[0] === 0xFF && arr[1] === 0xFE) return "utf16";
  return "utf8";
}

const n = (v) => parseInt(v, 10) || 0;
const fmt = (num) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "М";
  if (num >= 1000) return (num / 1000).toFixed(1) + "к";
  return String(num || 0);
};

// Smart merge: combine API data with CSV data (CSV has video views)
function mergeAPIwithCSV(apiPosts, csvPosts) {
  if (!csvPosts || csvPosts.length === 0) return apiPosts;
  
  // Build lookup by permalink or ID
  const csvMap = {};
  csvPosts.forEach(p => {
    const link = p["Постійне посилання"] || "";
    const id = link.split("/").filter(Boolean).pop();
    if (id) csvMap[id] = p;
  });

  return apiPosts.map(p => {
    const id = p.permalink?.split("/").filter(Boolean).pop();
    const csv = csvMap[id];
    if (!csv) return p;
    return {
      ...p,
      // CSV has video views which API doesn't provide
      video_views: n(csv["Перегляди"]) || p.video_views || 0,
      // Use CSV values as fallback if API returned 0
      likes: p.likes || n(csv["Вподобання"]) || 0,
      comments: p.comments || n(csv["Коментарі"]) || 0,
      saved: p.saved || n(csv["Збереження"]) || 0,
      shares: p.shares || n(csv["Поширення"]) || 0,
      reach: p.reach || n(csv["Охоплення"]) || 0,
    };
  });
}

// ── MetricCard ──────────────────────────────────────────────────────────────

const METRIC_INFO = {
  "Охоплення": "Унікальні акаунти, які побачили контент. Найважливіша метрика росту.",
  "Перегляди": "Загальна кількість переглядів відео. Один акаунт може переглянути кілька разів.",
  "Взаємодії": "Сума лайків, коментарів, збережень і поширень.",
  "Відвідування": "Переходи на профіль — люди зацікавились і хочуть дізнатись більше.",
  "Кліки": "Кліки по посиланню в біо — прямий намір записатись.",
  "Підписники": "Нові підписники за період.",
  "ER%": "Engagement Rate = (взаємодії / охоплення) × 100. Норма для студій 3–8%.",
};

function MetricCard({ label, value, sub, accent = false }) {
  const [tip, setTip] = useState(false);
  const info = METRIC_INFO[label];
  return (
    <div style={{
      background: accent ? "#1a1a2e" : "var(--card)",
      border: `1px solid ${accent ? "#e040fb44" : "var(--border)"}`,
      borderRadius: 16, padding: "18px 20px", position: "relative",
      transition: "transform .15s",
    }}
      onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
      onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".05em", textTransform: "uppercase" }}>{label}</span>
        {info && <span style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer" }} onClick={() => setTip(!tip)}>ⓘ</span>}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: accent ? "#e040fb" : "var(--text)", margin: "6px 0 2px", fontFamily: "monospace" }}>
        {fmt(value)}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</div>}
      {tip && info && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: 0, right: 0,
          background: "#1e1e3a", border: "1px solid #e040fb44", borderRadius: 10,
          padding: "10px 12px", fontSize: 12, color: "#ccc", lineHeight: 1.5, zIndex: 10,
        }}>{info}</div>
      )}
    </div>
  );
}

// ── PostCard ────────────────────────────────────────────────────────────────

function PostCard({ row, type }) {
  const isStory = type === "story";
  const isAPI = !!(row.id && !row["ID допису"]);

  const views = isAPI ? (row.video_views || 0) : n(row["Перегляди"]);
  const likes = isAPI ? (row.likes || 0) : n(row["Вподобання"]);
  const saves = isAPI ? (row.saved || 0) : n(row["Збереження"]);
  const comments = isAPI ? (row.comments || 0) : n(row["Коментарі"]);
  const reach = isAPI ? (row.reach || 0) : n(row["Охоплення"]);
  const shares = isAPI ? (row.shares || 0) : n(row["Поширення"]);
  const replies = isAPI ? (row.replies || 0) : n(row["Відповіді"] || 0);
  const tapsForward = isAPI ? (row.taps_forward || 0) : n(row["Навігація"] || 0);
  const exits = isAPI ? (row.exits || 0) : n(row["Виходи"] || 0);
  const caption = isAPI ? (row.caption || "") : (row["Опис"] || "");
  const date = isAPI ? row.timestamp?.slice(0, 10) : (row["Час публікації"]?.slice(0, 10) || row["Дата"]?.slice(0, 10) || "");
  const link = isAPI ? row.permalink : row["Постійне посилання"];
  const thumb = isAPI ? row.thumbnail_url : null;
  const storyViews = isAPI ? (row.reach || 0) : n(row["Перегляди"]);

  const metrics = isStory
    ? [
        ["👁 Перегляди", storyViews],
        ["📡 Охоплення", reach],
        ["↩ Відповіді", replies],
        ["⏭ Навігація", tapsForward],
        ["🚪 Виходи", exits],
      ]
    : [
        ["▶️ Перегляди", views],
        ["❤️ Лайки", likes],
        ["🔖 Збережень", saves],
        ["💬 Комент.", comments],
        ["📡 Охоплення", reach],
      ];

  const engage = likes + saves + comments + shares;
  const er = reach > 0 ? ((engage / reach) * 100).toFixed(1) : "—";
  const mediaType = isAPI ? row.media_type : row["Тип допису"];

  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 16, overflow: "hidden",
    }}>
      {thumb && (
        <div style={{ width: "100%", height: 120, overflow: "hidden", position: "relative" }}>
          <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {views > 0 && (
            <div style={{
              position: "absolute", bottom: 8, right: 8,
              background: "#000000aa", borderRadius: 6, padding: "3px 8px",
              fontSize: 12, color: "#fff", fontFamily: "monospace",
            }}>▶ {fmt(views)}</div>
          )}
        </div>
      )}
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase",
            background: isStory ? "#ff6b6b22" : "#7c3aed22",
            color: isStory ? "#ff6b6b" : "#a78bfa",
            padding: "3px 8px", borderRadius: 6,
          }}>{isStory ? "Сторіз" : (mediaType || "Пост")}</span>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>{date}</span>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: 0, lineHeight: 1.4 }}>
          {caption?.slice(0, 80)}{caption?.length > 80 ? "…" : ""}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
          {metrics.map(([label, val]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", fontFamily: "monospace" }}>{fmt(val)}</div>
              <div style={{ fontSize: 9, color: "var(--muted)" }}>{label}</div>
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
    </div>
  );
}

// ── Demographics ────────────────────────────────────────────────────────────

const DEMO_COLORS = ["#e040fb", "#7c3aed", "#4ade80", "#fb923c", "#38bdf8", "#f472b6", "#a3e635", "#fbbf24"];

function DemographicsTab({ demographics }) {
  const [view, setView] = useState("gender");

  if (!demographics || demographics._error) {
    return (
      <div style={{ textAlign: "center", padding: "48px", color: "var(--muted)", fontSize: 14 }}>
        Демографічні дані недоступні.<br />
        <span style={{ fontSize: 12, color: "#555" }}>Потрібен дозвіл instagram_manage_insights з верифікованим бізнес-акаунтом.</span>
      </div>
    );
  }

  const genderData = demographics.gender
    ? Object.entries(demographics.gender).map(([k, v]) => ({
        name: k === "F" ? "Жінки" : k === "M" ? "Чоловіки" : k,
        value: v,
      }))
    : [];

  const ageData = demographics.age
    ? Object.entries(demographics.age)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, v]) => ({ name: k, value: v }))
    : [];

  const countryData = demographics.country
    ? Object.entries(demographics.country)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([k, v]) => ({ name: k, value: v }))
    : [];

  const tabs = [
    { id: "gender", label: "Стать", data: genderData },
    { id: "age", label: "Вік", data: ageData },
    { id: "country", label: "Країна", data: countryData },
  ];

  const current = tabs.find(t => t.id === view);
  const total = current?.data.reduce((s, r) => s + r.value, 0) || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 8, background: "var(--card)", padding: 6, borderRadius: 100, width: "fit-content" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setView(t.id)} style={{
            background: view === t.id ? "#7c3aed" : "transparent",
            border: "none", borderRadius: 100, color: view === t.id ? "#fff" : "var(--muted)",
            padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>{t.label}</button>
        ))}
      </div>

      {view === "gender" && genderData.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", marginBottom: 16 }}>Розподіл за статтю</div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={genderData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({name, percent}) => `${name} ${(percent*100).toFixed(0)}%`}>
                  {genderData.map((_, i) => <Cell key={i} fill={DEMO_COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v) => [fmt(v), ""]} contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {genderData.map((g, i) => (
              <div key={g.name} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ fontSize: 14, color: DEMO_COLORS[i], fontWeight: 700 }}>{g.name}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", fontFamily: "monospace", margin: "4px 0" }}>{((g.value / total) * 100).toFixed(1)}%</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{fmt(g.value)} підписників</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "age" && ageData.length > 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px" }}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", marginBottom: 16 }}>Вікові групи</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={ageData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#666" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#666" }} tickLine={false} axisLine={false} tickFormatter={fmt} />
              <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="value" name="Підписники" fill="#7c3aed" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {view === "country" && countryData.length > 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px" }}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", marginBottom: 16 }}>Топ країн</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {countryData.map((c, i) => (
              <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 32 }}>{i + 1}.</span>
                <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 600, minWidth: 80 }}>{c.name}</span>
                <div style={{ flex: 1, height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${(c.value / total) * 100}%`, height: "100%", background: DEMO_COLORS[i % DEMO_COLORS.length], borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 50, textAlign: "right" }}>{((c.value / total) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── DailyChart ──────────────────────────────────────────────────────────────

const CHART_COLORS = {
  охоплення: "#e040fb", перегляди: "#7c3aed", взаємодії: "#4ade80",
  відвідування: "#fb923c", читачі: "#38bdf8", follower_count: "#38bdf8",
  reach: "#e040fb", profile_views: "#fb923c",
};

function DailyChart({ data, metric }) {
  const rows = (data || []).filter(r => r.date && r.value !== undefined)
    .map(r => ({ date: r.date?.slice(5), value: r.value }));
  if (rows.length === 0) return <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 13 }}>Немає даних</div>;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={rows} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#666" }} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#666" }} tickLine={false} axisLine={false} tickFormatter={fmt} />
        <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#999" }} itemStyle={{ color: "#fff" }} />
        <Line type="monotone" dataKey="value" stroke={CHART_COLORS[metric] || "#7c3aed"} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Upload screen ────────────────────────────────────────────────────────────

async function parseCsvFiles(files) {
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
  return result;
}

function mergeSourcesAndLoad(api, csv, onLoad) {
  if (!api && !csv) return;
  if (api && !csv) { onLoad({ ...api }); return; }
  if (!api && csv) { onLoad({ ...csv, source: "csv" }); return; }

  const mergedPosts = mergeAPIwithCSV(api.posts, csv.posts);

  // Merge stories: deduplicate by permalink
  const apiStoryLinks = new Set(api.stories.map(s => s.permalink).filter(Boolean));
  const csvStoriesExtra = (csv.stories || []).filter(s => {
    const link = s["Постійне посилання"] || "";
    return !apiStoryLinks.has(link);
  });

  const mergedDaily = {
    охоплення: csv.daily.охоплення?.length ? csv.daily.охоплення : api.daily.охоплення,
    перегляди: csv.daily.перегляди?.length ? csv.daily.перегляди : api.daily.перегляди || [],
    взаємодії: csv.daily.взаємодії?.length ? csv.daily.взаємодії : api.daily.взаємодії || [],
    відвідування: csv.daily.відвідування?.length ? csv.daily.відвідування : api.daily.відвідування,
    читачі: csv.daily.читачі?.length ? csv.daily.читачі : api.daily.читачі,
    кліки: csv.daily.кліки?.length ? csv.daily.кліки : api.daily.кліки || [],
  };

  onLoad({
    posts: mergedPosts,
    stories: [...api.stories, ...csvStoriesExtra],
    daily: mergedDaily,
    account: api.account,
    demographics: api.demographics || {},
    source: "both",
    hasCsvMerge: true,
  });
}

function UploadScreen({ onLoad }) {
  const [dragging, setDragging] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [apiData, setApiData] = useState(null);
  const [csvData, setCsvData] = useState(null);
  const [csvCount, setCsvCount] = useState(0);

  async function syncFromAPI() {
    setSyncing(true);
    setSyncError("");
    try {
      const res = await fetch("/api/instagram");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const posts = (json.media || []).filter(m => m.media_type !== "STORY");
      const stories = (json.media || []).filter(m => m.media_type === "STORY");
      const daily = {
        охоплення: json.daily?.reach || [],
        перегляди: [],
        відвідування: json.daily?.profile_views || [],
        читачі: json.daily?.follower_count || [],
        взаємодії: [],
        кліки: json.daily?.website_clicks || [],
      };
      const api = { posts, stories, daily, account: json.account, demographics: json.demographics || {}, source: "api" };
      setApiData(api);
    } catch (e) {
      setSyncError("Помилка: " + e.message);
    }
    setSyncing(false);
  }

  async function handleCsvFiles(files) {
    const csv = await parseCsvFiles(files);
    setCsvData(csv);
    setCsvCount(files.length);
  }

  const bothLoaded = apiData && csvData;
  const anyLoaded = apiData || csvData;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 600, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <h2 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", margin: "0 0 8px" }}>Instagram Analytics</h2>
        <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
          Завантаж обидва джерела для максимальних даних 🔥
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div style={{
            background: apiData ? "#0d1f0d" : "linear-gradient(135deg, #1a0533, #0d1117)",
            border: `1px solid ${apiData ? "#4ade8055" : "#7c3aed44"}`,
            borderRadius: 20, padding: "24px 20px", textAlign: "center",
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>⚡</div>
            <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 700, marginBottom: 4 }}>Instagram API</div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 16, lineHeight: 1.5 }}>
              Авто: охоплення, лайки,<br />збереження, демографія
            </div>
            {apiData ? (
              <div>
                <div style={{ fontSize: 13, color: "#4ade80", fontWeight: 700 }}>✓ Завантажено</div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{apiData.posts.length} постів · {apiData.stories.length} сторіз</div>
                <button onClick={syncFromAPI} disabled={syncing} style={{ marginTop: 10, background: "none", border: "1px solid #333", borderRadius: 8, color: "#666", padding: "6px 14px", fontSize: 11, cursor: "pointer" }}>
                  {syncing ? "..." : "↻ Оновити"}
                </button>
              </div>
            ) : (
              <button onClick={syncFromAPI} disabled={syncing} style={{
                background: syncing ? "#333" : "linear-gradient(135deg, #7c3aed, #e040fb)",
                color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px",
                fontSize: 13, fontWeight: 700, cursor: syncing ? "wait" : "pointer", width: "100%",
              }}>
                {syncing ? "Завантажую..." : "✦ Підключити"}
              </button>
            )}
            {syncError && <div style={{ fontSize: 11, color: "#f87171", marginTop: 8 }}>{syncError}</div>}
          </div>

          <label
            style={{
              background: csvData ? "#0d1f0d" : "var(--card)",
              border: `2px dashed ${csvData ? "#4ade8055" : dragging ? "#e040fb" : "var(--border)"}`,
              borderRadius: 20, padding: "24px 20px", cursor: "pointer",
              display: "block", transition: "all .2s", textAlign: "center",
            }}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleCsvFiles([...e.dataTransfer.files]); }}
          >
            <input type="file" multiple accept=".csv" style={{ display: "none" }} onChange={e => handleCsvFiles([...e.target.files])} />
            <div style={{ fontSize: 28, marginBottom: 8 }}>☁️</div>
            <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 700, marginBottom: 4 }}>CSV файли</div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 16, lineHeight: 1.5 }}>
              Перегляди відео, сторіз,<br />повна денна статистика
            </div>
            {csvData ? (
              <div>
                <div style={{ fontSize: 13, color: "#4ade80", fontWeight: 700 }}>✓ Завантажено</div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{csvCount} файлів · {csvData.posts.length} постів</div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--muted)", background: "#1f2937", borderRadius: 8, padding: "8px 12px" }}>
                Перетягни або клікни
              </div>
            )}
          </label>
        </div>

        {anyLoaded && (
          <div style={{ background: "#111827", border: `1px solid ${bothLoaded ? "#4ade8033" : "#fb923c33"}`, borderRadius: 12, padding: "12px 20px", marginBottom: 16, fontSize: 13, color: bothLoaded ? "#4ade80" : "#fb923c", fontWeight: 600 }}>
            {bothLoaded
              ? "🔥 Обидва джерела завантажені — максимальна аналітика!"
              : "⚡ Можна відкрити або додати друге джерело для повних даних"}
          </div>
        )}

        {anyLoaded && (
          <button onClick={() => mergeSourcesAndLoad(apiData, csvData, onLoad)} style={{
            background: "linear-gradient(135deg, #7c3aed, #e040fb)",
            color: "#fff", border: "none", borderRadius: 14, padding: "14px 40px",
            fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%",
          }}>
            {bothLoaded ? "✦ Відкрити повну аналітику" : "→ Відкрити з наявними даними"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Analytics() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("overview");
  const [csvFiles, setCsvFiles] = useState(null);
  const [merging, setMerging] = useState(false);

  // Allow adding CSV on top of API data for video views
  async function addCSVtoAPI(files) {
    setMerging(true);
    const csvPosts = [];
    for (const file of files) {
      const buf = await file.arrayBuffer();
      if (detectFileType(buf) === "utf8") {
        const rows = parseUTF8CSV(buf);
        if (!rows[0]?.["Відповіді"]) csvPosts.push(...rows);
      }
    }
    if (csvPosts.length > 0) {
      const merged = mergeAPIwithCSV(data.posts, csvPosts);
      setData(prev => ({ ...prev, posts: merged, hasCsvMerge: true }));
    }
    setMerging(false);
  }

  const totals = useMemo(() => {
    if (!data) return {};
    const sumArr = arr => (arr || []).reduce((s, r) => s + (r.value || 0), 0);
    return {
      охоплення: sumArr(data.daily.охоплення) || sumArr(data.daily.reach),
      перегляди: sumArr(data.daily.перегляди) || data.posts.reduce((s, p) => s + (p.video_views || 0), 0),
      взаємодії: sumArr(data.daily.взаємодії) || data.posts.reduce((s, p) => s + (p.total_interactions || n(p["Вподобання"]) + n(p["Коментарі"]) + n(p["Збереження"])), 0),
      відвідування: sumArr(data.daily.відвідування) || sumArr(data.daily.profile_views),
      читачі: sumArr(data.daily.читачі) || sumArr(data.daily.follower_count),
      постів: data.posts.length,
      сторіз: data.stories.length,
    };
  }, [data]);

  if (!data) return (
    <div style={{ "--text": "#f1f1f1", "--muted": "#666", "--card": "#111827", "--border": "#1f2937", "--bg": "#0d1117" }}>
      <style>{`* { box-sizing: border-box; margin: 0; }`}</style>
      <UploadScreen onLoad={setData} />
    </div>
  );

  const isAPIData = data.source === "api";

  const tabs = [
    { id: "overview", label: "Огляд" },
    { id: "posts", label: `Пости (${data.posts.length})` },
    { id: "stories", label: `Сторіз (${data.stories.length})` },
    { id: "weekly", label: "Тижні" },
    { id: "demographics", label: "👥 Аудиторія" },
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
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>
            <span style={{ background: "linear-gradient(90deg,#7c3aed,#e040fb)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {data.account?.username || "soroka_dancestudio"}
            </span>
            {" "}— аналітика
          </h1>
          <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
            {data.account?.followers_count && (
              <span style={{ fontSize: 12, color: "#666" }}>👥 {data.account.followers_count.toLocaleString()} підписників</span>
            )}
            {data.account?.media_count && (
              <span style={{ fontSize: 12, color: "#666" }}>📸 {data.account.media_count} публікацій</span>
            )}
            {data.hasCsvMerge && <span style={{ fontSize: 12, color: "#4ade80" }}>✓ CSV merged (перегляди)</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {isAPIData && !data.hasCsvMerge && (
            <label style={{
              background: "#1f2937", border: "1px solid #7c3aed44", borderRadius: 8,
              padding: "8px 14px", fontSize: 12, color: "#a78bfa", cursor: "pointer",
            }}>
              <input type="file" multiple accept=".csv" style={{ display: "none" }} onChange={e => addCSVtoAPI([...e.target.files])} />
              {merging ? "Merging..." : "📎 Додати CSV (перегляди)"}
            </label>
          )}
          <button onClick={() => setData(null)} style={{
            background: "none", border: "1px solid var(--border)", color: "var(--muted)",
            borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer",
          }}>↩ Оновити дані</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 32px", borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: "none", border: "none", color: tab === t.id ? "#e040fb" : "var(--muted)",
            borderBottom: `2px solid ${tab === t.id ? "#e040fb" : "transparent"}`,
            padding: "14px 16px", fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            cursor: "pointer", whiteSpace: "nowrap",
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
              <MetricCard label="Взаємодії" value={totals.взаємодії} sub="лайки + збереження + комент." />
              <MetricCard label="Відвідування" value={totals.відвідування} sub="переходів на профіль" />
              <MetricCard label="Підписники" value={totals.читачі} sub="нових за період" accent />
            </div>

            {/* Account stats */}
            {data.account && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
                {[
                  { label: "Всього постів", value: data.account.media_count },
                  { label: "Постів у вибірці", value: data.posts.length },
                  { label: "Сторіз у вибірці", value: data.stories.length },
                  {
                    label: "Сер. лайків/пост",
                    value: data.posts.length > 0
                      ? Math.round(data.posts.reduce((s, p) => s + (p.likes || n(p["Вподобання"]) || 0), 0) / data.posts.length)
                      : 0
                  },
                  {
                    label: "Сер. збережень",
                    value: data.posts.length > 0
                      ? Math.round(data.posts.reduce((s, p) => s + (p.saved || n(p["Збереження"]) || 0), 0) / data.posts.length)
                      : 0
                  },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase" }}>{label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", fontFamily: "monospace", marginTop: 4 }}>{fmt(value)}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              {[
                { key: "охоплення", label: "Охоплення" },
                { key: "відвідування", label: "Відвідування профілю" },
                { key: "читачі", label: "Нові підписники" },
                { key: "кліки", label: "Кліки посилань" },
              ].map(({ key, label }) => {
                const d = data.daily[key] || data.daily[key === "читачі" ? "follower_count" : key === "охоплення" ? "reach" : key === "відвідування" ? "profile_views" : ""];
                return (
                  <div key={key} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "18px 20px" }}>
                    <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 14 }}>{label}</div>
                    <DailyChart data={d} metric={key} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* POSTS */}
        {tab === "posts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              <MetricCard label="Збережень" value={data.posts.reduce((s, p) => s + (p.saved || n(p["Збереження"]) || 0), 0)} sub="найцінніша взаємодія" accent />
              <MetricCard label="Поширень" value={data.posts.reduce((s, p) => s + (p.shares || n(p["Поширення"]) || 0), 0)} sub="органічне розповсюдження" />
              <MetricCard label="Лайків" value={data.posts.reduce((s, p) => s + (p.likes || n(p["Вподобання"]) || 0), 0)} sub="всього по постах" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
              {[...data.posts]
                .sort((a, b) => (b.reach || n(b["Охоплення"]) || 0) - (a.reach || n(a["Охоплення"]) || 0))
                .map((row, i) => <PostCard key={i} row={row} type="post" />)}
            </div>
          </div>
        )}

        {/* STORIES */}
        {tab === "stories" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              <MetricCard label="Охоплення" value={data.stories.reduce((s, r) => s + (r.reach || n(r["Охоплення"]) || 0), 0)} sub="сума по всіх сторіз" />
              <MetricCard label="Відповіді" value={data.stories.reduce((s, r) => s + (r.replies || n(r["Відповіді"]) || 0), 0)} sub="прямі повідомлення" accent />
              <MetricCard label="Перегляди" value={data.stories.reduce((s, r) => s + (r.reach || n(r["Перегляди"]) || 0), 0)} sub="загальна кількість" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
              {[...data.stories]
                .sort((a, b) => (b.reach || n(b["Охоплення"]) || 0) - (a.reach || n(a["Охоплення"]) || 0))
                .map((row, i) => <PostCard key={i} row={row} type="story" />)}
            </div>
          </div>
        )}

        {/* WEEKLY */}
        {tab === "weekly" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {[
              { key: "охоплення", label: "Охоплення по тижнях", color: "#e040fb" },
              { key: "відвідування", label: "Відвідування по тижнях", color: "#fb923c" },
              { key: "читачі", label: "Нові підписники по тижнях", color: "#38bdf8" },
            ].map(({ key, label, color }) => {
              const d = data.daily[key] || [];
              const weeks = {};
              d.forEach(r => {
                const dt = new Date(r.date);
                const mon = new Date(dt); mon.setDate(dt.getDate() - dt.getDay() + 1);
                const wk = mon.toISOString().slice(5, 10);
                if (!weeks[wk]) weeks[wk] = { week: wk, value: 0 };
                weeks[wk].value += r.value;
              });
              const wkData = Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week));
              return (
                <div key={key} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 24px" }}>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>{label}</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={wkData} margin={{ left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff06" />
                      <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#666" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "#666" }} tickLine={false} axisLine={false} tickFormatter={fmt} />
                      <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            })}
          </div>
        )}

        {/* DEMOGRAPHICS */}
        {tab === "demographics" && <DemographicsTab demographics={data.demographics} />}

        {/* AI */}
        {tab === "ai" && <AICoach data={data} />}
      </div>
    </div>
  );
}

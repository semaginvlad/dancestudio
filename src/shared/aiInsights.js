const asArray = (value) => (Array.isArray(value) ? value : []);

const displayStudent = (student = {}) => (
  student.name
  || [student.lastName, student.firstName].filter(Boolean).join(" ").trim()
  || [student.last_name, student.first_name].filter(Boolean).join(" ").trim()
  || "Учениця"
);

const displayGroup = (group = {}) => group.name || group.title || "група";

const uniq = (rows, keyFn) => {
  const seen = new Set();
  return rows.filter((row) => {
    const key = keyFn(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const insight = ({ id, priority = "medium", title, summary, evidence = [], recommendation, source }) => ({
  id,
  priority,
  title,
  summary,
  evidence: evidence.filter(Boolean).slice(0, 4),
  recommendation,
  source,
});

export function buildAIInsights({
  proAnalytics = {},
  dashboard = {},
  paymentAnomalies = [],
  waitlist = [],
  groups = [],
} = {}) {
  const insights = [];
  const groupById = Object.fromEntries(asArray(groups).map((g) => [String(g.id), g]));

  const churnRows = uniq(asArray(proAnalytics.churnRisk), (row) => String(row?.student?.id || row?.studentId || displayStudent(row?.student)));
  if (churnRows.length > 0) {
    insights.push(insight({
      id: "churn-risk",
      priority: "high",
      title: "Учениці з ризиком відтоку",
      summary: `${churnRows.length} учениць потребують ручної перевірки перед продовженням абонемента.`,
      evidence: churnRows.slice(0, 3).map((row) => `${displayStudent(row.student)} · ${displayGroup(row.group)} · не була ${row.daysSinceLast || "10+"} днів`),
      recommendation: "Перевірити історію відвідувань і вручну вирішити, кому варто написати. AI v1 нічого не надсилає автоматично.",
      source: "proAnalytics.churnRisk",
    }));
  }

  const upsellRows = uniq(asArray(proAnalytics.upsellCandidates), (row) => `${row?.student?.id || displayStudent(row?.student)}:${row?.group?.id || displayGroup(row?.group)}`);
  if (upsellRows.length > 0) {
    insights.push(insight({
      id: "upsell-candidates",
      priority: "medium",
      title: "Кандидати на більший абонемент",
      summary: `${upsellRows.length} учениць тренуються достатньо часто, щоб розглянути більший пакет.`,
      evidence: upsellRows.slice(0, 3).map((row) => `${displayStudent(row.student)} · ${displayGroup(row.group)} · ${row.reason || `запропонувати ${row.suggest || "більший пакет"}`}`),
      recommendation: "Показати адміністратору як список для ручної комунікації; не створювати оплату і не змінювати абонемент автоматично.",
      source: "proAnalytics.upsellCandidates",
    }));
  }

  const lowAttendanceRows = asArray(dashboard.lowAttendanceGroupRows);
  if (lowAttendanceRows.length > 0) {
    insights.push(insight({
      id: "low-attendance-groups",
      priority: "medium",
      title: "Групи з низькою середньою відвідуваністю",
      summary: `${lowAttendanceRows.length} груп мають середню відвідуваність нижче 4 за заняття у вибраному періоді.`,
      evidence: lowAttendanceRows.slice(0, 3).map((row) => `${row.name}: ${row.average} середня · ${row.held} занять`),
      recommendation: "Перевірити час, тренера, наповнення групи та причини пропусків перед будь-якими змінами в розкладі.",
      source: "dashboard.lowAttendanceGroupRows",
    }));
  }

  const anomalyRows = asArray(paymentAnomalies);
  if (anomalyRows.length > 0) {
    const byType = anomalyRows.reduce((acc, row) => {
      const key = row.type || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    insights.push(insight({
      id: "payment-attendance-anomalies",
      priority: "high",
      title: "Аномалії оплат / відвідувань",
      summary: `${anomalyRows.length} потенційних невідповідностей між оплатами та відвідуваннями.`,
      evidence: Object.entries(byType).slice(0, 4).map(([type, count]) => `${type}: ${count}`),
      recommendation: "Перевірити записи вручну у вкладках оплати/відвідування. AI v1 не виправляє дані автоматично.",
      source: "paymentAnomalies",
    }));
  }

  const waitingRows = asArray(waitlist).filter((row) => ["waiting", "contacted", ""].includes(String(row.status || "")) && row.groupId);
  const waitingByGroup = waitingRows.reduce((acc, row) => {
    const key = String(row.groupId);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const reserveRows = Object.entries(waitingByGroup)
    .map(([groupId, count]) => ({ groupId, count, group: groupById[groupId] }))
    .sort((a, b) => b.count - a.count);
  if (reserveRows.length > 0) {
    insights.push(insight({
      id: "reserve-demand",
      priority: "low",
      title: "Попит у резерві / waitlist",
      summary: `${reserveRows.length} груп мають активний попит у листі очікування.`,
      evidence: reserveRows.slice(0, 3).map((row) => `${displayGroup(row.group)}: ${row.count} у резерві`),
      recommendation: "Розглянути додаткові місця або слот лише після ручної перевірки місткості, тренера й розкладу.",
      source: "waitlist",
    }));
  }

  if (insights.length === 0) {
    insights.push(insight({
      id: "no-critical-insights",
      priority: "low",
      title: "Критичних AI-підказок не знайдено",
      summary: "За доступними read-only метриками немає явних ризиків для першочергової дії.",
      evidence: dashboard.period ? [`Період: ${dashboard.period.start}–${dashboard.period.end}`] : [],
      recommendation: "Продовжувати моніторинг Dashboard і запускати перевірку вручну після оновлення даних.",
      source: "rule-based-v1",
    }));
  }

  return insights.sort((a, b) => {
    const weight = { high: 0, medium: 1, low: 2 };
    return (weight[a.priority] ?? 9) - (weight[b.priority] ?? 9);
  }).slice(0, 5);
}

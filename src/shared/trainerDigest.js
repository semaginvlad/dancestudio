import { getDisplayName, getSubStatus, today } from "./utils";

export const parseTrainerGroups = (note = "") => {
  const match = note.match(/trainer_groups\s*:\s*([^\n\r]+)/i);
  if (!match?.[1]) return [];
  return match[1].split("|").map((s) => s.trim()).filter(Boolean);
};

export const isTrainerChatByNote = (note = "") => {
  const lc = String(note || "").toLowerCase();
  return lc.includes("trainer") || lc.includes("тренер") || /trainer_groups\s*:/i.test(note);
};

const PAID_PLAN_TYPES = new Set(["4pack", "8pack", "12pack"]);

const normalizeStudentGroupIds = (student, membership) => {
  const inline = [student?.groupId, ...(Array.isArray(student?.groupIds) ? student.groupIds : [])].filter(Boolean);
  return Array.from(new Set([...(membership || []), ...inline]));
};

export const buildTrainerMessageDraft = ({
  groups = [],
  students = [],
  membershipByStudent = {},
  subsByStudent = {},
  attn = [],
  enabledGroupIds = null,
  referenceDate = today(),
}) => {
  const sections = [];
  const summaryByGroup = [];
  const debtStudentIds = new Set(
    (attn || [])
      .filter((a) => String(a?.entryType || a?.guestType || "") === "debt" && a?.studentId)
      .map((a) => String(a.studentId))
  );

  const selectedGroups = Array.isArray(enabledGroupIds) && enabledGroupIds.length
    ? groups.filter((g) => enabledGroupIds.includes(String(g.id)))
    : groups;

  const hasValidPaidNowOrFuture = (subs = []) => {
    const now = String(referenceDate || today());
    return subs.some((s) => {
      if (!PAID_PLAN_TYPES.has(String(s.planType || ""))) return false;
      if (s.paid === false) return false;
      const status = getSubStatus(s);
      if (status === "active" || status === "warning") return true;
      const start = String(s.startDate || s.activationDate || s.created_at || "").slice(0, 10);
      return !!start && start > now;
    });
  };

  selectedGroups.forEach((g) => {
    const members = students.filter((st) =>
      normalizeStudentGroupIds(st, membershipByStudent[st.id] || []).includes(g.id)
    );
    if (!members.length) return;

    const picked = new Set();
    const byCategory = {
      debt: [],
      expiringOrExpired: [],
      trialOnly: [],
      singleOnly: [],
      noSubscription: [],
    };

    const candidates = members.filter((m) => {
      const groupSubs = (subsByStudent[m.id] || []).filter((s) => String(s.groupId) === String(g.id));
      return !hasValidPaidNowOrFuture(groupSubs);
    });

    candidates.forEach((m) => {
      const sid = String(m.id);
      if (debtStudentIds.has(sid)) {
        byCategory.debt.push(getDisplayName(m));
        picked.add(sid);
      }
    });

    candidates.forEach((m) => {
      const sid = String(m.id);
      if (picked.has(sid)) return;
      const groupSubs = (subsByStudent[m.id] || []).filter((s) => String(s.groupId) === String(g.id));
      const paidSubs = groupSubs.filter((s) => PAID_PLAN_TYPES.has(String(s.planType || "")));
      if (!paidSubs.length) return;
      const latestPaid = [...paidSubs].sort((a, b) => {
        const aKey = a.endDate || a.activationDate || a.startDate || a.created_at || "";
        const bKey = b.endDate || b.activationDate || b.startDate || b.created_at || "";
        return String(bKey).localeCompare(String(aKey));
      })[0];
      const status = latestPaid ? getSubStatus(latestPaid) : null;
      if (status === "warning" || status === "expired" || status === "active") {
        byCategory.expiringOrExpired.push(getDisplayName(m));
        picked.add(sid);
      }
    });

    candidates.forEach((m) => {
      const sid = String(m.id);
      if (picked.has(sid)) return;
      const groupSubs = (subsByStudent[m.id] || []).filter((s) => String(s.groupId) === String(g.id));
      if (!groupSubs.length) return;
      const onlyTrial = groupSubs.every((s) => String(s.planType || "") === "trial");
      if (onlyTrial) {
        byCategory.trialOnly.push(getDisplayName(m));
        picked.add(sid);
      }
    });

    candidates.forEach((m) => {
      const sid = String(m.id);
      if (picked.has(sid)) return;
      const groupSubs = (subsByStudent[m.id] || []).filter((s) => String(s.groupId) === String(g.id));
      if (!groupSubs.length) return;
      const onlySingle = groupSubs.every((s) => String(s.planType || "") === "single");
      if (onlySingle) {
        byCategory.singleOnly.push(getDisplayName(m));
        picked.add(sid);
      }
    });

    candidates.forEach((m) => {
      const sid = String(m.id);
      if (picked.has(sid)) return;
      const groupSubs = (subsByStudent[m.id] || []).filter((s) => String(s.groupId) === String(g.id));
      if (!groupSubs.length) {
        byCategory.noSubscription.push(getDisplayName(m));
        picked.add(sid);
      }
    });

    const groupSections = [];
    if (byCategory.debt.length) groupSections.push(`• Боргові / debt:\n${byCategory.debt.map((n) => `- ${n}`).join("\n")}`);
    if (byCategory.expiringOrExpired.length) groupSections.push(`• Закінчується або закінчився абонемент:\n${byCategory.expiringOrExpired.map((n) => `- ${n}`).join("\n")}`);
    if (byCategory.trialOnly.length) groupSections.push(`• Було тільки пробне:\n${byCategory.trialOnly.map((n) => `- ${n}`).join("\n")}`);
    if (byCategory.singleOnly.length) groupSections.push(`• Були тільки разові:\n${byCategory.singleOnly.map((n) => `- ${n}`).join("\n")}`);
    if (byCategory.noSubscription.length) groupSections.push(`• Без жодного абонемента:\n${byCategory.noSubscription.map((n) => `- ${n}`).join("\n")}`);

    if (groupSections.length) {
      sections.push({ title: `Група: ${g.name}`, items: groupSections });
      summaryByGroup.push({
        groupId: String(g.id),
        groupName: g.name,
        total: groupSections.length,
        studentsCount:
          byCategory.debt.length +
          byCategory.expiringOrExpired.length +
          byCategory.trialOnly.length +
          byCategory.singleOnly.length +
          byCategory.noSubscription.length,
        categories: byCategory,
      });
    }
  });

  const header = "Зведення для тренера";
  const body = sections.map((s) => `${s.title}\n${s.items.join("\n\n")}`).join("\n\n");
  return {
    text: body ? `${header}\n\n${body}` : "",
    sections,
    summaryByGroup,
    automationReady: {
      mode: "trainer_digest_v1",
      recommendedSchedule: "В день заняття, за 1 годину до часу заняття (по schedule групи)",
      groupSelection: "Беруться тільки групи з trainer_groups у note чату + enabled toggles",
      generatedAt: new Date().toISOString(),
    },
  };
};

export const buildGroupScheduleWindows = (group) => {
  const schedule = Array.isArray(group?.schedule) ? group.schedule : [];
  return schedule
    .map((s) => {
      const day = Number(s?.day);
      const time = String(s?.time || "");
      if (!Number.isInteger(day) || day < 0 || day > 6 || !/^\d{2}:\d{2}$/.test(time)) return null;
      const [hh, mm] = time.split(":").map(Number);
      const totalMinutes = hh * 60 + mm - 60;
      const safeMinutes = ((totalMinutes % 1440) + 1440) % 1440;
      const sendH = String(Math.floor(safeMinutes / 60)).padStart(2, "0");
      const sendM = String(safeMinutes % 60).padStart(2, "0");
      return {
        day,
        trainingTime: time,
        sendTime: `${sendH}:${sendM}`,
      };
    })
    .filter(Boolean);
};

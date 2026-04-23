import { getDisplayName, getSubStatus } from "./utils";

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
}) => {
  const sections = [];
  const debtStudentIds = new Set(
    (attn || [])
      .filter((a) => String(a?.entryType || a?.guestType || "") === "debt" && a?.studentId)
      .map((a) => String(a.studentId))
  );

  groups.forEach((g) => {
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

    members.forEach((m) => {
      const sid = String(m.id);
      if (debtStudentIds.has(sid)) {
        byCategory.debt.push(getDisplayName(m));
        picked.add(sid);
      }
    });

    members.forEach((m) => {
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
      if (status === "warning" || status === "expired") {
        byCategory.expiringOrExpired.push(getDisplayName(m));
        picked.add(sid);
      }
    });

    members.forEach((m) => {
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

    members.forEach((m) => {
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

    members.forEach((m) => {
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
    }
  });

  const header = "Зведення для тренера";
  const body = sections.map((s) => `${s.title}\n${s.items.join("\n\n")}`).join("\n\n");
  return {
    text: body ? `${header}\n\n${body}` : "",
    sections,
    automationReady: {
      mode: "trainer_digest_v1",
      recommendedSchedule: "Щопонеділка о 09:00 (локальний час студії)",
      groupSelection: "Групи беруться з trainer_groups у note чату (trainer_groups: Group A | Group B)",
      generatedAt: new Date().toISOString(),
    },
  };
};

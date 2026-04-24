import { getDisplayName, getEffectiveEndDate, getSubStatus, hasActiveSubscriptionCoverage, today } from "./utils";

export const parseTrainerGroups = (note = "") => {
  const match = note.match(/trainer_groups\s*:\s*([^\n\r]+)/i);
  if (!match?.[1]) return [];
  return match[1].split("|").map((s) => s.trim()).filter(Boolean);
};

export const parseTrainerGroupIds = (note = "") => {
  const match = String(note || "").match(/trainer_group_ids\s*:\s*([^\n\r]+)/i);
  if (!match?.[1]) return [];
  return match[1].split("|").map((s) => s.trim()).filter(Boolean);
};

export const patchTrainerGroupIdsInNote = (note = "", groupIds = []) => {
  const ids = Array.from(new Set((groupIds || []).map((x) => String(x || "").trim()).filter(Boolean))).sort();
  const line = `trainer_group_ids: ${ids.join("|")}`;
  const src = String(note || "");
  if (!ids.length) return src.replace(/\n?trainer_group_ids\s*:[^\n\r]*/gi, "").trim();
  if (/trainer_group_ids\s*:/i.test(src)) {
    return src.replace(/trainer_group_ids\s*:[^\n\r]*/i, line);
  }
  return src.trim() ? `${src.trim()}\n${line}` : line;
};

export const parseTrainerAutoSendMap = (note = "") => {
  const match = String(note || "").match(/trainer_auto_send\s*:\s*([^\n\r]+)/i);
  if (!match?.[1]) return {};
  return match[1]
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, row) => {
      const [groupIdRaw, enabledRaw] = row.split("=");
      const groupId = String(groupIdRaw || "").trim();
      const enabled = String(enabledRaw || "").trim().toLowerCase();
      if (!groupId) return acc;
      acc[groupId] = enabled !== "0" && enabled !== "false" && enabled !== "off";
      return acc;
    }, {});
};

export const patchTrainerAutoSendMapInNote = (note = "", autoSendMap = {}) => {
  const entries = Object.entries(autoSendMap || {})
    .filter(([groupId]) => String(groupId || "").trim())
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([groupId, enabled]) => `${groupId}=${enabled ? "1" : "0"}`);
  const trainerAutoSendLine = `trainer_auto_send: ${entries.join("|")}`;
  const src = String(note || "");
  if (!entries.length) {
    return src.replace(/\n?trainer_auto_send\s*:[^\n\r]*/gi, "").trim();
  }
  if (/trainer_auto_send\s*:/i.test(src)) {
    return src.replace(/trainer_auto_send\s*:[^\n\r]*/i, trainerAutoSendLine);
  }
  return src.trim() ? `${src.trim()}\n${trainerAutoSendLine}` : trainerAutoSendLine;
};

export const parseTrainerGroupDraftsMap = (note = "") => {
  const match = String(note || "").match(/trainer_group_drafts\s*:\s*([^\n\r]+)/i);
  if (!match?.[1]) return {};
  return match[1]
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, row) => {
      const splitIndex = row.indexOf("=");
      if (splitIndex <= 0) return acc;
      const groupId = row.slice(0, splitIndex).trim();
      const encoded = row.slice(splitIndex + 1).trim();
      if (!groupId) return acc;
      try {
        acc[groupId] = decodeURIComponent(encoded);
      } catch {
        acc[groupId] = encoded;
      }
      return acc;
    }, {});
};

export const patchTrainerGroupDraftInNote = (note = "", groupId, draftText = "") => {
  const nextGroupId = String(groupId || "").trim();
  if (!nextGroupId) return String(note || "");
  const map = parseTrainerGroupDraftsMap(note || "");
  map[nextGroupId] = String(draftText || "");
  const entries = Object.entries(map)
    .filter(([gid, text]) => String(gid || "").trim() && String(text || "").trim())
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([gid, text]) => `${gid}=${encodeURIComponent(text)}`);
  const line = `trainer_group_drafts: ${entries.join("|")}`;
  const src = String(note || "");
  if (!entries.length) {
    return src.replace(/\n?trainer_group_drafts\s*:[^\n\r]*/gi, "").trim();
  }
  if (/trainer_group_drafts\s*:/i.test(src)) {
    return src.replace(/trainer_group_drafts\s*:[^\n\r]*/i, line);
  }
  return src.trim() ? `${src.trim()}\n${line}` : line;
};

export const parseTrainerLastAutoSendMap = (note = "") => {
  const match = String(note || "").match(/trainer_last_auto_send\s*:\s*([^\n\r]+)/i);
  if (!match?.[1]) return {};
  return match[1]
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, row) => {
      const [groupIdRaw, dedupRaw] = row.split("=");
      const groupId = String(groupIdRaw || "").trim();
      const dedupKey = String(dedupRaw || "").trim();
      if (!groupId || !dedupKey) return acc;
      acc[groupId] = dedupKey;
      return acc;
    }, {});
};

export const patchTrainerLastAutoSendInNote = (note = "", groupId, dedupKey) => {
  const map = parseTrainerLastAutoSendMap(note || "");
  const gid = String(groupId || "").trim();
  const nextDedupKey = String(dedupKey || "").trim();
  if (!gid || !nextDedupKey) return String(note || "");
  map[gid] = nextDedupKey;
  const entries = Object.entries(map)
    .filter(([id, d]) => String(id || "").trim() && String(d || "").trim())
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([id, d]) => `${id}=${String(d).trim()}`);
  const line = `trainer_last_auto_send: ${entries.join("|")}`;
  const src = String(note || "");
  if (/trainer_last_auto_send\s*:/i.test(src)) {
    return src.replace(/trainer_last_auto_send\s*:[^\n\r]*/i, line);
  }
  return src.trim() ? `${src.trim()}\n${line}` : line;
};

export const parseTrainerDispatchHistory = (note = "") => {
  const match = String(note || "").match(/trainer_dispatch_history\s*:\s*([^\n\r]+)/i);
  if (!match?.[1]) return [];
  try {
    const raw = decodeURIComponent(match[1].trim());
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const patchTrainerDispatchHistoryInNote = (note = "", entries = []) => {
  const clean = Array.isArray(entries) ? entries.slice(0, 200) : [];
  if (!clean.length) {
    return String(note || "").replace(/\n?trainer_dispatch_history\s*:[^\n\r]*/gi, "").trim();
  }
  const encoded = encodeURIComponent(JSON.stringify(clean));
  const line = `trainer_dispatch_history: ${encoded}`;
  const src = String(note || "");
  if (/trainer_dispatch_history\s*:/i.test(src)) {
    return src.replace(/trainer_dispatch_history\s*:[^\n\r]*/i, line);
  }
  return src.trim() ? `${src.trim()}\n${line}` : line;
};

export const appendTrainerDispatchHistoryInNote = (note = "", entry) => {
  const prev = parseTrainerDispatchHistory(note || "");
  const next = [entry, ...prev].slice(0, 100);
  return patchTrainerDispatchHistoryInNote(note || "", next);
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

const buildDateFromDayAndTime = (day, time, fromDate) => {
  const [hh, mm] = String(time || "00:00").split(":").map((n) => Number(n || 0));
  const current = new Date(fromDate || new Date());
  const target = new Date(current);
  target.setSeconds(0, 0);
  target.setMinutes(mm, 0, 0);
  target.setHours(hh);
  const currentDay = current.getDay();
  let diff = day - currentDay;
  if (diff < 0) diff += 7;
  target.setDate(current.getDate() + diff);
  if (target <= current) target.setDate(target.getDate() + 7);
  return target;
};

export const findNextValidTrainingSession = ({ group, cancelled = [], now = new Date(), lookaheadDays = 35 }) => {
  const windows = buildGroupScheduleWindows(group).map((w) => ({
    day: w.day,
    trainingTime: w.trainingTime,
  }));
  if (!windows.length) return null;
  const cancelledSet = new Set(
    (cancelled || [])
      .filter((c) => String(c?.groupId) === String(group?.id))
      .map((c) => String(c?.date || "").slice(0, 10))
  );

  const candidates = [];
  windows.forEach((w) => {
    const first = buildDateFromDayAndTime(w.day, w.trainingTime, now);
    for (let i = 0; i < Math.ceil(lookaheadDays / 7) + 1; i += 1) {
      const dt = new Date(first);
      dt.setDate(first.getDate() + i * 7);
      const dateStr = dt.toISOString().slice(0, 10);
      if (cancelledSet.has(dateStr)) continue;
      candidates.push({
        date: dateStr,
        trainingTime: w.trainingTime,
        trainingAt: dt,
      });
    }
  });
  candidates.sort((a, b) => a.trainingAt.getTime() - b.trainingAt.getTime());
  return candidates[0] || null;
};

export const buildGroupDispatchPlan = ({ group, cancelled = [], now = new Date() }) => {
  const nextSession = findNextValidTrainingSession({ group, cancelled, now });
  if (!nextSession) return null;
  const sendAt = new Date(nextSession.trainingAt.getTime() - 60 * 60 * 1000);
  return {
    groupId: String(group?.id),
    groupName: group?.name || "",
    trainingDate: nextSession.date,
    trainingTime: nextSession.trainingTime,
    trainingAtIso: nextSession.trainingAt.toISOString(),
    sendAtIso: sendAt.toISOString(),
  };
};

export const isDispatchDueNow = (plan, now = new Date(), toleranceMinutes = 10) => {
  if (!plan?.sendAtIso) return false;
  const diffMs = now.getTime() - new Date(plan.sendAtIso).getTime();
  return diffMs >= 0 && diffMs <= toleranceMinutes * 60 * 1000;
};

export const buildTrainerGroupDraft = ({
  group,
  students = [],
  membershipByStudent = {},
  subsByStudent = {},
  attn = [],
  targetTrainingDate = today(),
}) => {
  if (!group?.id) {
    return { text: "", studentsList: [], studentsCount: 0, reasonsByStudent: {} };
  }
  const debtStudentIds = new Set(
    (attn || [])
      .filter((a) => String(a?.entryType || a?.guestType || "") === "debt" && a?.studentId)
      .map((a) => String(a.studentId))
  );
  const members = students.filter((st) => {
    const linkedGroups = normalizeStudentGroupIds(st, membershipByStudent[st.id] || []).map(String);
    return linkedGroups.includes(String(group.id));
  });
  const reminderRows = members
    .map((student) => {
      const sid = String(student.id);
      const groupSubs = (subsByStudent[sid] || []).filter((s) => String(s.groupId) === String(group.id));
      const hasCoverage = hasActiveSubscriptionCoverage(groupSubs, sid, String(group.id), targetTrainingDate);
      if (hasCoverage) return null;
      let reason = "потрібне продовження";
      if (debtStudentIds.has(sid)) {
        reason = "борг";
      } else if (!groupSubs.length) {
        reason = "немає абонемента";
      } else if (groupSubs.every((s) => String(s.planType || "") === "trial")) {
        reason = "було тільки trial";
      } else if (groupSubs.every((s) => String(s.planType || "") === "single")) {
        reason = "були тільки разові";
      } else if (groupSubs.some((s) => {
        const end = getEffectiveEndDate(s) || "0000-00-00";
        return end < targetTrainingDate || getSubStatus(s) === "expired";
      })) {
        reason = "абонемент закінчився";
      }
      return {
        studentId: sid,
        name: getDisplayName(student),
        reason,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "uk-UA"));

  const lines = reminderRows.map((x) => `- ${x.name} — ${x.reason}`);
  const text = lines.length
    ? [
      "Зведення для тренера",
      `Група: ${group.name}`,
      `Найближче заняття: ${targetTrainingDate}`,
      "",
      "Нагадати щодо абонемента:",
      ...lines,
    ].join("\n")
    : "";
  return {
    text,
    studentsList: reminderRows,
    studentsCount: reminderRows.length,
    reasonsByStudent: reminderRows.reduce((acc, row) => ({ ...acc, [row.studentId]: row.reason }), {}),
  };
};

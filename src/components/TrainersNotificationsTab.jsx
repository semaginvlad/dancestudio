import React, { useEffect, useMemo, useRef, useState } from "react";
import { theme } from "../shared/constants";
import { buildGroupDispatchPlan, buildTrainerGroupDraft, isDispatchDueNow, isTrainerChatByNote, parseTrainerGroupIds, parseTrainerGroups } from "../shared/trainerDigest";
import { today, useStickyState } from "../shared/utils";

export default function TrainersNotificationsTab({
  groups = [],
  trainers = [],
  trainerGroups = [],
  students = [],
  studentGrps = [],
  subs = [],
  attn = [],
  cancelled = [],
}) {
  const DEBUG_TRAINER_MESSAGE = false;
  const [dialogs, setDialogs] = useState([]);
  const [metaByChat, setMetaByChat] = useState({});
  const [selectedChatId, setSelectedChatId] = useStickyState("", "ds_trainer_notify_selected_chat_v1");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [draftByChat, setDraftByChat] = useState({});
  const [lastActions, setLastActions] = useState([]);
  const [sendingNow, setSendingNow] = useState(false);
  const [selectedGroupIdByChat, setSelectedGroupIdByChat] = useStickyState({}, "ds_trainer_notify_selected_group_by_chat_v1");
  const [savingDraft, setSavingDraft] = useState(false);
  const [stateByChatGroup, setStateByChatGroup] = useState({});
  const [historyByChat, setHistoryByChat] = useState({});
  const [readiness, setReadiness] = useState({ ready: null, adminConfigured: false, details: "", scheduler: { active: false, reason: "unknown" } });
  const [testResult, setTestResult] = useState("");
  const [scheduleDraftByGroup, setScheduleDraftByGroup] = useState({});
  const generatedTextByChatGroupRef = useRef({});
  const [scheduleRules, setScheduleRules] = useState([]);
  const [scheduleRulesLoading, setScheduleRulesLoading] = useState(false);
  const [scheduleRulesError, setScheduleRulesError] = useState("");
  const [scheduleRuleSaving, setScheduleRuleSaving] = useState(false);
  const [scheduleRuleFormError, setScheduleRuleFormError] = useState("");
  const [scheduleRuleFormSuccess, setScheduleRuleFormSuccess] = useState("");
  const [previewRuleId, setPreviewRuleId] = useState(null);
  const [legacyManualExpanded, setLegacyManualExpanded] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const emptyScheduleRuleDraft = {
    name: "",
    groupId: "",
    trainerId: "",
    channel: "push",
    daysOfWeek: [],
    sendTime: "09:00",
    enabled: true,
    includeTrial: true,
    includePaymentIssues: true,
    includeAttendanceReminder: true,
    timezone: "Europe/Kyiv",
  };
  const [scheduleRuleDraft, setScheduleRuleDraft] = useState(emptyScheduleRuleDraft);

  const membershipByStudent = useMemo(
    () =>
      studentGrps.reduce((acc, row) => {
        if (!row?.studentId || !row?.groupId) return acc;
        if (!acc[row.studentId]) acc[row.studentId] = [];
        acc[row.studentId].push(row.groupId);
        return acc;
      }, {}),
    [studentGrps]
  );

  const subsByStudent = useMemo(
    () =>
      subs.reduce((acc, s) => {
        if (!s?.studentId) return acc;
        if (!acc[s.studentId]) acc[s.studentId] = [];
        acc[s.studentId].push(s);
        return acc;
      }, {}),
    [subs]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/telegram?op=listDialogs");
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.details || payload?.error || "Failed to load dialogs");
        const loaded = payload.dialogs || [];
        if (cancelled) return;
        setDialogs(loaded);

        const metaRows = await Promise.all(
          loaded.map(async (dlg) => {
            try {
              const metaRes = await fetch(`/api/telegram?op=chatMeta&chatId=${encodeURIComponent(dlg.id)}`);
              const metaPayload = await metaRes.json();
              if (!metaRes.ok) return [dlg.id, null];
              return [dlg.id, metaPayload.meta || null];
            } catch {
              return [dlg.id, null];
            }
          })
        );
        if (!cancelled) setMetaByChat(Object.fromEntries(metaRows));
        try {
          const rRes = await fetch("/api/trainer-notifications?op=readiness");
          const rPayload = await rRes.json();
          if (!cancelled) {
            setReadiness({
              ready: !!rPayload?.ready,
              adminConfigured: !!rPayload?.adminConfigured,
              details: rPayload?.ready ? "Сховище готове" : "Сховище не готове",
              scheduler: rPayload?.scheduler || { active: false, reason: "unknown" },
            });
          }
        } catch {
          if (!cancelled) setReadiness({ ready: false, adminConfigured: false, details: "Перевірка readiness не вдалася", scheduler: { active: false, reason: "readiness_failed" } });
        }

        const stateRows = await Promise.all(
          loaded.map(async (dlg) => {
            try {
              const stateRes = await fetch(`/api/trainer-notifications?op=state&chatId=${encodeURIComponent(dlg.id)}`);
              const statePayload = await stateRes.json();
              if (!stateRes.ok) return [dlg.id, {}];
              const byGroup = (statePayload.rows || []).reduce((acc, row) => {
                acc[String(row.group_id)] = row;
                return acc;
              }, {});
              return [dlg.id, byGroup];
            } catch {
              return [dlg.id, {}];
            }
          })
        );
        if (!cancelled) setStateByChatGroup(Object.fromEntries(stateRows));

        const historyRows = await Promise.all(
          loaded.map(async (dlg) => {
            try {
              const hRes = await fetch(`/api/trainer-notifications?op=history&chatId=${encodeURIComponent(dlg.id)}&limit=50`);
              const hPayload = await hRes.json();
              if (!hRes.ok) return [dlg.id, []];
              return [dlg.id, hPayload.rows || []];
            } catch {
              return [dlg.id, []];
            }
          })
        );
        if (!cancelled) setHistoryByChat(Object.fromEntries(historyRows));
      } catch {
        if (!cancelled) {
          setDialogs([]);
          setMetaByChat({});
          setStateByChatGroup({});
          setHistoryByChat({});
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const trainerDialogs = useMemo(() => {
    return dialogs
      .map((d) => ({
        ...d,
        note: String(metaByChat[d.id]?.internal_note || ""),
      }))
      .filter((d) => isTrainerChatByNote(d.note));
  }, [dialogs, metaByChat]);

  const selectedDialog = useMemo(() => trainerDialogs.find((d) => d.id === selectedChatId) || trainerDialogs[0] || null, [trainerDialogs, selectedChatId]);

  const normalizeTelegram = (value = "") => String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();

  const getTrainerDisplayName = (trainer) => (
    [trainer?.firstName || "", trainer?.lastName || ""].filter(Boolean).join(" ").trim()
    || trainer?.name
    || ""
  );

  const resolveDialogTrainerIds = (dialog) => {
    if (!dialog) return [];
    const note = String(dialog.note || "");
    const trainerGroupIds = parseTrainerGroupIds(note);
    const trainerGroupNames = parseTrainerGroups(note).map((x) => x.toLowerCase());
    const noteGroupIds = trainerGroupIds.length
      ? trainerGroupIds.map(String)
      : groups
        .filter((g) => trainerGroupNames.includes(String(g.name || "").toLowerCase()))
        .map((g) => String(g.id));
    const trainerIdsFromGroups = trainerGroups
      .filter((tg) => noteGroupIds.includes(String(tg.groupId)))
      .map((tg) => String(tg.trainerId || ""))
      .filter(Boolean);

    if (trainerIdsFromGroups.length) return Array.from(new Set(trainerIdsFromGroups));

    const dialogUsername = normalizeTelegram(dialog.username);
    const dialogTitle = String(dialog.title || "").trim().toLowerCase();
    const matchedTrainer = trainers.find((trainer) => {
      const trainerTelegram = normalizeTelegram(trainer.telegram);
      const trainerName = getTrainerDisplayName(trainer).trim().toLowerCase();
      return (trainerTelegram && trainerTelegram === dialogUsername) || (trainerName && trainerName === dialogTitle);
    });
    return matchedTrainer?.id ? [String(matchedTrainer.id)] : [];
  };

  const digest = useMemo(() => {
    if (!selectedDialog) return { text: "", groupNames: [], groupsData: [], selectedGroupData: null, persistedHistory: [] };
    const trainerGroupIds = parseTrainerGroupIds(selectedDialog.note || "");
    const trainerGroupNames = parseTrainerGroups(selectedDialog.note || "").map((x) => x.toLowerCase());
    const trainerIds = resolveDialogTrainerIds(selectedDialog);
    const assignedGroupIds = trainerGroups
      .filter((tg) => trainerIds.includes(String(tg.trainerId)))
      .map((tg) => String(tg.groupId));
    const selectedGroupIds = new Set([
      ...trainerGroupIds.map(String),
      ...groups
        .filter((g) => trainerGroupNames.includes(String(g.name || "").toLowerCase()))
        .map((g) => String(g.id)),
      ...assignedGroupIds,
    ]);
    const parsedGroups = groups.filter((g) => selectedGroupIds.has(String(g.id)));
    const stateMap = stateByChatGroup[selectedDialog.id] || {};
    const persistedHistory = historyByChat[selectedDialog.id] || [];

    const groupsData = parsedGroups.map((g) => {
      const row = stateMap[String(g.id)] || {};
      const plan = buildGroupDispatchPlan({ group: g, cancelled, now: new Date(), sendTimeOverride: row.send_time_override || null });
      const generated = buildTrainerGroupDraft({
        group: g,
        students,
        membershipByStudent,
        subsByStudent,
        attn,
        targetTrainingDate: plan?.trainingDate || today(),
      });
      const manualDraft = row.custom_template || "";
      const draftKey = `${selectedDialog.id}:${g.id}`;
      const localDraft = draftByChat[draftKey];
      const previousGeneratedText = generatedTextByChatGroupRef.current[draftKey];
      const isStaleAutogeneratedDraft = localDraft !== undefined
        && previousGeneratedText !== undefined
        && String(localDraft || "") === String(previousGeneratedText || "")
        && String(localDraft || "") !== String(generated.text || "");
      const activeText = isStaleAutogeneratedDraft
        ? (generated.text || "")
        : ((localDraft ?? (manualDraft || generated.text)) || "");
      return {
        groupId: String(g.id),
        groupName: g.name,
        plan,
        generatedText: generated.text,
        generatedStudentsCount: generated.studentsCount || 0,
        enabled: row.auto_send_enabled !== false,
        persistedDraft: manualDraft,
        sendTimeOverride: row.send_time_override || null,
        activeText,
      };
    });

    const selectedGroupId = selectedGroupIdByChat[selectedDialog.id] || groupsData[0]?.groupId || "";
    const selectedGroupData = groupsData.find((g) => g.groupId === selectedGroupId) || groupsData[0] || null;

    return {
      groupNames: parsedGroups.map((g) => g.name),
      groupsData,
      selectedGroupData,
      persistedHistory,
    };
  }, [selectedDialog, groups, trainers, trainerGroups, students, membershipByStudent, subsByStudent, attn, refreshVersion, cancelled, draftByChat, selectedGroupIdByChat, stateByChatGroup, historyByChat]);

  useEffect(() => {
    if (!selectedDialog?.id) return;
    const nextGeneratedByKey = {};
    (digest.groupsData || []).forEach((g) => {
      nextGeneratedByKey[`${selectedDialog.id}:${g.groupId}`] = g.generatedText || "";
    });

    setDraftByChat((prev) => {
      let next = prev;
      Object.entries(nextGeneratedByKey).forEach(([key, generatedText]) => {
        const previousGeneratedText = generatedTextByChatGroupRef.current[key];
        const draft = prev[key];
        const isStaleAutogeneratedDraft = draft !== undefined
          && previousGeneratedText !== undefined
          && String(draft || "") === String(previousGeneratedText || "")
          && String(draft || "") !== String(generatedText || "");
        if (!isStaleAutogeneratedDraft) return;
        if (next === prev) next = { ...prev };
        delete next[key];
      });
      generatedTextByChatGroupRef.current = {
        ...generatedTextByChatGroupRef.current,
        ...nextGeneratedByKey,
      };
      return next;
    });
  }, [digest.groupsData, selectedDialog?.id]);

  const activeDraft = digest.selectedGroupData?.activeText || "";
  const activeGroupId = digest.selectedGroupData?.groupId || "";
  const isDraftDirty = String(activeDraft || "") !== String(digest.selectedGroupData?.generatedText || "");
  const selectedScheduleKey = `${selectedDialog?.id || ""}:${activeGroupId || ""}`;

  const resolveMode = (rawOverride) => {
    const value = String(rawOverride || "");
    if (/^\d{2}:\d{2}$/.test(value)) return "custom_time";
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return "custom_datetime";
    return "default";
  };

  const persistedOverrideValue = digest.selectedGroupData?.sendTimeOverride || null;
  const persistedSendMode = resolveMode(persistedOverrideValue);
  const scheduleDraft = scheduleDraftByGroup[selectedScheduleKey] || {
    mode: persistedSendMode,
    timeValue: persistedSendMode === "custom_time" ? String(persistedOverrideValue || "") : "",
    datetimeValue: persistedSendMode === "custom_datetime" ? String(persistedOverrideValue || "") : "",
    dirty: false,
  };
  const effectiveDraftMode = scheduleDraft.mode || "default";

  useEffect(() => {
    if (!selectedScheduleKey) return;
    const mode = resolveMode(digest.selectedGroupData?.sendTimeOverride || "");
    const override = String(digest.selectedGroupData?.sendTimeOverride || "");
    setScheduleDraftByGroup((prev) => {
      const existing = prev[selectedScheduleKey];
      if (existing?.dirty) return prev;
      return {
        ...prev,
        [selectedScheduleKey]: {
          mode,
          timeValue: mode === "custom_time" ? override : "",
          datetimeValue: mode === "custom_datetime" ? override : "",
          dirty: false,
        },
      };
    });
  }, [selectedScheduleKey, digest.selectedGroupData?.sendTimeOverride]);

  const updateDraft = (next) => {
    if (!selectedDialog?.id || !activeGroupId) return;
    setDraftByChat((prev) => ({ ...prev, [`${selectedDialog.id}:${activeGroupId}`]: next }));
  };

  const upsertGroupState = async (groupId, patch) => {
    if (!selectedDialog?.id || !groupId) return null;
    const res = await fetch("/api/trainer-notifications?op=state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: selectedDialog.id, groupId, ...patch }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.details || payload?.error || "state save failed");
    setStateByChatGroup((prev) => ({
      ...prev,
      [selectedDialog.id]: {
        ...(prev[selectedDialog.id] || {}),
        [String(groupId)]: payload.row,
      },
    }));
    return payload.row;
  };

  const appendHistory = async (entry) => {
    const res = await fetch("/api/trainer-notifications?op=history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.details || payload?.error || "history save failed");
    setHistoryByChat((prev) => ({
      ...prev,
      [entry.chatId]: [payload.row, ...(prev[entry.chatId] || [])].slice(0, 100),
    }));
    return payload.row;
  };

  const saveManualDraft = async (groupId, value) => {
    if (!selectedDialog?.id || !groupId) return;
    setSavingDraft(true);
    try {
      await upsertGroupState(groupId, { customTemplate: value });
    } catch (error) {
      if (String(error?.message || "").includes("storage_not_ready")) {
        alert("Сховище не готове. Застосуйте SQL: trainer_notification_state.sql та trainer_dispatch_history.sql");
      }
      alert(`Не вдалося зберегти чернетку: ${String(error?.message || error)}`);
    } finally {
      setSavingDraft(false);
    }
  };

  const buildFreshTrainerAttendanceMessage = ({ groupId }) => {
    const g = groups.find((x) => String(x.id) === String(groupId));
    if (!g) return { text: "", studentsCount: 0 };
    const stateMap = (selectedDialog && stateByChatGroup[selectedDialog.id]) || {};
    const row = stateMap[String(g.id)] || {};
    const plan = buildGroupDispatchPlan({ group: g, cancelled, now: new Date(), sendTimeOverride: row.send_time_override || null });
    const generated = buildTrainerGroupDraft({
      group: g,
      students,
      membershipByStudent,
      subsByStudent,
      attn,
      targetTrainingDate: plan?.trainingDate || today(),
    });
    if (DEBUG_TRAINER_MESSAGE) console.log("[trainer-message:fresh]", { groupId, studentsCount: generated.studentsCount, preview: String(generated.text || "").slice(0, 120) });
    return { text: generated.text || "", studentsCount: generated.studentsCount || 0 };
  };

  const regenerateFromTemplate = () => {
    if (!selectedDialog?.id || !activeGroupId || !digest.selectedGroupData) return;
    if (!window.confirm("Перезаписати ручну чернетку автогенерованим шаблоном для цієї групи?")) return;
    const regenerated = buildFreshTrainerAttendanceMessage({ groupId: activeGroupId }).text || "";
    setDraftByChat((prev) => ({ ...prev, [`${selectedDialog.id}:${activeGroupId}`]: regenerated }));
    saveManualDraft(activeGroupId, regenerated);
    setRefreshVersion((v) => v + 1);
  };

  const copyToClipboard = async () => {
    const freshText = buildFreshTrainerAttendanceMessage({ groupId: activeGroupId }).text || activeDraft || "";
    if (!freshText) return;
    try {
      await navigator.clipboard.writeText(freshText);
      alert("Скопійовано");
    } catch {
      alert("Не вдалося скопіювати");
    }
  };

  const sendNow = async ({ dryRun = false } = {}) => {
    if (!selectedDialog?.id || !activeGroupId || !digest.selectedGroupData) return;
    const fresh = buildFreshTrainerAttendanceMessage({ groupId: activeGroupId });
    const text = fresh.text || "";
    if (!text) return;
    const nowIso = new Date().toISOString();

    if (dryRun) {
      setLastActions((prev) => [
        {
          id: `dry_${Date.now()}`,
          status: "dry-run",
          chatTitle: `${selectedDialog.title || selectedDialog.id} / ${digest.selectedGroupData.groupName}`,
          time: nowIso,
          students: fresh.studentsCount || 0,
        },
        ...prev,
      ].slice(0, 20));
      return;
    }

    setSendingNow(true);
    try {
      const res = await fetch("/api/telegram?op=sendTrainerDigest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: selectedDialog.id,
          message: text,
          chatTitle: selectedDialog.title || selectedDialog.id,
          groupId: digest.selectedGroupData.groupId,
          groupNames: [digest.selectedGroupData.groupName],
          studentsCount: fresh.studentsCount || 0,
          triggerType: "manual",
        }),
      });
      const payload = await res.json().catch(() => ({}));
      const ok = res.ok;
      const historyEntry = {
        id: `manual_${Date.now()}`,
        triggerType: "manual",
        status: ok ? "sent" : "failed",
        chatId: selectedDialog.id,
        chatTitle: selectedDialog.title || selectedDialog.id,
        groupId: digest.selectedGroupData.groupId,
        groupName: digest.selectedGroupData.groupName,
        timestamp: nowIso,
        studentsCount: fresh.studentsCount || 0,
        details: ok ? `admin-log:${payload?.adminLogStatus || "skipped"}` : (payload?.details || payload?.error || "send failed"),
      };
      await appendHistory(historyEntry);
      setLastActions((prev) => [
        {
          id: `send_${Date.now()}`,
          status: ok ? "sent" : "failed",
          chatTitle: `${selectedDialog.title || selectedDialog.id} / ${digest.selectedGroupData.groupName}`,
          time: nowIso,
          students: fresh.studentsCount || 0,
          details: ok
            ? `admin-log: ${payload?.adminLogStatus || "skipped"}`
            : (payload?.details || payload?.error || "send failed"),
        },
        ...prev,
      ].slice(0, 20));
      if (!ok) alert(payload?.details || payload?.error || "Не вдалося надіслати");
    } finally {
      setSendingNow(false);
    }
  };

  const saveAutoSendToggle = async (groupId, nextEnabled) => {
    if (!selectedDialog?.id) return;
    try {
      await upsertGroupState(groupId, { autoSendEnabled: !!nextEnabled });
    } catch (error) {
      if (String(error?.message || "").includes("storage_not_ready")) {
        alert("Сховище не готове. Застосуйте SQL migration для trainer_notification_state / trainer_dispatch_history.");
      }
      alert(`Не вдалося зберегти toggle: ${String(error?.message || error)}`);
    }
  };

  const todaySends = useMemo(() => {
    const todayStr = today();
    const history = digest.persistedHistory || [];
    return (digest.groupsData || []).map((g) => {
      if (!g.enabled) return { groupId: g.groupId, groupName: g.groupName, status: "disabled", sendAt: g.plan?.sendAtIso || "", sendAtLocal: g.plan?.sendAtLocal || "", trainingDate: g.plan?.trainingDate || "" };
      if (!g.plan) return { groupId: g.groupId, groupName: g.groupName, status: "cancelled", sendAt: "", trainingDate: "" };
      const expectedDedupKey = `${selectedDialog?.id || ""}::${g.groupId}::${g.plan.trainingDate}T${g.plan.trainingTime}`;
      const groupHistory = history.filter((h) => String(h.groupId) === String(g.groupId));
      const hist = groupHistory.find((h) => String(h.dedupKey || "") === expectedDedupKey)
        || groupHistory.find((h) => String(h.triggerType || "") === "auto" && String(h.timestamp || "").slice(0, 10) === todayStr);
      if (hist?.status === "sent") return { groupId: g.groupId, groupName: g.groupName, status: "sent", sendAt: g.plan.sendAtIso, sendAtLocal: g.plan.sendAtLocal || "", trainingDate: g.plan.trainingDate, details: hist.details || "" };
      if (hist?.status === "failed" || hist?.status === "skipped") return { groupId: g.groupId, groupName: g.groupName, status: hist.status, sendAt: g.plan.sendAtIso, sendAtLocal: g.plan.sendAtLocal || "", trainingDate: g.plan.trainingDate, details: hist.reason || hist.details || "" };
      if (String(g.plan.trainingDate || "").slice(0, 10) !== todayStr) {
        return { groupId: g.groupId, groupName: g.groupName, status: "not_today", sendAt: g.plan.sendAtIso, sendAtLocal: g.plan.sendAtLocal || "", trainingDate: g.plan.trainingDate };
      }
      return {
        groupId: g.groupId,
        groupName: g.groupName,
        status: isDispatchDueNow(g.plan, new Date(), 15) ? "due" : "scheduled",
        sendAt: g.plan.sendAtIso,
        sendAtLocal: g.plan.sendAtLocal || "",
        trainingDate: g.plan.trainingDate,
      };
    });
  }, [digest.groupsData, digest.persistedHistory, selectedDialog?.id]);

  const testToAdmin = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!selectedDialog?.id || !activeGroupId || !digest.selectedGroupData) return;
    const fresh = buildFreshTrainerAttendanceMessage({ groupId: activeGroupId });
    const text = fresh.text || "";
    if (!text) return;
    const nowIso = new Date().toISOString();
    setSendingNow(true);
    try {
      const res = await fetch("/api/telegram?op=sendTrainerDigest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: selectedDialog.id,
          message: text,
          chatTitle: selectedDialog.title || selectedDialog.id,
          groupId: digest.selectedGroupData.groupId,
          groupNames: [digest.selectedGroupData.groupName],
          studentsCount: fresh.studentsCount || 0,
          triggerType: "test",
          sendToAdminOnly: true,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      const ok = res.ok;
      const historyEntry = {
        id: `test_${Date.now()}`,
        triggerType: "test",
        status: ok ? "sent" : "failed",
        chatId: selectedDialog.id,
        chatTitle: selectedDialog.title || selectedDialog.id,
        groupId: digest.selectedGroupData.groupId,
        groupName: digest.selectedGroupData.groupName,
        timestamp: nowIso,
        studentsCount: fresh.studentsCount || 0,
        details: ok ? `admin-log:${payload?.adminLogStatus || "skipped"}` : (payload?.details || payload?.error || "test failed"),
      };
      await appendHistory(historyEntry);
      setLastActions((prev) => [historyEntry, ...prev].slice(0, 20));
      setTestResult(ok ? `Тест надіслано (admin-log: ${payload?.adminLogStatus || "skipped"})` : `Тест не вдався: ${payload?.details || payload?.error || "невідома помилка"}`);
      if (!ok) alert(payload?.details || payload?.error || "Не вдалося надіслати тест");
    } finally {
      setSendingNow(false);
    }
  };

  const selectedPlan = digest.selectedGroupData?.plan || null;
  const selectedChatTitle = selectedDialog?.title || selectedDialog?.id || "—";
  const selectedGroupName = digest.selectedGroupData?.groupName || "—";
  const nextSendLabel = selectedPlan?.sendAtLocal || "—";
  const trainingLabel = selectedPlan?.trainingAtLocal || (selectedPlan ? `${selectedPlan.trainingDate} ${selectedPlan.trainingTime}` : "—");
  const schedulerStatusLabel = readiness?.scheduler?.active
    ? "автовідправка активна"
    : readiness?.ready
      ? "розклад готовий, тригер відсутній"
      : "планувальник не налаштований";

  const statusChip = (ok) => ({
    background: ok ? `${theme.success}20` : `${theme.warning}20`,
    color: ok ? theme.success : theme.warning,
    border: `1px solid ${ok ? `${theme.success}55` : `${theme.warning}55`}`,
  });

  const sendStatusStyle = (status) => {
    if (status === "sent") return { color: theme.success, border: `${theme.success}44`, bg: `${theme.success}18` };
    if (status === "failed" || status === "skipped" || status === "cancelled") return { color: theme.danger, border: `${theme.danger}44`, bg: `${theme.danger}18` };
    if (status === "due") return { color: theme.warning, border: `${theme.warning}44`, bg: `${theme.warning}18` };
    return { color: theme.textMuted, border: theme.border, bg: theme.input };
  };
  const sendStatusLabel = (status) => ({
    sent: "надіслано",
    failed: "помилка",
    skipped: "пропущено",
    cancelled: "скасовано",
    due: "час надсилати",
    scheduled: "заплановано",
    disabled: "вимкнено",
    not_today: "не сьогодні",
    "dry-run": "перевірка",
  }[String(status || "").toLowerCase()] || String(status || "—"));
  const modeLabel = (mode) => ({
    default: "типовий (−60 хв)",
    custom_time: "кастомний час",
    custom_datetime: "кастомні дата й час",
  }[mode] || "типовий (−60 хв)");

  const updateScheduleDraft = (patch) => {
    if (!selectedScheduleKey) return;
    setScheduleDraftByGroup((prev) => {
      const base = prev[selectedScheduleKey] || {
        mode: persistedSendMode,
        timeValue: persistedSendMode === "custom_time" ? String(persistedOverrideValue || "") : "",
        datetimeValue: persistedSendMode === "custom_datetime" ? String(persistedOverrideValue || "") : "",
        dirty: false,
      };
      return {
        ...prev,
        [selectedScheduleKey]: {
          ...base,
          ...patch,
          dirty: true,
        },
      };
    });
  };

  const applySendOverride = async () => {
    if (!activeGroupId) return;
    if (effectiveDraftMode === "default") {
      await upsertGroupState(activeGroupId, { sendTimeOverride: null });
      setScheduleDraftByGroup((prev) => ({
        ...prev,
        [selectedScheduleKey]: { mode: "default", timeValue: "", datetimeValue: "", dirty: false },
      }));
      return;
    }
    if (effectiveDraftMode === "custom_time") {
      await upsertGroupState(activeGroupId, { sendTimeOverride: scheduleDraft.timeValue || null });
      setScheduleDraftByGroup((prev) => ({
        ...prev,
        [selectedScheduleKey]: { ...scheduleDraft, dirty: false },
      }));
      return;
    }
    if (effectiveDraftMode === "custom_datetime") {
      await upsertGroupState(activeGroupId, { sendTimeOverride: scheduleDraft.datetimeValue || null });
      setScheduleDraftByGroup((prev) => ({
        ...prev,
        [selectedScheduleKey]: { ...scheduleDraft, dirty: false },
      }));
    }
  };

  const scheduleDayOptions = [
    { value: 1, label: "Пн" }, { value: 2, label: "Вт" }, { value: 3, label: "Ср" }, { value: 4, label: "Чт" },
    { value: 5, label: "Пт" }, { value: 6, label: "Сб" }, { value: 7, label: "Нд" },
  ];
  const resetScheduleRuleDraft = () => {
    setEditingRuleId(null);
    setScheduleRuleDraft({ ...emptyScheduleRuleDraft });
    setScheduleRuleFormError("");
    setScheduleRuleFormSuccess("");
  };
  const loadScheduleRules = async () => {
    setScheduleRulesLoading(true);
    setScheduleRulesError("");
    try {
      const res = await fetch("/api/trainer-notifications?op=schedule-rules");
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.details || payload?.error || "Не вдалося завантажити правила");
      setScheduleRules(payload?.rows || payload?.rules || []);
    } catch (error) {
      setScheduleRulesError(String(error?.message || error));
      setScheduleRules([]);
    } finally {
      setScheduleRulesLoading(false);
    }
  };
  useEffect(() => { loadScheduleRules(); }, []);
  const mapRuleToDraft = (rule) => ({
    name: String(rule?.name || ""),
    groupId: String(rule?.group_id || ""),
    trainerId: String(rule?.trainer_id || ""),
    channel: String(rule?.channel || "push"),
    daysOfWeek: Array.isArray(rule?.days_of_week) ? rule.days_of_week.map(Number) : [],
    sendTime: String(rule?.send_time_local || "09:00"),
    enabled: rule?.enabled !== false,
    includeTrial: rule?.include_trial_bookings !== false,
    includePaymentIssues: rule?.include_unpaid_students !== false,
    includeAttendanceReminder: rule?.include_attendance_reminder !== false,
    timezone: String(rule?.timezone || "Europe/Kyiv"),
  });
  const saveScheduleRule = async (event) => {
    event?.preventDefault?.();
    const selectedGroup = groups.find((g) => String(g.id) === String(scheduleRuleDraft.groupId));
    const resolvedTrainerId = String(scheduleRuleDraft.trainerId || selectedGroup?.trainer_id || selectedGroup?.trainerId || "").trim();
    if (!scheduleRuleDraft.name.trim()) {
      setScheduleRuleFormError("Вкажіть назву правила");
      setScheduleRuleFormSuccess("");
      return;
    }
    if (!scheduleRuleDraft.groupId) {
      setScheduleRuleFormError("Оберіть групу");
      setScheduleRuleFormSuccess("");
      return;
    }
    if (!resolvedTrainerId) {
      setScheduleRuleFormError("У цієї групи не вказаний trainer_id");
      setScheduleRuleFormSuccess("");
      return;
    }
    if (!scheduleRuleDraft.sendTime) {
      setScheduleRuleFormError("Вкажіть час відправки");
      setScheduleRuleFormSuccess("");
      return;
    }
    if (!Array.isArray(scheduleRuleDraft.daysOfWeek) || !scheduleRuleDraft.daysOfWeek.length) {
      setScheduleRuleFormError("Оберіть хоча б один день");
      setScheduleRuleFormSuccess("");
      return;
    }
    setScheduleRuleFormError("");
    setScheduleRuleFormSuccess("");
    setScheduleRuleSaving(true);
    try {
      const payload = {
        name: scheduleRuleDraft.name.trim(),
        group_id: scheduleRuleDraft.groupId,
        trainer_id: resolvedTrainerId,
        channel: scheduleRuleDraft.channel,
        enabled: !!scheduleRuleDraft.enabled,
        timezone: scheduleRuleDraft.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        days_of_week: scheduleRuleDraft.daysOfWeek,
        send_time_local: scheduleRuleDraft.sendTime,
        include_trial_bookings: !!scheduleRuleDraft.includeTrial,
        include_unpaid_students: !!scheduleRuleDraft.includePaymentIssues,
        include_attendance_reminder: !!scheduleRuleDraft.includeAttendanceReminder,
      };
      const res = await fetch("/api/trainer-notifications?op=schedule-rules", {
        method: editingRuleId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingRuleId ? { id: editingRuleId, ...payload } : payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.details || body?.error || "Не вдалося зберегти правило");
      await loadScheduleRules();
      resetScheduleRuleDraft();
      setScheduleRuleFormSuccess("Збережено");
    } catch (error) {
      setScheduleRuleFormError(String(error?.message || error));
      setScheduleRuleFormSuccess("");
    } finally {
      setScheduleRuleSaving(false);
    }
  };
  const toggleScheduleRule = async (rule) => {
    const res = await fetch("/api/trainer-notifications?op=schedule-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, enabled: !(rule.enabled !== false) }),
    });
    if (res.ok) await loadScheduleRules();
  };
  const weekdayLabelByValue = { 1: "Пн", 2: "Вт", 3: "Ср", 4: "Чт", 5: "Пт", 6: "Сб", 7: "Нд" };
  const channelLabel = (value) => ({ push: "Push", telegram: "Telegram", both: "Push + Telegram" }[String(value || "").toLowerCase()] || String(value || "Push"));
  const includeItemsFromRule = (rule) => ([
    rule?.include_trial_bookings !== false ? "будуть перевірені пробні" : null,
    rule?.include_unpaid_students !== false ? "будуть перевірені оплати" : null,
    rule?.include_attendance_reminder !== false ? "буде перевірено відвідування" : null,
  ].filter(Boolean));
  const badgeBase = {
    fontSize: 12,
    borderRadius: 999,
    padding: "4px 10px",
    border: `1px solid ${theme.border}`,
    fontWeight: 700,
    lineHeight: 1.25,
  };
  const badgeTone = {
    statusEnabled: { color: "#9FF5C6", background: "#1F5D3A", border: "#2D7B4E" },
    statusDisabled: { color: "#FFD9A8", background: "#5A4632", border: "#7A6244" },
    group: { color: "#C9DBFF", background: "#263A63", border: "#355289" },
    recipient: { color: "#E0D2FF", background: "#3C315E", border: "#55457F" },
    channelPush: { color: "#CDE3FF", background: "#28466E", border: "#396194" },
    channelTelegram: { color: "#CDEFFF", background: "#24505E", border: "#337182" },
    channelBoth: { color: "#E2D3FF", background: "#4A376E", border: "#684C98" },
    time: { color: "#E5E7EB", background: "#2F3541", border: "#495063" },
    days: { color: "#D5DBE6", background: "#343B47", border: "#495163" },
    includeTrial: { color: "#BDF6E8", background: "#1E5B53", border: "#2C7F74" },
    includePayments: { color: "#FFE0B3", background: "#5E4830", border: "#836444" },
    includeAttendance: { color: "#CFE0FF", background: "#2B466F", border: "#3E6399" },
  };
  const previewRule = scheduleRules.find((r) => String(r.id) === String(previewRuleId)) || null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px minmax(0,1fr)", gap: 12 }}>
      <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 10, display: "grid", gap: 8, height: "fit-content" }}>
        <div style={{ fontWeight: 800, color: theme.textMain }}>Тренерські контакти</div>
        {!trainerDialogs.length && <div style={{ color: theme.textMuted, fontSize: 12 }}>Немає тренерських чатів.</div>}
        {trainerDialogs.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setSelectedChatId(d.id)}
            style={{
              textAlign: "left",
              border: `1px solid ${selectedDialog?.id === d.id ? theme.primary : theme.border}`,
              borderRadius: 10,
              background: selectedDialog?.id === d.id ? `${theme.primary}18` : theme.input,
              color: theme.textMain,
              padding: "8px 10px",
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 700 }}>{d.title || d.id}</div>
            <div style={{ fontSize: 11, color: theme.textMuted }}>{(d.username && `@${d.username}`) || d.id}</div>
          </button>
        ))}
      </div>

      <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 12, display: "grid", gap: 12 }}>
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input, padding: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 800, color: theme.textMain }}>Сповіщення / дайджест тренера</div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>Повʼязані групи: {digest.groupNames?.length ? digest.groupNames.join(", ") : "—"}</div>
            </div>
            <div style={{ fontSize: 11, color: theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "4px 8px", background: theme.card }}>Режим планера</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8, background: theme.card, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Тренер</div>
              <div style={{ fontSize: 13, color: theme.textMain, fontWeight: 700, marginTop: 2, overflowWrap: "anywhere" }}>{selectedChatTitle}</div>
            </div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8, background: theme.card, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Група</div>
              <div style={{ fontSize: 13, color: theme.textMain, fontWeight: 700, marginTop: 2, overflowWrap: "anywhere" }}>{selectedGroupName}</div>
            </div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8, background: theme.card, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Наступна відправка</div>
              <div style={{ fontSize: 13, color: theme.textMain, fontWeight: 700, marginTop: 2, overflowWrap: "anywhere" }}>{nextSendLabel}</div>
            </div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8, background: theme.card, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Адмін лог</div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, display: "inline-flex", borderRadius: 999, padding: "2px 8px", ...statusChip(readiness.adminConfigured) }}>
                {readiness.adminConfigured ? "готово" : "відсутнє"}
              </div>
            </div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8, background: theme.card, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Сховище</div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, display: "inline-flex", borderRadius: 999, padding: "2px 8px", ...statusChip(readiness.ready) }}>
                {readiness.ready ? "готово" : "відсутнє"}
              </div>
            </div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8, background: theme.card, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Планувальник</div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, display: "inline-flex", borderRadius: 999, padding: "2px 8px", ...statusChip(!!readiness?.scheduler?.active) }}>
                {schedulerStatusLabel}
              </div>
            </div>
          </div>
        </div>

        {!!testResult && <div style={{ fontSize: 12, color: theme.textMuted }}>{testResult}</div>}
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input, padding: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}><div style={{ fontWeight: 700, color: theme.textMain }}>Правила schedule notifications</div><button type="button" onClick={loadScheduleRules} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.card, color: theme.textMain, padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Оновити</button></div>
          <div style={{ fontSize: 12, color: theme.textMuted, border: `1px dashed ${theme.border}`, borderRadius: 10, padding: "8px 10px", background: theme.card }}>
            Текст повідомлення не зберігається вручну. Він має генеруватись автоматично перед відправкою з актуальних даних групи.
          </div>
          <form onSubmit={saveScheduleRule} style={{ display: "grid", gap: 8 }}>
            <input value={scheduleRuleDraft.name} onChange={(e) => setScheduleRuleDraft((p) => ({ ...p, name: e.target.value }))} placeholder="назва" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
              <select value={scheduleRuleDraft.groupId} onChange={(e) => setScheduleRuleDraft((p) => {
                const groupId = e.target.value;
                const selectedGroup = groups.find((g) => String(g.id) === String(groupId));
                return { ...p, groupId, trainerId: String(selectedGroup?.trainer_id || selectedGroup?.trainerId || "") };
              })}><option value="">група</option>{groups.map((g) => <option key={g.id} value={String(g.id)}>{g.name}</option>)}</select>
              <div style={{ fontSize: 12, color: theme.textMuted, display: "flex", alignItems: "center", padding: "0 4px" }}>
                {String(scheduleRuleDraft.trainerId || "").trim() ? "Отримувач: тренер цієї групи" : "У цієї групи не вказаний trainer_id"}
              </div>
              <select value={scheduleRuleDraft.channel} onChange={(e) => setScheduleRuleDraft((p) => ({ ...p, channel: e.target.value }))}><option value="push">push</option><option value="telegram">telegram</option><option value="both">both</option></select>
            </div>
            <div>{scheduleDayOptions.map((d) => <label key={d.value}><input type="checkbox" checked={scheduleRuleDraft.daysOfWeek.includes(d.value)} onChange={(e) => setScheduleRuleDraft((p) => ({ ...p, daysOfWeek: e.target.checked ? [...p.daysOfWeek, d.value] : p.daysOfWeek.filter((x) => x !== d.value) }))} />{d.label} </label>)}</div>
            <div><input type="time" value={scheduleRuleDraft.sendTime} onChange={(e) => setScheduleRuleDraft((p) => ({ ...p, sendTime: e.target.value }))} />
              <label><input type="checkbox" checked={scheduleRuleDraft.enabled} onChange={(e) => setScheduleRuleDraft((p) => ({ ...p, enabled: e.target.checked }))} />увімкнено</label>
              <label><input type="checkbox" checked={scheduleRuleDraft.includeTrial} onChange={(e) => setScheduleRuleDraft((p) => ({ ...p, includeTrial: e.target.checked }))} />пробні</label>
              <label><input type="checkbox" checked={scheduleRuleDraft.includePaymentIssues} onChange={(e) => setScheduleRuleDraft((p) => ({ ...p, includePaymentIssues: e.target.checked }))} />оплати</label>
              <label><input type="checkbox" checked={scheduleRuleDraft.includeAttendanceReminder} onChange={(e) => setScheduleRuleDraft((p) => ({ ...p, includeAttendanceReminder: e.target.checked }))} />нагадати відмітити</label>
            </div>
            {!!scheduleRuleFormError && <div style={{ fontSize: 12, color: theme.danger }}>{scheduleRuleFormError}</div>}
            {!!scheduleRuleFormSuccess && <div style={{ fontSize: 12, color: theme.success }}>{scheduleRuleFormSuccess}</div>}
            <div><button type="submit" disabled={scheduleRuleSaving}>{editingRuleId ? "Оновити правило" : "Створити правило"}</button> <button type="button" onClick={resetScheduleRuleDraft}>Очистити</button></div>
          </form>
          {scheduleRulesLoading && <div style={{ fontSize: 12, color: theme.textMuted }}>Завантаження…</div>}
          {!!scheduleRulesError && <div style={{ fontSize: 12, color: theme.danger }}>{scheduleRulesError}</div>}
          <div style={{ display: "grid", gap: 8 }}>
            {scheduleRules.map((rule) => {
              const includeItems = includeItemsFromRule(rule);
              return (
                <div key={rule.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 12, padding: 10, background: theme.card, display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 800, color: theme.textMain }}>{rule.name || `Rule #${rule.id}`}</div>
                    <span style={{ ...badgeBase, ...((rule.enabled !== false) ? badgeTone.statusEnabled : badgeTone.statusDisabled) }}>
                      {rule.enabled !== false ? "увімкнено" : "вимкнено"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ ...badgeBase, ...badgeTone.group }}>Група: {rule.group_name || rule.group_id || "—"}</span>
                    <span style={{ ...badgeBase, ...badgeTone.recipient }}>Отримувач: {rule.trainer_name || rule.trainer_id || "—"}</span>
                    <span style={{ ...badgeBase, ...((String(rule.channel || "").toLowerCase() === "telegram") ? badgeTone.channelTelegram : (String(rule.channel || "").toLowerCase() === "both" ? badgeTone.channelBoth : badgeTone.channelPush)) }}>Канал: {channelLabel(rule.channel)}</span>
                    <span style={{ ...badgeBase, ...badgeTone.time }}>Час: {rule.send_time_local || "—"}</span>
                    <span style={{ ...badgeBase, ...badgeTone.days }}>Дні: {(rule.days_of_week || []).map((d) => weekdayLabelByValue[Number(d)] || d).join(", ") || "—"}</span>
                  </div>
                  <div style={{ fontSize: 12, color: theme.textMuted }}>
                    Це правило автоматично формує повідомлення перед відправкою для обраної групи у вказаний час.
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700 }}>Включає:</span>
                    {rule?.include_trial_bookings !== false && <span style={{ ...badgeBase, ...badgeTone.includeTrial }}>пробні</span>}
                    {rule?.include_unpaid_students !== false && <span style={{ ...badgeBase, ...badgeTone.includePayments }}>оплати</span>}
                    {rule?.include_attendance_reminder !== false && <span style={{ ...badgeBase, ...badgeTone.includeAttendance }}>відвідування</span>}
                    {!includeItems.length && <span style={{ ...badgeBase, ...badgeTone.days }}>нічого не включено</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => { setEditingRuleId(rule.id); setScheduleRuleDraft(mapRuleToDraft(rule)); }} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.input, color: theme.textMain, padding: "7px 12px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Редагувати</button>
                    <button type="button" onClick={() => toggleScheduleRule(rule)} style={{ border: "none", borderRadius: 10, background: rule.enabled !== false ? "#6E5337" : "#2C6A47", color: "#fff", padding: "7px 12px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>{rule.enabled !== false ? "Вимкнути" : "Увімкнути"}</button>
                    <button type="button" onClick={() => setPreviewRuleId(rule.id)} style={{ border: `1px solid #425A80`, borderRadius: 10, background: "#2B3E5B", color: "#D5E4FF", padding: "7px 12px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Попередній перегляд</button>
                  </div>
                </div>
              );
            })}
          </div>
          {!!previewRule && (
            <div style={{ border: `1px solid ${theme.primary}55`, borderRadius: 12, padding: 10, background: `${theme.primary}10`, display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 700, color: theme.textMain }}>Попередній перегляд: {previewRule.name || `Rule #${previewRule.id}`}</div>
              {includeItemsFromRule(previewRule).map((item) => <div key={item} style={{ fontSize: 12, color: theme.textMain }}>• {item}</div>)}
              {!includeItemsFromRule(previewRule).length && <div style={{ fontSize: 12, color: theme.textMuted }}>Немає активних прапорців для перевірки.</div>}
              <button type="button" onClick={() => setPreviewRuleId(null)} style={{ width: "fit-content", border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.card, color: theme.textMain, padding: "4px 8px", cursor: "pointer" }}>Закрити</button>
            </div>
          )}
        </div>
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input, padding: 10, display: "grid", gap: 8 }}>
          <button type="button" onClick={() => setLegacyManualExpanded((v) => !v)} style={{ border: "none", background: "transparent", color: theme.textMain, fontWeight: 800, textAlign: "left", cursor: "pointer", padding: 0 }}>
            {legacyManualExpanded ? "▾" : "▸"} Стара ручна система. Не оновлює дані автоматично.
          </button>
        </div>
        {legacyManualExpanded && (
          <>
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input, padding: 12, display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: theme.textMain }}>Крок 1: Обери групу</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ color: theme.textMuted, fontSize: 12 }}>Активна група</label>
              <select
                value={activeGroupId}
                onChange={(e) => setSelectedGroupIdByChat((prev) => ({ ...prev, [selectedDialog?.id || ""]: e.target.value }))}
                style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.card, color: theme.textMain, padding: "10px 12px", fontWeight: 700 }}
              >
                {(digest.groupsData || []).map((g) => <option key={g.groupId} value={g.groupId}>{g.groupName}</option>)}
              </select>
            </div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, background: theme.card, padding: 10, display: "grid", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Найближче заняття</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.textMain, overflowWrap: "anywhere" }}>{trainingLabel}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Наступна відправка</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.textMain, overflowWrap: "anywhere" }}>{nextSendLabel}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Активний режим</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.textMain, overflowWrap: "anywhere" }}>{modeLabel(persistedSendMode)}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Автоматизація</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: digest.selectedGroupData?.enabled ? theme.success : theme.warning }}>
                    {digest.selectedGroupData?.enabled ? "увімкнено" : "вимкнено"}
                  </div>
                </div>
              </div>
              {!!digest.selectedGroupData?.plan && (
                <div style={{ fontSize: 12, color: isDispatchDueNow(digest.selectedGroupData.plan, new Date(), 15) ? theme.warning : theme.textMuted }}>
                  Планер: відправка {digest.selectedGroupData.plan.sendAtLocal || digest.selectedGroupData.plan.sendAtIso}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input, padding: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: theme.textMain }}>Крок 2: Режим надсилання</div>
            <div style={{ fontSize: 11, color: scheduleDraft.dirty ? theme.warning : theme.textMuted }}>
              {scheduleDraft.dirty ? "Є незбережені зміни розкладу" : "Розклад синхронізований"}
            </div>
          </div>
          <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, background: theme.card, padding: 10, display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => updateScheduleDraft({ mode: "default" })} style={{ border: `1px solid ${effectiveDraftMode === "default" ? theme.primary : theme.border}`, borderRadius: 999, background: effectiveDraftMode === "default" ? `${theme.primary}20` : theme.input, color: effectiveDraftMode === "default" ? theme.primary : theme.textMain, padding: "6px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Типовий (−60 хв)</button>
              <button type="button" onClick={() => updateScheduleDraft({ mode: "custom_time" })} style={{ border: `1px solid ${effectiveDraftMode === "custom_time" ? theme.primary : theme.border}`, borderRadius: 999, background: effectiveDraftMode === "custom_time" ? `${theme.primary}20` : theme.input, color: effectiveDraftMode === "custom_time" ? theme.primary : theme.textMain, padding: "6px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Кастомний час (HH:mm)</button>
              <button type="button" onClick={() => updateScheduleDraft({ mode: "custom_datetime" })} style={{ border: `1px solid ${effectiveDraftMode === "custom_datetime" ? theme.primary : theme.border}`, borderRadius: 999, background: effectiveDraftMode === "custom_datetime" ? `${theme.primary}20` : theme.input, color: effectiveDraftMode === "custom_datetime" ? theme.primary : theme.textMain, padding: "6px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Кастомні дата й час</button>
            </div>

            {effectiveDraftMode === "default" && (
              <div style={{ fontSize: 12, color: theme.textMuted }}>Буде використано стандартне правило: відправка за 60 хвилин до найближчого заняття.</div>
            )}
            {effectiveDraftMode === "custom_time" && (
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, color: theme.textMuted }}>Час відправки (HH:mm) для дати найближчого заняття</label>
                <input
                  type="time"
                  value={scheduleDraft.timeValue || ""}
                  onChange={(e) => updateScheduleDraft({ timeValue: e.target.value || "" })}
                  style={{ width: "fit-content", border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.input, color: theme.textMain, padding: "8px 10px" }}
                />
              </div>
            )}
            {effectiveDraftMode === "custom_datetime" && (
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 12, color: theme.textMuted }}>Конкретні дата і час відправки</label>
                <input
                  type="datetime-local"
                  value={scheduleDraft.datetimeValue || ""}
                  onChange={(e) => updateScheduleDraft({ datetimeValue: e.target.value || "" })}
                  style={{ width: "fit-content", border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.input, color: theme.textMain, padding: "8px 10px" }}
                />
              </div>
            )}

            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 8, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: theme.textMuted }}>Що буде збережено після застосування:</div>
              <div style={{ fontSize: 12, color: theme.textMain, fontWeight: 700 }}>
                {effectiveDraftMode === "default" && "sendTimeOverride = null (типовий -60 хв)"}
                {effectiveDraftMode === "custom_time" && `sendTimeOverride = "${scheduleDraft.timeValue || ""}"`}
                {effectiveDraftMode === "custom_datetime" && `sendTimeOverride = "${scheduleDraft.datetimeValue || ""}"`}
              </div>
              <button type="button" onClick={applySendOverride} style={{ width: "fit-content", border: "none", borderRadius: 10, background: theme.primary, color: "#fff", padding: "8px 12px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Застосувати розклад</button>
            </div>
          </div>
        </div>

        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input, padding: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700, color: theme.textMain, fontSize: 13 }}>Крок 3: Редагування шаблону</div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>Головний фокус: текст повідомлення для обраної групи</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: isDraftDirty ? theme.warning : theme.success, border: `1px solid ${isDraftDirty ? `${theme.warning}66` : `${theme.success}66`}`, borderRadius: 999, padding: "4px 8px", background: isDraftDirty ? `${theme.warning}20` : `${theme.success}20` }}>
              {isDraftDirty ? "Є незбережені зміни" : "Збережено"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" onClick={regenerateFromTemplate} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.card, color: theme.textMain, padding: "6px 9px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Шаблон</button>
            <button type="button" disabled={savingDraft || !activeGroupId} onClick={() => saveManualDraft(activeGroupId, activeDraft)} style={{ border: "none", borderRadius: 10, background: theme.primary, color: "#fff", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Зберегти</button>
            <button type="button" onClick={copyToClipboard} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.card, color: theme.textMain, padding: "6px 9px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Копія</button>
          </div>

          <textarea
            value={activeDraft}
            onChange={(e) => updateDraft(e.target.value)}
            onBlur={() => saveManualDraft(activeGroupId, activeDraft)}
            rows={14}
            style={{ width: "100%", resize: "vertical", minHeight: 240, maxHeight: 540, overflow: "auto", background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 10, color: theme.textMain, lineHeight: 1.45, fontSize: 13 }}
            placeholder="Немає даних для дайджесту або не задано trainer_groups."
          />
          {savingDraft && <div style={{ fontSize: 12, color: theme.textMuted }}>Зберігаємо чернетку…</div>}
        </div>

        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input, padding: 12, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700, color: theme.textMain, fontSize: 13 }}>Крок 4: Збереження / тест / ручна відправка</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" disabled={sendingNow} onClick={() => sendNow({ dryRun: true })} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.card, color: theme.textMain, padding: "6px 8px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Перевірити</button>
            <button type="button" disabled={sendingNow || !readiness.adminConfigured} onClick={(e) => testToAdmin(e)} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.card, color: theme.textMain, padding: "6px 8px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Тест адміну</button>
            <button type="button" disabled={sendingNow} onClick={() => sendNow({ dryRun: false })} style={{ border: "none", borderRadius: 10, background: theme.success, color: "#fff", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>{sendingNow ? "Надсилання..." : "Надіслати"}</button>
          </div>
        </div>

        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 10, background: theme.input }}>
          <div style={{ fontWeight: 700, color: theme.textMain, marginBottom: 8, fontSize: 13 }}>Крок 5: Статус автоматизації</div>
          <div style={{ display: "grid", gap: 8 }}>
            {(digest.groupsData || []).map((g) => (
              <label key={g.groupId} style={{ display: "grid", gap: 6, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8, background: theme.card }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={g.enabled}
                      onChange={(e) => saveAutoSendToggle(g.groupId, e.target.checked)}
                    />
                    <span style={{ color: theme.textMain, fontWeight: 700 }}>{g.groupName}</span>
                  </div>
                  <span style={{ fontSize: 11, border: `1px solid ${g.enabled ? `${theme.success}55` : `${theme.warning}55`}`, color: g.enabled ? theme.success : theme.warning, background: g.enabled ? `${theme.success}18` : `${theme.warning}18`, borderRadius: 999, padding: "2px 7px", fontWeight: 700 }}>
                    {g.enabled ? "увімкнено" : "вимкнено"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted }}>
                  {g.plan
                    ? `наступна відправка ${g.plan.sendAtLocal || g.plan.sendAtIso} • заняття ${g.plan.trainingDate} ${g.plan.trainingTime}`
                    : "Немає валідного розкладу"}
                </div>
              </label>
            ))}
          </div>
        </div>

        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 10, background: theme.input }}>
          <div style={{ fontWeight: 700, color: theme.textMain, marginBottom: 6, fontSize: 13 }}>Надсилання на сьогодні / статуси</div>
          {todaySends.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              {todaySends.map((x, i) => {
                const tone = sendStatusStyle(x.status);
                return (
                  <div key={`${x.groupName}_${x.sendAt}_${i}`} style={{ border: `1px solid ${tone.border}`, background: tone.bg, borderRadius: 10, padding: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: theme.textMain, fontWeight: 700, fontSize: 12 }}>{x.groupName}</div>
                      <div style={{ color: theme.textMuted, fontSize: 11 }}>
                        {x.sendAtLocal || (x.sendAt ? x.sendAt.slice(0, 16).replace("T", " ") : "—")}{x.trainingDate ? ` • заняття ${x.trainingDate}` : ""}{x.details ? ` • ${x.details}` : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: tone.color, textTransform: "uppercase" }}>{sendStatusLabel(x.status)}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: theme.textMuted }}>Немає груп для показу статусів.</div>
          )}
        </div>

        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 10, background: theme.input }}>
          <div style={{ fontWeight: 700, color: theme.textMain, marginBottom: 6, fontSize: 13 }}>Історія</div>
          {!lastActions.length && !(digest.persistedHistory || []).length && <div style={{ fontSize: 12, color: theme.textMuted }}>Ще немає дій.</div>}
          <div style={{ display: "grid", gap: 6 }}>
            {lastActions.map((a) => {
              const tone = sendStatusStyle(a.status);
              return (
                <div key={a.id} style={{ border: `1px solid ${tone.border}`, background: tone.bg, borderRadius: 10, padding: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ color: theme.textMain, fontSize: 12, fontWeight: 700 }}>{a.chatTitle}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: tone.color }}>{sendStatusLabel(a.status)}</div>
                  </div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>{a.time.slice(0, 16).replace("T", " ")} • учениць: {a.students}{a.details ? ` • ${a.details}` : ""}</div>
                </div>
              );
            })}
            {(digest.persistedHistory || []).slice(0, 20).map((h) => {
              const tone = sendStatusStyle(h.status);
              return (
                <div key={`persisted_${h.id || `${h.timestamp}_${h.groupId}`}`} style={{ border: `1px solid ${tone.border}`, background: tone.bg, borderRadius: 10, padding: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ color: theme.textMain, fontSize: 12, fontWeight: 700 }}>{h.chatTitle || h.chatId} / {h.groupName || h.groupId}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: tone.color }}>{sendStatusLabel(h.status)}</div>
                  </div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>{(h.timestamp || "").slice(0, 16).replace("T", " ")} • {h.triggerType} • учениць: {h.studentsCount || 0}{h.details ? ` • ${h.details}` : ""}</div>
                </div>
              );
            })}
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { theme } from "../shared/constants";
import { buildGroupDispatchPlan, buildTrainerGroupDraft, isDispatchDueNow, isTrainerChatByNote, parseTrainerGroupIds, parseTrainerGroups } from "../shared/trainerDigest";
import { today, useStickyState } from "../shared/utils";

export default function TrainersNotificationsTab({
  groups = [],
  students = [],
  studentGrps = [],
  subs = [],
  attn = [],
  cancelled = [],
}) {
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
  const [readiness, setReadiness] = useState({ ready: null, adminConfigured: false, details: "" });
  const [testResult, setTestResult] = useState("");
  const [sendOverrideDraft, setSendOverrideDraft] = useState("");

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
              details: rPayload?.ready ? "Storage ready" : "Storage not ready",
            });
          }
        } catch {
          if (!cancelled) setReadiness({ ready: false, adminConfigured: false, details: "Readiness check failed" });
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

  const digest = useMemo(() => {
    if (!selectedDialog) return { text: "", groupNames: [], groupsData: [], selectedGroupData: null, persistedHistory: [] };
    const trainerGroupIds = parseTrainerGroupIds(selectedDialog.note || "");
    const trainerGroups = parseTrainerGroups(selectedDialog.note || "");
    const parsedGroups = trainerGroupIds.length
      ? groups.filter((g) => trainerGroupIds.includes(String(g.id)))
      : groups.filter((g) => trainerGroups.map((x) => x.toLowerCase()).includes((g.name || "").toLowerCase()));
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
      return {
        groupId: String(g.id),
        groupName: g.name,
        plan,
        generatedText: generated.text,
        generatedStudentsCount: generated.studentsCount || 0,
        enabled: row.auto_send_enabled !== false,
        persistedDraft: manualDraft,
        sendTimeOverride: row.send_time_override || null,
        activeText: (draftByChat[`${selectedDialog.id}:${g.id}`] ?? manualDraft ?? generated.text) || "",
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
  }, [selectedDialog, groups, students, membershipByStudent, subsByStudent, attn, refreshVersion, cancelled, draftByChat, selectedGroupIdByChat, stateByChatGroup, historyByChat]);

  const activeDraft = digest.selectedGroupData?.activeText || "";
  const activeGroupId = digest.selectedGroupData?.groupId || "";
  const isDraftDirty = String(activeDraft || "") !== String(digest.selectedGroupData?.persistedDraft || "");

  useEffect(() => {
    setSendOverrideDraft(digest.selectedGroupData?.sendTimeOverride || "");
  }, [digest.selectedGroupData?.groupId, digest.selectedGroupData?.sendTimeOverride]);

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
        alert("Storage не готовий. Застосуйте SQL: trainer_notification_state.sql та trainer_dispatch_history.sql");
      }
      alert(`Не вдалося зберегти чернетку: ${String(error?.message || error)}`);
    } finally {
      setSavingDraft(false);
    }
  };

  const regenerateFromTemplate = () => {
    if (!selectedDialog?.id || !activeGroupId || !digest.selectedGroupData) return;
    if (!window.confirm("Перезаписати ручну чернетку автогенерованим шаблоном для цієї групи?")) return;
    const regenerated = digest.selectedGroupData.generatedText || "";
    setDraftByChat((prev) => ({ ...prev, [`${selectedDialog.id}:${activeGroupId}`]: regenerated }));
    saveManualDraft(activeGroupId, regenerated);
    setRefreshVersion((v) => v + 1);
  };

  const copyToClipboard = async () => {
    if (!activeDraft) return;
    try {
      await navigator.clipboard.writeText(activeDraft);
      alert("Скопійовано");
    } catch {
      alert("Не вдалося скопіювати");
    }
  };

  const sendNow = async ({ dryRun = false } = {}) => {
    if (!selectedDialog?.id || !activeGroupId || !digest.selectedGroupData) return;
    const text = activeDraft || digest.selectedGroupData.generatedText || "";
    if (!text) return;
    const nowIso = new Date().toISOString();

    if (dryRun) {
      setLastActions((prev) => [
        {
          id: `dry_${Date.now()}`,
          status: "dry-run",
          chatTitle: `${selectedDialog.title || selectedDialog.id} / ${digest.selectedGroupData.groupName}`,
          time: nowIso,
          students: digest.selectedGroupData.generatedStudentsCount || 0,
        },
        ...prev,
      ].slice(0, 20));
      return;
    }

    setSendingNow(true);
    try {
      await saveManualDraft(activeGroupId, text);
      const res = await fetch("/api/telegram?op=sendTrainerDigest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: selectedDialog.id,
          message: text,
          chatTitle: selectedDialog.title || selectedDialog.id,
          groupId: digest.selectedGroupData.groupId,
          groupNames: [digest.selectedGroupData.groupName],
          studentsCount: digest.selectedGroupData.generatedStudentsCount || 0,
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
        studentsCount: digest.selectedGroupData.generatedStudentsCount || 0,
        details: ok ? `admin-log:${payload?.adminLogStatus || "skipped"}` : (payload?.details || payload?.error || "send failed"),
      };
      await appendHistory(historyEntry);
      setLastActions((prev) => [
        {
          id: `send_${Date.now()}`,
          status: ok ? "sent" : "failed",
          chatTitle: `${selectedDialog.title || selectedDialog.id} / ${digest.selectedGroupData.groupName}`,
          time: nowIso,
          students: digest.selectedGroupData.generatedStudentsCount || 0,
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
        alert("Storage не готовий. Застосуйте SQL migration для trainer_notification_state / trainer_dispatch_history.");
      }
      alert(`Не вдалося зберегти toggle: ${String(error?.message || error)}`);
    }
  };

  const todaySends = useMemo(() => {
    const todayStr = today();
    const history = digest.persistedHistory || [];
    return (digest.groupsData || []).map((g) => {
      if (!g.enabled) return { groupId: g.groupId, groupName: g.groupName, status: "disabled", sendAt: g.plan?.sendAtIso || "", trainingDate: g.plan?.trainingDate || "" };
      if (!g.plan) return { groupId: g.groupId, groupName: g.groupName, status: "cancelled", sendAt: "", trainingDate: "" };
      const hist = history.find((h) => String(h.groupId) === String(g.groupId) && String(h.trainingDate || "").slice(0, 10) === String(g.plan.trainingDate || "").slice(0, 10));
      if (hist?.status === "sent") return { groupId: g.groupId, groupName: g.groupName, status: "sent", sendAt: g.plan.sendAtIso, trainingDate: g.plan.trainingDate, details: hist.details || "" };
      if (hist?.status === "failed" || hist?.status === "skipped") return { groupId: g.groupId, groupName: g.groupName, status: hist.status, sendAt: g.plan.sendAtIso, trainingDate: g.plan.trainingDate, details: hist.reason || hist.details || "" };
      if (String(g.plan.trainingDate || "").slice(0, 10) !== todayStr) {
        return { groupId: g.groupId, groupName: g.groupName, status: "not_today", sendAt: g.plan.sendAtIso, trainingDate: g.plan.trainingDate };
      }
      return {
        groupId: g.groupId,
        groupName: g.groupName,
        status: isDispatchDueNow(g.plan, new Date(), 15) ? "due" : "scheduled",
        sendAt: g.plan.sendAtIso,
        trainingDate: g.plan.trainingDate,
      };
    });
  }, [digest.groupsData, digest.persistedHistory]);

  const testToAdmin = async () => {
    if (!selectedDialog?.id || !activeGroupId || !digest.selectedGroupData) return;
    const text = activeDraft || digest.selectedGroupData.generatedText || "";
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
          studentsCount: digest.selectedGroupData.generatedStudentsCount || 0,
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
        studentsCount: digest.selectedGroupData.generatedStudentsCount || 0,
        details: ok ? `admin-log:${payload?.adminLogStatus || "skipped"}` : (payload?.details || payload?.error || "test failed"),
      };
      await appendHistory(historyEntry);
      setLastActions((prev) => [historyEntry, ...prev].slice(0, 20));
      setTestResult(ok ? `Тест надіслано (admin-log: ${payload?.adminLogStatus || "skipped"})` : `Тест не вдався: ${payload?.details || payload?.error || "unknown"}`);
      if (!ok) alert(payload?.details || payload?.error || "Не вдалося надіслати тест");
    } finally {
      setSendingNow(false);
    }
  };

  const selectedPlan = digest.selectedGroupData?.plan || null;
  const selectedChatTitle = selectedDialog?.title || selectedDialog?.id || "—";
  const selectedGroupName = digest.selectedGroupData?.groupName || "—";
  const nextSendLabel = selectedPlan?.sendAtIso ? selectedPlan.sendAtIso.slice(0, 16).replace("T", " ") : "—";
  const trainingLabel = selectedPlan ? `${selectedPlan.trainingDate} ${selectedPlan.trainingTime}` : "—";

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
            <div style={{ fontSize: 11, color: theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: 999, padding: "4px 8px", background: theme.card }}>Planner mode</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8, background: theme.card }}>
              <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Тренер</div>
              <div style={{ fontSize: 13, color: theme.textMain, fontWeight: 700, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedChatTitle}</div>
            </div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8, background: theme.card }}>
              <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Група</div>
              <div style={{ fontSize: 13, color: theme.textMain, fontWeight: 700, marginTop: 2 }}>{selectedGroupName}</div>
            </div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8, background: theme.card }}>
              <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Next send</div>
              <div style={{ fontSize: 13, color: theme.textMain, fontWeight: 700, marginTop: 2 }}>{nextSendLabel}</div>
            </div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8, background: theme.card }}>
              <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Адмін лог</div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, display: "inline-flex", borderRadius: 999, padding: "2px 8px", ...statusChip(readiness.adminConfigured) }}>
                {readiness.adminConfigured ? "готово" : "відсутнє"}
              </div>
            </div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8, background: theme.card }}>
              <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Storage</div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, display: "inline-flex", borderRadius: 999, padding: "2px 8px", ...statusChip(readiness.ready) }}>
                {readiness.ready ? "ready" : "missing"}
              </div>
            </div>
          </div>
        </div>

        {!!testResult && <div style={{ fontSize: 12, color: theme.textMuted }}>{testResult}</div>}

        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input, padding: 10, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: theme.textMain }}>1) Обери групу і перевір розклад</div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 280px) 1fr", gap: 10, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ color: theme.textMuted, fontSize: 12 }}>Активна група</label>
              <select
                value={activeGroupId}
                onChange={(e) => setSelectedGroupIdByChat((prev) => ({ ...prev, [selectedDialog?.id || ""]: e.target.value }))}
                style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.card, color: theme.textMain, padding: "8px 10px", fontWeight: 700 }}
              >
                {(digest.groupsData || []).map((g) => <option key={g.groupId} value={g.groupId}>{g.groupName}</option>)}
              </select>
            </div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, background: theme.card, padding: 8, display: "grid", gap: 6 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Заняття</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.textMain }}>{trainingLabel}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Відправка</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.textMain }}>{nextSendLabel}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase" }}>Default</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: theme.textMain }}>-60 хв до старту</div>
                </div>
              </div>
              {!!digest.selectedGroupData?.plan && (
                <div style={{ fontSize: 12, color: isDispatchDueNow(digest.selectedGroupData.plan, new Date(), 15) ? theme.warning : theme.textMuted }}>
                  Планер: відправка {digest.selectedGroupData.plan.sendAtIso.slice(0, 16).replace("T", " ")}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: theme.textMuted }}>Override send time</label>
            <input
              type="time"
              value={sendOverrideDraft || ""}
              onChange={(e) => setSendOverrideDraft(e.target.value || "")}
              style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.card, color: theme.textMain, padding: "6px 8px" }}
            />
            <button type="button" onClick={() => upsertGroupState(activeGroupId, { sendTimeOverride: sendOverrideDraft || null })} style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.card, color: theme.textMain, padding: "5px 9px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Apply</button>
            <button type="button" onClick={() => { setSendOverrideDraft(""); upsertGroupState(activeGroupId, { sendTimeOverride: null }); }} style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.card, color: theme.textMain, padding: "5px 9px", cursor: "pointer", fontSize: 12 }}>Reset</button>
          </div>
        </div>

        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input, padding: 10, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700, color: theme.textMain, fontSize: 13 }}>2) Редагуй шаблон дайджесту</div>
              <div style={{ fontSize: 12, color: theme.textMuted }}>Головний фокус: текст повідомлення для обраної групи</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: isDraftDirty ? theme.warning : theme.success, border: `1px solid ${isDraftDirty ? `${theme.warning}66` : `${theme.success}66`}`, borderRadius: 999, padding: "4px 8px", background: isDraftDirty ? `${theme.warning}20` : `${theme.success}20` }}>
              {isDraftDirty ? "Unsaved changes" : "Saved"}
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

        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, background: theme.input, padding: 10, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700, color: theme.textMain, fontSize: 13 }}>3) Перевір або надішли</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" disabled={sendingNow} onClick={() => sendNow({ dryRun: true })} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.card, color: theme.textMain, padding: "6px 8px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Перевірити</button>
            <button type="button" disabled={sendingNow || !readiness.adminConfigured} onClick={testToAdmin} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.card, color: theme.textMain, padding: "6px 8px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Тест адміну</button>
            <button type="button" disabled={sendingNow} onClick={() => sendNow({ dryRun: false })} style={{ border: "none", borderRadius: 10, background: theme.success, color: "#fff", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>{sendingNow ? "Надсилання..." : "Надіслати"}</button>
          </div>
        </div>

        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 10, background: theme.input }}>
          <div style={{ fontWeight: 700, color: theme.textMain, marginBottom: 8, fontSize: 13 }}>4) Automation per group</div>
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
                    {g.enabled ? "enabled" : "disabled"}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted }}>
                  {g.plan
                    ? `next send ${g.plan.sendAtIso.slice(0, 16).replace("T", " ")} • заняття ${g.plan.trainingDate} ${g.plan.trainingTime}`
                    : "Немає валідного schedule"}
                </div>
              </label>
            ))}
          </div>
        </div>

        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 10, background: theme.input }}>
          <div style={{ fontWeight: 700, color: theme.textMain, marginBottom: 6, fontSize: 13 }}>Today sends / statuses</div>
          {todaySends.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              {todaySends.map((x, i) => {
                const tone = sendStatusStyle(x.status);
                return (
                  <div key={`${x.groupName}_${x.sendAt}_${i}`} style={{ border: `1px solid ${tone.border}`, background: tone.bg, borderRadius: 10, padding: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: theme.textMain, fontWeight: 700, fontSize: 12 }}>{x.groupName}</div>
                      <div style={{ color: theme.textMuted, fontSize: 11 }}>
                        {x.sendAt ? x.sendAt.slice(0, 16).replace("T", " ") : "—"}{x.trainingDate ? ` • заняття ${x.trainingDate}` : ""}{x.details ? ` • ${x.details}` : ""}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: tone.color, textTransform: "uppercase" }}>{x.status}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: theme.textMuted }}>Немає груп для показу статусів.</div>
          )}
        </div>

        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 10, background: theme.input }}>
          <div style={{ fontWeight: 700, color: theme.textMain, marginBottom: 6, fontSize: 13 }}>History</div>
          {!lastActions.length && !(digest.persistedHistory || []).length && <div style={{ fontSize: 12, color: theme.textMuted }}>Ще немає дій.</div>}
          <div style={{ display: "grid", gap: 6 }}>
            {lastActions.map((a) => {
              const tone = sendStatusStyle(a.status);
              return (
                <div key={a.id} style={{ border: `1px solid ${tone.border}`, background: tone.bg, borderRadius: 10, padding: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ color: theme.textMain, fontSize: 12, fontWeight: 700 }}>{a.chatTitle}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: tone.color }}>{a.status}</div>
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
                    <div style={{ fontSize: 11, fontWeight: 700, color: tone.color }}>{h.status}</div>
                  </div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>{(h.timestamp || "").slice(0, 16).replace("T", " ")} • {h.triggerType} • учениць: {h.studentsCount || 0}{h.details ? ` • ${h.details}` : ""}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

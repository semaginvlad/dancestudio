import React, { useEffect, useMemo, useState } from "react";
import { theme } from "../shared/constants";
import { buildGroupDispatchPlan, buildTrainerGroupDraft, isDispatchDueNow, isTrainerChatByNote, parseTrainerAutoSendMap, parseTrainerGroupDraftsMap, parseTrainerGroups, patchTrainerAutoSendMapInNote, patchTrainerGroupDraftInNote } from "../shared/trainerDigest";
import { today } from "../shared/utils";

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
  const [selectedChatId, setSelectedChatId] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [draftByChat, setDraftByChat] = useState({});
  const [lastActions, setLastActions] = useState([]);
  const [sendingNow, setSendingNow] = useState(false);
  const [selectedGroupIdByChat, setSelectedGroupIdByChat] = useState({});
  const [savingDraft, setSavingDraft] = useState(false);

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
        const res = await fetch("/api/telegram-list-dialogs");
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.details || payload?.error || "Failed to load dialogs");
        const loaded = payload.dialogs || [];
        if (cancelled) return;
        setDialogs(loaded);

        const metaRows = await Promise.all(
          loaded.map(async (dlg) => {
            try {
              const metaRes = await fetch(`/api/telegram-chat-meta?chatId=${encodeURIComponent(dlg.id)}`);
              const metaPayload = await metaRes.json();
              if (!metaRes.ok) return [dlg.id, null];
              return [dlg.id, metaPayload.meta || null];
            } catch {
              return [dlg.id, null];
            }
          })
        );
        if (!cancelled) setMetaByChat(Object.fromEntries(metaRows));
      } catch {
        if (!cancelled) {
          setDialogs([]);
          setMetaByChat({});
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

  const selectedDialog = useMemo(() => {
    return trainerDialogs.find((d) => d.id === selectedChatId) || trainerDialogs[0] || null;
  }, [trainerDialogs, selectedChatId]);

  const digest = useMemo(() => {
    if (!selectedDialog) return { text: "", groupNames: [], groupsData: [], selectedGroupData: null };
    const trainerGroups = parseTrainerGroups(selectedDialog.note || "");
    const parsedGroups = groups.filter((g) => trainerGroups.map((x) => x.toLowerCase()).includes((g.name || "").toLowerCase()));
    const persistedAutoSendMap = parseTrainerAutoSendMap(selectedDialog.note || "");
    const persistedDrafts = parseTrainerGroupDraftsMap(selectedDialog.note || "");
    const groupsData = parsedGroups.map((g) => {
      const plan = buildGroupDispatchPlan({ group: g, cancelled, now: new Date() });
      const generated = buildTrainerGroupDraft({
        group: g,
        students,
        membershipByStudent,
        subsByStudent,
        attn,
        targetTrainingDate: plan?.trainingDate || today(),
      });
      const manualDraft = persistedDrafts[String(g.id)] || "";
      return {
        groupId: String(g.id),
        groupName: g.name,
        plan,
        generatedText: generated.text,
        generatedStudentsCount: generated.studentsCount || 0,
        enabled: persistedAutoSendMap[String(g.id)] !== false,
        persistedDraft: manualDraft,
        activeText: (draftByChat[`${selectedDialog.id}:${g.id}`] ?? manualDraft ?? generated.text) || "",
      };
    });
    const chatSelectionKey = selectedDialog.id;
    const selectedGroupId = selectedGroupIdByChat[chatSelectionKey] || groupsData[0]?.groupId || "";
    const selectedGroupData = groupsData.find((g) => g.groupId === selectedGroupId) || groupsData[0] || null;
    return {
      groupNames: parsedGroups.map((g) => g.name),
      groupsData,
      selectedGroupData,
    };
  }, [selectedDialog, groups, students, membershipByStudent, subsByStudent, attn, refreshVersion, cancelled, draftByChat, selectedGroupIdByChat]);

  const activeDraft = digest.selectedGroupData?.activeText || "";
  const activeGroupId = digest.selectedGroupData?.groupId || "";

  const updateDraft = (next) => {
    if (!selectedDialog?.id || !activeGroupId) return;
    setDraftByChat((prev) => ({ ...prev, [`${selectedDialog.id}:${activeGroupId}`]: next }));
  };

  const saveManualDraft = async (groupId, value) => {
    if (!selectedDialog?.id || !groupId) return;
    const nextNote = patchTrainerGroupDraftInNote(selectedDialog.note || "", groupId, value);
    setSavingDraft(true);
    try {
      const res = await fetch("/api/telegram-chat-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: selectedDialog.id, internalNote: nextNote }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.details || payload?.error || "save draft failed");
      setMetaByChat((prev) => ({
        ...prev,
        [selectedDialog.id]: {
          ...(prev[selectedDialog.id] || {}),
          ...(payload?.meta || {}),
          internal_note: nextNote,
        },
      }));
    } catch (error) {
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
      const res = await fetch("/api/send-trainer-digest", {
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
    const currentMap = parseTrainerAutoSendMap(selectedDialog.note || "");
    const nextMap = { ...currentMap, [String(groupId)]: !!nextEnabled };
    const nextNote = patchTrainerAutoSendMapInNote(selectedDialog.note || "", nextMap);
    try {
      const res = await fetch("/api/telegram-chat-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: selectedDialog.id, internalNote: nextNote }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.details || payload?.error || "save failed");
      setMetaByChat((prev) => ({
        ...prev,
        [selectedDialog.id]: {
          ...(prev[selectedDialog.id] || {}),
          ...(payload?.meta || {}),
          internal_note: nextNote,
        },
      }));
    } catch (error) {
      alert(`Не вдалося зберегти toggle: ${String(error?.message || error)}`);
    }
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

      <div style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 12, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 800, color: theme.textMain }}>Сповіщення / дайджест тренера</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>
              Групи: {digest.groupNames?.length ? digest.groupNames.join(", ") : "—"}
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>
              Admin log: configured Telegram chat id from env (`TELEGRAM_ADMIN_LOG_CHAT_ID` або `TELEGRAM_ADMIN_CHAT_ID`)
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={regenerateFromTemplate} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.input, color: theme.textMain, padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Оновити з шаблону</button>
            <button type="button" onClick={copyToClipboard} style={{ border: "none", borderRadius: 10, background: theme.primary, color: "#fff", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Скопіювати</button>
            <button type="button" disabled={sendingNow} onClick={() => sendNow({ dryRun: true })} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.card, color: theme.textMain, padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Dry run</button>
            <button type="button" disabled={sendingNow} onClick={() => sendNow({ dryRun: false })} style={{ border: "none", borderRadius: 10, background: theme.success, color: "#fff", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>{sendingNow ? "Надсилання..." : "Надіслати"}</button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ color: theme.textMuted, fontSize: 12 }}>Група:</label>
            <select
              value={activeGroupId}
              onChange={(e) => setSelectedGroupIdByChat((prev) => ({ ...prev, [selectedDialog?.id || ""]: e.target.value }))}
              style={{ border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.input, color: theme.textMain, padding: "6px 8px" }}
            >
              {(digest.groupsData || []).map((g) => <option key={g.groupId} value={g.groupId}>{g.groupName}</option>)}
            </select>
            {!!digest.selectedGroupData?.plan && (
              <span style={{ fontSize: 12, color: isDispatchDueNow(digest.selectedGroupData.plan, new Date(), 15) ? theme.warning : theme.textMuted }}>
                Next send: {digest.selectedGroupData.plan.sendAtIso.slice(0, 16).replace("T", " ")} (заняття {digest.selectedGroupData.plan.trainingDate} {digest.selectedGroupData.plan.trainingTime})
              </span>
            )}
          </div>
        </div>

        <textarea
          value={activeDraft}
          onChange={(e) => updateDraft(e.target.value)}
          onBlur={() => saveManualDraft(activeGroupId, activeDraft)}
          rows={14}
          style={{ width: "100%", resize: "vertical", minHeight: 220, maxHeight: 520, overflow: "auto", background: theme.input, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 10, color: theme.textMain, lineHeight: 1.45, fontSize: 13 }}
          placeholder="Немає даних для дайджесту або не задано trainer_groups."
        />
        {savingDraft && <div style={{ fontSize: 12, color: theme.textMuted }}>Зберігаємо чернетку…</div>}

        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, padding: 10, background: theme.input }}>
          <div style={{ fontWeight: 700, color: theme.textMain, marginBottom: 8 }}>Automation per group (день заняття, за 1 годину)</div>
          <div style={{ display: "grid", gap: 8 }}>
            {(digest.groupsData || []).map((g) => (
              <label key={g.groupId} style={{ display: "grid", gap: 4, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8, background: theme.card }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={g.enabled}
                    onChange={(e) => saveAutoSendToggle(g.groupId, e.target.checked)}
                  />
                  <span style={{ color: theme.textMain, fontWeight: 700 }}>{g.groupName}</span>
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted }}>
                  {g.plan
                    ? `next send ${g.plan.sendAtIso.slice(0, 16).replace("T", " ")} (заняття ${g.plan.trainingDate} ${g.plan.trainingTime})`
                    : "Немає валідного schedule"}
                </div>
              </label>
            ))}
          </div>
        </div>

        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, padding: 10, background: theme.input }}>
          <div style={{ fontWeight: 700, color: theme.textMain, marginBottom: 6 }}>Що буде надіслано зараз (due window)</div>
          {(digest.groupsData || []).filter((g) => g.enabled && g.plan && isDispatchDueNow(g.plan, new Date(), 15)).length ? (
            <div style={{ display: "grid", gap: 4, fontSize: 12, color: theme.textMain }}>
              {(digest.groupsData || [])
                .filter((g) => g.enabled && g.plan && isDispatchDueNow(g.plan, new Date(), 15))
                .map((x, i) => <div key={`${x.groupName}_${x.plan?.sendAtIso}_${i}`}>• {x.groupName}: {x.plan?.sendAtIso.slice(0, 16).replace("T", " ")} (заняття {x.plan?.trainingDate} {x.plan?.trainingTime})</div>)}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: theme.textMuted }}>Зараз немає due відправок.</div>
          )}
        </div>

        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 8 }}>
          <div style={{ fontWeight: 700, color: theme.textMain, marginBottom: 6, fontSize: 12 }}>Лог відправок (UI)</div>
          {!lastActions.length && <div style={{ fontSize: 12, color: theme.textMuted }}>Ще немає дій.</div>}
          {lastActions.map((a) => (
            <div key={a.id} style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
              [{a.status}] {a.chatTitle} • {a.time.slice(0, 16).replace("T", " ")} • учениць: {a.students}{a.details ? ` • ${a.details}` : ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { theme } from "../shared/constants";
import { buildGroupScheduleWindows, buildTrainerMessageDraft, isTrainerChatByNote, parseTrainerAutoSendMap, parseTrainerGroups, patchTrainerAutoSendMapInNote } from "../shared/trainerDigest";
import { today } from "../shared/utils";

export default function TrainersNotificationsTab({
  groups = [],
  students = [],
  studentGrps = [],
  subs = [],
  attn = [],
}) {
  const [dialogs, setDialogs] = useState([]);
  const [metaByChat, setMetaByChat] = useState({});
  const [selectedChatId, setSelectedChatId] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [draftByChat, setDraftByChat] = useState({});
  const [lastActions, setLastActions] = useState([]);
  const [sendingNow, setSendingNow] = useState(false);

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
    if (!selectedDialog) return { text: "", automationReady: null, groupNames: [] };
    const trainerGroups = parseTrainerGroups(selectedDialog.note || "");
    const parsedGroups = groups.filter((g) => trainerGroups.map((x) => x.toLowerCase()).includes((g.name || "").toLowerCase()));
    const persistedAutoSendMap = parseTrainerAutoSendMap(selectedDialog.note || "");
    const enabledGroupIds = parsedGroups
      .filter((g) => persistedAutoSendMap[String(g.id)] !== false)
      .map((g) => String(g.id));
    const draft = buildTrainerMessageDraft({
      groups: parsedGroups,
      students,
      membershipByStudent,
      subsByStudent,
      attn,
      enabledGroupIds,
      referenceDate: today(),
    });
    const scheduleByGroup = parsedGroups.map((g) => ({
      groupId: String(g.id),
      groupName: g.name,
      enabled: persistedAutoSendMap[String(g.id)] !== false,
      windows: buildGroupScheduleWindows(g),
    }));
    return {
      ...draft,
      groupNames: parsedGroups.map((g) => g.name),
      scheduleByGroup,
      persistedAutoSendMap,
    };
  }, [selectedDialog, groups, students, membershipByStudent, subsByStudent, attn, refreshVersion]);

  const activeDraft = draftByChat[selectedDialog?.id || ""] ?? digest.text;

  const updateDraft = (next) => {
    if (!selectedDialog?.id) return;
    setDraftByChat((prev) => ({ ...prev, [selectedDialog.id]: next }));
  };

  const regenerateFromTemplate = () => {
    if (!selectedDialog?.id) return;
    setDraftByChat((prev) => ({ ...prev, [selectedDialog.id]: digest.text }));
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
    if (!selectedDialog?.id) return;
    const text = activeDraft || digest.text;
    if (!text) return;
    const nowIso = new Date().toISOString();
    if (dryRun) {
      setLastActions((prev) => [
        {
          id: `dry_${Date.now()}`,
          status: "dry-run",
          chatTitle: selectedDialog.title || selectedDialog.id,
          time: nowIso,
          students: digest.summaryByGroup?.reduce((s, g) => s + (g.studentsCount || 0), 0) || 0,
        },
        ...prev,
      ].slice(0, 20));
      return;
    }
    setSendingNow(true);
    try {
      const res = await fetch("/api/send-trainer-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: selectedDialog.id,
          message: text,
          chatTitle: selectedDialog.title || selectedDialog.id,
          groupNames: digest.groupNames || [],
          studentsCount: digest.summaryByGroup?.reduce((s, g) => s + (g.studentsCount || 0), 0) || 0,
          triggerType: "manual",
        }),
      });
      const payload = await res.json().catch(() => ({}));
      const ok = res.ok;
      setLastActions((prev) => [
        {
          id: `send_${Date.now()}`,
          status: ok ? "sent" : "failed",
          chatTitle: selectedDialog.title || selectedDialog.id,
          time: nowIso,
          students: digest.summaryByGroup?.reduce((s, g) => s + (g.studentsCount || 0), 0) || 0,
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

  const todaySchedule = useMemo(() => {
    const day = new Date(`${today()}T12:00:00`).getDay();
    return (digest.scheduleByGroup || [])
      .filter((g) => g.enabled)
      .flatMap((g) => (g.windows || []).filter((w) => w.day === day).map((w) => ({
        groupName: g.groupName,
        sendTime: w.sendTime,
        trainingTime: w.trainingTime,
      })))
      .sort((a, b) => a.sendTime.localeCompare(b.sendTime));
  }, [digest.scheduleByGroup]);

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
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={regenerateFromTemplate} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.input, color: theme.textMain, padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Оновити з шаблону</button>
            <button type="button" onClick={copyToClipboard} style={{ border: "none", borderRadius: 10, background: theme.primary, color: "#fff", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Скопіювати</button>
            <button type="button" disabled={sendingNow} onClick={() => sendNow({ dryRun: true })} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.card, color: theme.textMain, padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Dry run</button>
            <button type="button" disabled={sendingNow} onClick={() => sendNow({ dryRun: false })} style={{ border: "none", borderRadius: 10, background: theme.success, color: "#fff", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>{sendingNow ? "Надсилання..." : "Надіслати"}</button>
          </div>
        </div>

        <textarea
          value={activeDraft}
          onChange={(e) => updateDraft(e.target.value)}
          rows={14}
          style={{ width: "100%", resize: "vertical", minHeight: 220, maxHeight: 520, overflow: "auto", background: theme.input, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 10, color: theme.textMain, lineHeight: 1.45, fontSize: 13 }}
          placeholder="Немає даних для дайджесту або не задано trainer_groups."
        />

        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, padding: 10, background: theme.input }}>
          <div style={{ fontWeight: 700, color: theme.textMain, marginBottom: 8 }}>Automation per group (день заняття, за 1 годину)</div>
          <div style={{ display: "grid", gap: 8 }}>
            {(digest.scheduleByGroup || []).map((g) => (
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
                  {(g.windows || []).length
                    ? g.windows.map((w) => `день ${w.day}: send ${w.sendTime} (тренування ${w.trainingTime})`).join(" • ")
                    : "Немає schedule"}
                </div>
              </label>
            ))}
          </div>
        </div>

        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, padding: 10, background: theme.input }}>
          <div style={{ fontWeight: 700, color: theme.textMain, marginBottom: 6 }}>Що буде надіслано сьогодні</div>
          {todaySchedule.length ? (
            <div style={{ display: "grid", gap: 4, fontSize: 12, color: theme.textMain }}>
              {todaySchedule.map((x, i) => <div key={`${x.groupName}_${x.sendTime}_${i}`}>• {x.groupName}: {x.sendTime} (заняття {x.trainingTime})</div>)}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: theme.textMuted }}>На сьогодні активних автосповіщень немає.</div>
          )}
        </div>

        {digest.automationReady && (
          <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 8, fontSize: 12, color: theme.textMuted, lineHeight: 1.45 }}>
            <div><strong>Automation-ready:</strong> {digest.automationReady.mode}</div>
            <div>Schedule: {digest.automationReady.recommendedSchedule}</div>
            <div>Selection: {digest.automationReady.groupSelection}</div>
          </div>
        )}

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

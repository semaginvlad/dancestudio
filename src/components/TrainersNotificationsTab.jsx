import React, { useEffect, useMemo, useState } from "react";
import { theme } from "../shared/constants";
import { buildTrainerMessageDraft, isTrainerChatByNote, parseTrainerGroups } from "../shared/trainerDigest";

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
    const draft = buildTrainerMessageDraft({
      groups: parsedGroups,
      students,
      membershipByStudent,
      subsByStudent,
      attn,
    });
    return {
      ...draft,
      groupNames: parsedGroups.map((g) => g.name),
    };
  }, [selectedDialog, groups, students, membershipByStudent, subsByStudent, attn, refreshVersion]);

  const copyToClipboard = async () => {
    if (!digest.text) return;
    try {
      await navigator.clipboard.writeText(digest.text);
      alert("Скопійовано");
    } catch {
      alert("Не вдалося скопіювати");
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
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => setRefreshVersion((v) => v + 1)} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.input, color: theme.textMain, padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Оновити</button>
            <button type="button" onClick={copyToClipboard} style={{ border: "none", borderRadius: 10, background: theme.primary, color: "#fff", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Скопіювати</button>
          </div>
        </div>

        <div style={{ whiteSpace: "pre-wrap", minHeight: 220, maxHeight: 520, overflow: "auto", background: theme.input, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 10, color: theme.textMain, lineHeight: 1.45 }}>
          {digest.text || "Немає даних для дайджесту або не задано trainer_groups."}
        </div>

        {digest.automationReady && (
          <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 8, fontSize: 12, color: theme.textMuted, lineHeight: 1.45 }}>
            <div><strong>Automation-ready:</strong> {digest.automationReady.mode}</div>
            <div>Schedule: {digest.automationReady.recommendedSchedule}</div>
            <div>Selection: {digest.automationReady.groupSelection}</div>
          </div>
        )}
      </div>
    </div>
  );
}
